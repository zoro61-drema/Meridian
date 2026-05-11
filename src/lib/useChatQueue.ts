// Tiny shared hook every chat surface in the app uses to let the user
// type and "send" a message even while the agent is mid-turn. Sends
// dispatched while `busy` get pushed onto a local queue; the moment
// `busy` flips back to false, the first queued message is dispatched
// automatically and the rest stay queued in order.
//
// Pattern:
//
//   const { enqueueOrSend, queue } = useChatQueue({ send, busy });
//   <SlashCommandInput onSend={enqueueOrSend} ... />
//   // render queue items as muted "queued" bubbles in the chat list
//
// The chat's own `send` function only ever sees one message at a time —
// the queue handling lives entirely inside this hook, so each chat
// surface stays simple.

import { useCallback, useEffect, useRef, useState } from "react";

export function useChatQueue(args: {
  /** The chat's send action. Called with one message at a time. The
   *  hook never invokes it concurrently — it waits for `busy` to flip
   *  to false before dispatching the next queued item. */
  send: (text: string) => void | Promise<unknown>;
  /** True while the agent is processing the previous turn. Sends
   *  dispatched in this state get queued; sends dispatched in the
   *  false state go through immediately. */
  busy: boolean;
}): {
  enqueueOrSend: (text: string) => void;
  queue: string[];
} {
  const { send, busy } = args;
  const [queue, setQueue] = useState<string[]>([]);
  // Hold the latest `send` and `busy` in refs so the drain effect can
  // call into them without becoming a dependency (which would re-fire
  // the drain on every parent re-render and re-dispatch the same
  // message multiple times).
  const sendRef = useRef(send);
  const busyRef = useRef(busy);
  useEffect(() => {
    sendRef.current = send;
    busyRef.current = busy;
  });

  const enqueueOrSend = useCallback((text: string) => {
    if (busyRef.current) {
      setQueue((q) => [...q, text]);
    } else {
      void sendRef.current(text);
    }
  }, []);

  // Drain the queue when `busy` transitions to false. Only one message
  // is dispatched per drain — sending it usually flips `busy` back to
  // true, which holds the rest of the queue. The next `busy=false`
  // transition pulls the next item.
  useEffect(() => {
    if (busy) return;
    if (queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    void sendRef.current(next);
  }, [busy, queue]);

  return { enqueueOrSend, queue };
}
