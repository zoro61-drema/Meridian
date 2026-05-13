//! Local control server — exposes a small HTTP surface on
//! `127.0.0.1:31415` for external tooling (currently the
//! meridian-screenshot MCP server) to drive the running app
//! programmatically.
//!
//! Currently one endpoint:
//!   POST /navigate  { "screen": "<id>" }
//!     → emits the `meridian:navigate` Tauri event with the screen id;
//!       the frontend's listener in `App.tsx` switches to it.
//!
//! Bound to loopback only — no auth needed, only processes on the same
//! machine can reach it. The port is fixed; if it's already in use the
//! server logs a warning and skips starting so the app launches anyway.
//! That's intentional: this surface is a development convenience, not a
//! load-bearing feature.
//!
//! Built directly on `tokio::net::TcpListener` to avoid pulling in
//! axum/hyper just for a one-endpoint server. The HTTP/1.1 parsing here
//! is deliberately minimal — it handles exactly what we send from the
//! MCP server, nothing more.

use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

const BIND_ADDR: &str = "127.0.0.1:31415";

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(BIND_ADDR).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "[control-server] could not bind {BIND_ADDR}: {e} \
                     (continuing without external nav control)"
                );
                return;
            }
        };
        eprintln!("[control-server] listening on http://{BIND_ADDR}");
        let app = Arc::new(app);
        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = handle_conn(stream, app).await {
                            eprintln!("[control-server] connection error: {e}");
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[control-server] accept failed: {e}");
                    // Backoff briefly so we don't spin on a persistent error.
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            }
        }
    });
}

async fn handle_conn(mut stream: TcpStream, app: Arc<AppHandle>) -> std::io::Result<()> {
    // Read the request into a small buffer. The MCP server only POSTs
    // a tiny JSON body so 16 KiB is generous.
    let mut buf = vec![0u8; 16 * 1024];
    let n = stream.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }
    let text = String::from_utf8_lossy(&buf[..n]);

    // Split request line + headers from body.
    let (head, body) = match text.find("\r\n\r\n") {
        Some(idx) => (&text[..idx], &text[idx + 4..]),
        None => (&*text, ""),
    };
    let mut head_lines = head.lines();
    let request_line = head_lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    let (status, body_out) = match (method, path) {
        ("POST", "/navigate") => handle_navigate(body, &app),
        ("GET", "/health") => ("200 OK", "ok".to_string()),
        _ => ("404 Not Found", "unknown route".to_string()),
    };

    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {len}\r\n\
         Connection: close\r\n\
         \r\n\
         {body_out}",
        len = body_out.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.flush().await?;
    stream.shutdown().await.ok();
    Ok(())
}

fn handle_navigate(body: &str, app: &AppHandle) -> (&'static str, String) {
    #[derive(serde::Deserialize)]
    struct Req {
        screen: String,
    }
    let req: Req = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => {
            return (
                "400 Bad Request",
                json_error(&format!("invalid body: {e}")),
            );
        }
    };

    // Validate against the known screen ids — the frontend treats this
    // string as untrusted so anything unrecognized just lands as a
    // no-op there, but rejecting up front gives the MCP tool a clearer
    // error to surface back to the LLM.
    if !VALID_SCREENS.contains(&req.screen.as_str()) {
        return (
            "400 Bad Request",
            json_error(&format!(
                "unknown screen '{}'. Valid ids: {}",
                req.screen,
                VALID_SCREENS.join(", "),
            )),
        );
    }

    if let Err(e) = app.emit("meridian:navigate", &req.screen) {
        return (
            "500 Internal Server Error",
            json_error(&format!("emit failed: {e}")),
        );
    }
    ("200 OK", format!("{{\"ok\":true,\"screen\":\"{}\"}}", req.screen))
}

fn json_error(msg: &str) -> String {
    let escaped = msg.replace('\\', "\\\\").replace('"', "\\\"");
    format!("{{\"ok\":false,\"error\":\"{escaped}\"}}")
}

/// Screen ids the frontend's navigation reducer accepts. Mirrors the
/// `Screen` union in `src/App.tsx` (minus `loading` — that's an internal
/// boot state nothing should jump to externally).
const VALID_SCREENS: &[&str] = &[
    "landing",
    "onboarding",
    "settings",
    "agent-skills",
    "review-pr",
    "sprint-dashboard",
    "retrospectives",
    "ticket-quality",
    "meetings",
    "time-tracking",
];
