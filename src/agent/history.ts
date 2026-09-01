import type { Message } from "../types.ts";

/**
 * Prepares and sanitizes the working message history for an agent run.
 * - Strips any leading duplicate system prompt from prior session history.
 * - Inserts the configured system prompt at index 0 (if provided).
 * - Appends prior session messages.
 * - Appends the new user query (avoiding consecutive duplicate user queries).
 */
export function buildWorkingHistory(
  query: string,
  history: readonly Message[] = [],
  systemPrompt?: string
): Message[] {
  const working: Message[] = [];

  // Filter out leading duplicate system prompts from prior history
  const priorHistory = history.filter((m, i) => !(i === 0 && m.role === "system"));

  // Include single system prompt if provided
  if (systemPrompt && systemPrompt.trim().length > 0) {
    working.push({
      role: "system",
      content: systemPrompt,
    });
  }

  // Add prior session history
  working.push(...priorHistory);

  // Add the new user query (avoid consecutive identical duplicate user prompts)
  const lastMsg = priorHistory[priorHistory.length - 1];
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== query) {
    working.push({
      role: "user",
      content: query,
    });
  }

  return working;
}
