// The AI gateway's streamed answer, read with care: the text it wrote and how it ended, so an
// answer cut off or refused says so instead of failing to parse; and any failure said in words a
// campaign can act on. Pure.

export type AiEnd = "completed" | "incomplete" | "failed" | "open";
export type AiAnswer = { text: string; end: AiEnd; reason: string | null };

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const words = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Reads the server-sent events of an OpenAI Responses stream, chunk by chunk. Frames split across
 * chunks are joined; malformed frames are skipped.
 */
export function aiStream() {
  let buffer = "";
  let text = "";
  let refusal = "";
  let end: AiEnd = "open";
  let reason: string | null = null;

  const take = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let evt: Record<string, unknown>;
    try {
      evt = rec(JSON.parse(data));
    } catch {
      return;
    }
    const type = evt["type"];
    const delta = typeof evt["delta"] === "string" ? evt["delta"] : "";
    if (type === "response.output_text.delta") text += delta;
    else if (type === "response.refusal.delta") refusal += delta;
    else if (type === "response.completed") end = "completed";
    else if (type === "response.incomplete") {
      end = "incomplete";
      reason = words(rec(rec(evt["response"])["incomplete_details"])["reason"]);
    } else if (type === "response.failed") {
      end = "failed";
      reason = words(rec(rec(evt["response"])["error"])["message"]);
    } else if (type === "error") {
      end = "failed";
      reason = words(evt["message"]) ?? words(rec(evt["error"])["message"]);
    }
  };

  return {
    push(chunk: string) {
      buffer = (buffer + chunk).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      frames.forEach(take);
    },
    finish(): AiAnswer {
      if (buffer.trim()) take(buffer);
      buffer = "";
      if (refusal && !text)
        return { text, end: "failed", reason: `refused: ${refusal.slice(0, 200)}` };
      return { text, end, reason };
    },
  };
}

/** Why an answer that came back can't be used, or null when it can. */
export function answerFault(a: AiAnswer): string | null {
  if (a.end === "incomplete") return `AI answer cut off (${a.reason ?? "incomplete"}).`;
  if (a.end === "failed") return `AI answer failed: ${a.reason ?? "no reason given"}.`;
  if (!a.text.trim()) return "AI answer empty.";
  return null;
}

export type AiTrouble = {
  kind: "credits" | "busy" | "refused" | "slow" | "cut" | "broken";
  /** What happened and what to do, for the person who pressed the button. */
  words: string;
  /** Whether asking again straight away may work. */
  retry: boolean;
};

/**
 * Any failure of an AI request in plain words. Reads the messages askAiJson throws ("AI stopped
 * (402): …", "AI took too long …", "AI answer cut off …") and a stray timeout or parse error.
 */
export function aiTrouble(err: unknown): AiTrouble {
  const e = rec(err);
  const message = words(e["message"]) ?? String(err ?? "");
  const status = typeof e["status"] === "number" ? e["status"] : null;
  const code = status ?? Number(/\((\d{3})\)/.exec(message)?.[1] ?? 0);
  if (code === 402 || /not enough credits|payment_required|insufficient/i.test(message))
    return {
      kind: "credits",
      words:
        "The AI has run out of credit. Groundwork's admin needs to check the AI account's billing; then try again.",
      retry: false,
    };
  if (code === 429)
    return {
      kind: "busy",
      words:
        "The AI is busy, or this month's spending cap is reached. Try again in a minute; if it keeps happening, Groundwork's admin should check the cap in Google AI Studio.",
      retry: true,
    };
  if (
    (code === 400 && /API key/i.test(message)) ||
    code === 401 ||
    code === 403 ||
    /not configured|refused:/i.test(message)
  )
    return {
      kind: "refused",
      words:
        "The AI turned the request down. Groundwork's admin needs to check the AI key (GEMINI_API_KEY in Groundwork's secrets in Lovable).",
      retry: false,
    };
  if (e["name"] === "TimeoutError" || /took too long|timed? ?out|aborted/i.test(message))
    return {
      kind: "slow",
      words: "The AI took too long to answer. Try again in a few minutes.",
      retry: false,
    };
  if (/cut off|empty|unreadable|JSON|Unexpected end|Unterminated/i.test(message))
    return {
      kind: "cut",
      words: "The AI's answer came back unfinished. Try again.",
      retry: true,
    };
  return {
    kind: "broken",
    words: `The AI couldn't answer (${message.slice(0, 160)}). Try again; if it keeps happening, tell Groundwork.`,
    retry: true,
  };
}
