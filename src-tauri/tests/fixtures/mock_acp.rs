//! Mock ACP server for unit tests in `src/command/acp_client.rs`.
//!
//! Reads JSON-RPC 2.0 messages on stdin, writes canned responses
//! on stdout. Env vars switch in failure-mode behaviors so a
//! single fixture exercises every test path.
//!
//! Behaviors:
//! - default: handshake → session/new → session/prompt (3 update
//!   notifications + final result) → session/cancel (exit 0).
//! - `MOCK_ACP_GARBAGE_BEFORE_INIT=1`: emit a malformed line before
//!   the initialize response.
//! - `MOCK_ACP_DIE_ON_INIT=1`: read the initialize request and exit
//!   immediately without responding.

use std::env;
use std::io::{self, BufRead, Write};
use std::process::ExitCode;

use serde_json::{json, Value};

fn emit(stdout: &mut io::StdoutLock<'_>, msg: &Value) {
    let line = serde_json::to_string(msg).expect("mock_acp serialize");
    writeln!(stdout, "{line}").expect("mock_acp write");
    stdout.flush().expect("mock_acp flush");
}

fn main() -> ExitCode {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdin = stdin.lock();
    let mut stdout = stdout.lock();

    let garbage_before_init = env::var("MOCK_ACP_GARBAGE_BEFORE_INIT").is_ok();
    let die_on_init = env::var("MOCK_ACP_DIE_ON_INIT").is_ok();

    let mut line = String::new();
    loop {
        line.clear();
        let read = match stdin.read_line(&mut line) {
            Ok(0) => return ExitCode::SUCCESS, // EOF
            Ok(n) => n,
            Err(_) => return ExitCode::FAILURE,
        };
        if read == 0 || line.trim().is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[mock_acp] parse error: {e} — {line}");
                continue;
            }
        };

        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or("");
        let id = request.get("id").cloned();

        match method {
            "initialize" => {
                if die_on_init {
                    return ExitCode::SUCCESS;
                }
                if garbage_before_init {
                    writeln!(stdout, "this is not valid json").expect("write garbage");
                    stdout.flush().expect("flush garbage");
                }
                emit(
                    &mut stdout,
                    &json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "protocolVersion": 1,
                            "agentCapabilities": {},
                        },
                    }),
                );
            }
            "session/new" => {
                emit(
                    &mut stdout,
                    &json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "sessionId": "mock-sess-1",
                        },
                    }),
                );
            }
            "session/prompt" => {
                // 3 streaming notifications, then a final result.
                let session_id = request
                    .get("params")
                    .and_then(|p| p.get("sessionId"))
                    .and_then(Value::as_str)
                    .unwrap_or("mock-sess-1")
                    .to_string();
                for delta in ["Hello", " there", ", commander."] {
                    emit(
                        &mut stdout,
                        &json!({
                            "jsonrpc": "2.0",
                            "method": "session/update",
                            "params": {
                                "sessionId": session_id,
                                "update": {
                                    "sessionUpdate": "agent_message_chunk",
                                    "content": { "type": "text", "text": delta },
                                },
                            },
                        }),
                    );
                }
                emit(
                    &mut stdout,
                    &json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": { "stopReason": "end_turn" },
                    }),
                );
            }
            "session/cancel" => {
                return ExitCode::SUCCESS;
            }
            other => {
                eprintln!("[mock_acp] unknown method: {other}");
                emit(
                    &mut stdout,
                    &json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {
                            "code": -32601,
                            "message": format!("unknown method: {other}"),
                        },
                    }),
                );
            }
        }
    }
}
