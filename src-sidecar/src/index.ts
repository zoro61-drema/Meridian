import * as readline from "node:readline";
import { Agent, setGlobalDispatcher } from "undici";
import type { InboundMessage, OutboundEvent } from "./protocol.js";
import { cancelWorkflow, runWorkflow } from "./workflows/registry/lifecycle.js";

// Replace Node's default fetch dispatcher with one tuned for slow local-LLM
// inference. The two timeouts that matter here both default to 5 minutes
// (300_000 ms) on stock undici:
//   - headersTimeout: time the client will wait for response headers. Local
//     models running heavy prompt-eval on Apple Silicon (50k+ input tokens on
//     a 30B MoE) routinely exceed 5 min before the first byte streams back.
//   - bodyTimeout: idle time allowed between received body chunks. Same
//     vulnerability during the prompt-eval phase, before any tokens stream.
// Either expiring aborts the connection, which Ollama then reports as a 500.
// We bump both to 60 min and disable the body timeout entirely — workflows
// have their own AbortSignal (Stop Review) for user-initiated cancellation,
// so the network timeout is no longer needed as a safety net. Same dispatcher
// applies to Anthropic/Gemini API calls; both have their own server-side
// timeouts so the extra headroom is harmless.
setGlobalDispatcher(
  new Agent({
    headersTimeout: 60 * 60_000, // 60 min
    bodyTimeout: 0, // disabled — rely on the workflow AbortSignal instead
  }),
);

// Redirect non-protocol output away from stdout (which carries JSON only).
console.log = console.error;
console.info = console.error;
console.warn = console.error;
console.debug = console.error;

process.on("unhandledRejection", (reason) => {
  console.error("[sidecar:node] unhandledRejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[sidecar:node] uncaughtException:", err?.stack ?? err);
});

process.on("exit", (code) => {
  console.error(`[sidecar:node] process.exit code=${code}`);
});

process.on("beforeExit", (code) => {
  console.error(`[sidecar:node] beforeExit code=${code}`);
});

function emit(event: OutboundEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: InboundMessage;
  try {
    msg = JSON.parse(trimmed) as InboundMessage;
  } catch (err) {
    console.error("Failed to parse inbound message:", err);
    return;
  }

  switch (msg.type) {
    case "workflow.start":
      runWorkflow(msg, emit).catch((err) => {
        emit({ id: msg.id, type: "error", message: String(err) });
      });
      break;
    case "workflow.cancel":
      cancelWorkflow(msg.id);
      break;
    default: {
      const _exhaustive: never = msg;
      console.error("Unknown inbound message:", _exhaustive);
    }
  }
});

process.stdin.resume();

// Node 25 + piped stdin sometimes decides the event loop is empty even with
// an active readline 'line' listener, firing `beforeExit` between workflow
// invocations. A simple ref'd interval anchors the loop until Rust closes
// stdin. The callback writes a heartbeat that's filtered out by the Rust
// log filter — keeps Node from optimising away an empty body.
let heartbeat = 0;
const keepalive = setInterval(() => {
  heartbeat++;
}, 30_000);
process.stdin.on("end", () => {
  clearInterval(keepalive);
  rl.close();
});
