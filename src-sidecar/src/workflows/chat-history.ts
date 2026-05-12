import { z } from "zod";

/** Zod schema for one entry of a chat-history JSON array sent from the
 *  frontend. PR Review Chat and Grooming Chat both consume this shape —
 *  it stays here so the two callers don't drift on what `role` strings
 *  the frontend can send.
 *
 *  Only 'user' and 'assistant' are accepted; system prompts are built
 *  by the workflow itself and tool turns aren't produced by the
 *  frontend (chat workflows don't bind tools post-2026-05-12 pivot). */
export const ChatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;
