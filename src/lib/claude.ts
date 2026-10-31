// Anthropic's Claude, called with the campaign's own key (ANTHROPIC_API_KEY) when Gemini cannot
// answer: the request, and the answer read with care, so one that was cut off or declined says so
// instead of failing to parse. Plain fetch like Gemini's, so there is no new package to install.
// Pure; src/lib/listening.server.ts makes the call.

import type { AiAnswer } from "./ai-answer";
import type { AiTier } from "./gemini";

/**
 * The model each tier asks. Haiku 5.5 is the cheapest of the family and takes a forced tool, which
 * is how the JSON comes back. Sonnet 5.5 and Opus 5.5 refuse a forced tool (they want `auto` and a
 * line in the prompt naming the tool), so moving a tier to one of them means changing `claudeBody`.
 */
export const CLAUDE_MODELS: Record<AiTier, string> = {
  read: "claude-haiku-5-5",
  write: "claude-haiku-5-5",
};

export const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
/** The version of Anthropic's API the request is written for. */
export const CLAUDE_VERSION = "2026-10-21";

const TOOL = "answer";

/** The request: the prompt, and the answer as the input of the one tool Claude must call. */
export function claudeBody(model: string, prompt: string, schema: object) {
  return {
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    tools: [
      { name: TOOL, description: "Give the answer, as this schema says.", input_schema: schema },
    ],
    tool_choice: { type: "tool", name: TOOL },
  };
}

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const words = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The answer Claude gave as the tool's input, written out as JSON text, and how it ended. */
export function claudeAnswer(json: unknown): AiAnswer {
  const top = rec(json);
  const stop = words(top["stop_reason"]);
  if (stop === "refusal") return { text: "", end: "failed", reason: "it declined to answer" };

  const content = top["content"];
  const call = (Array.isArray(content) ? content : [])
    .map(rec)
    .find((block) => block["type"] === "tool_use" && block["name"] === TOOL);
  if (!call) return { text: "", end: "failed", reason: "no answer came back" };

  const text = JSON.stringify(call["input"] ?? {});
  if (stop === "max_tokens")
    return { text, end: "incomplete", reason: "the answer reached its length limit" };
  return { text, end: "completed", reason: null };
}

/** Claude's own words for a refused request ("rate_limit_error: …"), cut short. */
export function claudeError(body: string): string {
  try {
    const e = rec(rec(JSON.parse(body))["error"]);
    const type = words(e["type"]);
    const message = words(e["message"]);
    if (type || message) return [type, message].filter(Boolean).join(": ").slice(0, 180);
  } catch {
    /* not JSON */
  }
  return body.slice(0, 180);
}
