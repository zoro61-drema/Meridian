//! Integration tests for the Command Phase 1 ACP client.
//!
//! Spawns `mock_acp` (the fixture binary at
//! `tests/fixtures/mock_acp.rs`) and exercises the JSON-RPC client
//! through every code path that doesn't require a real backend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use meridian_lib::command::acp_client::AcpClient;
use meridian_lib::command::acp_spawn::AcpLaunchConfig;

fn mock_acp_config() -> AcpLaunchConfig {
    AcpLaunchConfig {
        binary: env!("CARGO_BIN_EXE_mock_acp").to_string(),
        args: vec![],
        env: HashMap::new(),
        cwd: PathBuf::from(env!("CARGO_MANIFEST_DIR")),
    }
}

#[tokio::test]
async fn handshake_roundtrip() {
    let (client, _rx) = AcpClient::spawn(mock_acp_config()).await.unwrap();
    let result = client.initialize().await.unwrap();
    assert_eq!(result["protocolVersion"], serde_json::json!(1));
    client.shutdown().await.unwrap();
}

#[tokio::test]
async fn session_lifecycle_streams_then_completes() {
    let (client, mut rx) = AcpClient::spawn(mock_acp_config()).await.unwrap();
    let client = Arc::new(client);
    client.initialize().await.unwrap();
    let session_id = client.session_new(&PathBuf::from("/tmp"), vec![]).await.unwrap();
    assert!(!session_id.is_empty());

    // session/prompt resolves once the server emits a final result.
    // The mock fires 3 notifications then resolves.
    let prompt_handle = {
        let client = client.clone();
        let sid = session_id.clone();
        tokio::spawn(async move { client.session_prompt(&sid, "hi".to_string()).await })
    };

    let mut updates = 0;
    for _ in 0..3 {
        let notif = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("notification timeout")
            .expect("channel closed");
        assert_eq!(notif.method, "session/update");
        updates += 1;
    }
    assert_eq!(updates, 3);

    let final_result = prompt_handle.await.unwrap().unwrap();
    assert_eq!(final_result["stopReason"], serde_json::json!("end_turn"));

    client.shutdown().await.unwrap();
}

#[tokio::test]
async fn cancel_is_fire_and_forget() {
    let (client, _rx) = AcpClient::spawn(mock_acp_config()).await.unwrap();
    client.initialize().await.unwrap();
    let session_id = client.session_new(&PathBuf::from("/tmp"), vec![]).await.unwrap();
    // No assertion needed — mock_acp exits 0 after receiving cancel
    // and the call returns Ok without waiting for a response.
    client.session_cancel(&session_id).await.unwrap();
    let _ = client.shutdown().await;
}

#[tokio::test]
async fn malformed_line_is_logged_not_fatal() {
    // The mock emits one malformed line right before responding to
    // initialize. The dispatch should log + continue, and the
    // initialize response should still come through normally.
    let mut config = mock_acp_config();
    config
        .env
        .insert("MOCK_ACP_GARBAGE_BEFORE_INIT".to_string(), "1".to_string());
    let (client, _rx) = AcpClient::spawn(config).await.unwrap();
    let result = client.initialize().await.unwrap();
    assert_eq!(result["protocolVersion"], serde_json::json!(1));
    client.shutdown().await.unwrap();
}

#[tokio::test]
async fn process_death_returns_error() {
    let mut config = mock_acp_config();
    config
        .env
        .insert("MOCK_ACP_DIE_ON_INIT".to_string(), "1".to_string());
    let (client, _rx) = AcpClient::spawn(config).await.unwrap();
    let err = client.initialize().await.expect_err("should error");
    assert!(
        err.contains("exited") || err.contains("dropped") || err.contains("timed out"),
        "unexpected error: {err}",
    );
}
