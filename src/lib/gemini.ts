// Google's Gemini API, called with the campaign's own key (GEMINI_API_KEY): the request, and the
// answer read with care, so one that was cut off, blocked or refused says so instead of failing to
// parse. Pure; src/lib/listening.server.ts makes the call.

import type { AiAnswer } from "./ai-answer";

/** Reading posts in bulk (moods) uses the cheaper model; anything written for a person, the better one. */
export const GEMINI_MODELS = {
  read: "gemini-3.5-flash-lite",
  write: "gemini-3.8-flash",
} as const;
export type AiTier = keyof typeof GEMINI_MODELS;

export const geminiUrl = (tier: AiTier) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[tier]}:generateContent`;

/** The request: the prompt, and the answer held to the schema as JSON. */
export function geminiBody(prompt: string, schema: object) {
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
  };
}

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const words = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The text Gemini wrote and how it ended; thinking it did on the way is left out. */
export function geminiAnswer(json: unknown): AiAnswer {
  const top = rec(json);
  const blocked = words(rec(top["promptFeedback"])["blockReason"]);
  if (blocked) return { text: "", end: "failed", reason: `the request was blocked (${blocked})` };

  const candidates = top["candidates"];
  const first = rec(Array.isArray(candidates) ? candidates[0] : null);
  const parts = rec(first["content"])["parts"];
  const text = (Array.isArray(parts) ? parts : [])
    .map(rec)
    .filter((p) => p["thought"] !== true && typeof p["text"] === "string")
    .map((p) => p["text"] as string)
    .join("");
  const finish = words(first["finishReason"]);

  if (!finish && !text) return { text, end: "failed", reason: "no answer came back" };
  if (finish === "MAX_TOKENS")
    return { text, end: "incomplete", reason: "the answer reached its length limit" };
  if (finish && finish !== "STOP")
    return {
      text,
      end: "failed",
      reason: `it stopped with ${finish.toLowerCase().replace(/_/g, " ")}`,
    };
  return { text, end: "completed", reason: null };
}

/** Gemini's own words for a refused request ("PERMISSION_DENIED: …"), cut short. */
export function geminiError(body: string): string {
  try {
    const e = rec(rec(JSON.parse(body))["error"]);
    const status = words(e["status"]);
    const message = words(e["message"]);
    if (status || message) return [status, message].filter(Boolean).join(": ").slice(0, 180);
  } catch {
    /* not JSON */
  }
  return body.slice(0, 180);
}

/** Whether the key itself was turned away (wrong, expired or switched off), rather than a limit reached. */
export const geminiKeyRefused = (status: number, body: string): boolean =>
  status === 401 || (status === 400 && /API[ _]KEY[ _](NOT[ _]VALID|INVALID|EXPIRED)/i.test(body));
