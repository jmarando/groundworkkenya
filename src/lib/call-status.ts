// What a call is doing, in words, from what Twilio reported (voice_calls, schema 42). Pure.
// An Inbox call has two legs: Twilio rings the team member first (status), then, once they
// answer, dials the voter (voter_status). An auto-call or a test call has one leg, to the person.

export type CallRow = {
  kind: "blast" | "test" | "bridge";
  status: string;
  voter_status?: string | null;
  answered_by?: string | null;
  duration?: number | null;
  digits?: string | null;
  error?: string | null;
};

export type CallView = {
  /** Still going: keep asking Twilio's reports. */
  live: boolean;
  tone: "busy" | "good" | "bad";
  text: string;
  /** Steps for an Inbox call, each done or not. */
  steps?: { label: string; done: boolean; failed?: boolean }[];
};

/** Twilio's error codes the team is most likely to meet, in plain words. */
const TWILIO_ERRORS: Record<string, string> = {
  "21210": "The campaign's Twilio number can't make calls yet.",
  "21211": "That phone number isn't valid.",
  "21214": "That phone number can't be reached.",
  "21215": "Calls to Kenya aren't switched on: enable Kenya under Voice geo permissions in Twilio.",
  "21216": "That number is blocked by Twilio.",
  "21217": "That phone number isn't valid.",
  "21219":
    "Twilio's trial only calls verified numbers: verify this number in Twilio or upgrade the account.",
  "13224": "That phone number isn't valid.",
  "13227": "Calls to this country aren't switched on in Twilio.",
  "20003": "Twilio refused the account's key.",
  "20429": "Twilio is busy; try again in a minute.",
  "11200": "Twilio couldn't reach Groundwork's call instructions.",
  "21220": "Twilio rejected the call setup.",
};

/** A Twilio error ("Twilio 21219: …", or a bare code) in plain words; the original otherwise. */
export function twilioError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = /(?:^|\D)(\d{5})(?:\D|$)/.exec(raw)?.[1];
  return (code && TWILIO_ERRORS[code]) || raw;
}

const ENDED = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);
const secs = (n: number | null | undefined) =>
  n && n > 0 ? ` (${n >= 60 ? `${Math.floor(n / 60)} min ${n % 60} s` : `${n} s`})` : "";

export function describeCall(c: CallRow): CallView {
  const err = twilioError(c.error);
  if (c.kind === "bridge") {
    const you = c.status;
    const them = c.voter_status ?? null;
    const youAnswered = you === "in-progress" || (you === "completed" && them !== null);
    const steps = [
      { label: "Ringing your line", done: you !== "queued" },
      {
        label: "Answered",
        done: youAnswered,
        failed: ["busy", "no-answer", "failed", "canceled"].includes(you) && !them,
      },
      {
        label: "Ringing the voter",
        done: them !== null,
        failed: them !== null && ["busy", "no-answer", "failed", "canceled"].includes(them),
      },
      { label: "Connected", done: them === "completed" || them === "answered" },
    ];
    if (err) return { live: false, tone: "bad", text: err, steps };
    if (them === "completed" || them === "answered")
      return {
        live: you === "in-progress",
        tone: "good",
        text: `Connected${secs(c.duration)}.`,
        steps,
      };
    if (them === "busy")
      return { live: false, tone: "bad", text: "The voter's line was busy.", steps };
    if (them === "no-answer")
      return { live: false, tone: "bad", text: "The voter didn't pick up.", steps };
    if (them === "failed" || them === "canceled")
      return { live: false, tone: "bad", text: "The call to the voter didn't go through.", steps };
    if (you === "no-answer")
      return {
        live: false,
        tone: "bad",
        text: "Your line wasn't answered, so the voter wasn't called.",
        steps,
      };
    if (you === "busy") return { live: false, tone: "bad", text: "Your line was busy.", steps };
    if (you === "failed" || you === "canceled")
      return { live: false, tone: "bad", text: "Twilio couldn't ring your line.", steps };
    if (you === "completed")
      return { live: false, tone: "bad", text: "The call ended before the voter answered.", steps };
    if (youAnswered)
      return { live: true, tone: "busy", text: "Answered. Now ringing the voter…", steps };
    if (you === "ringing")
      return { live: true, tone: "busy", text: "Ringing your line. Pick up.", steps };
    return { live: true, tone: "busy", text: "Placing the call…", steps };
  }
  if (err) return { live: false, tone: "bad", text: err };
  if (c.digits === "9")
    return { live: false, tone: "good", text: "Listened, then pressed 9: no more auto-calls." };
  switch (c.status) {
    case "queued":
    case "initiated":
      return { live: true, tone: "busy", text: "Placing the call…" };
    case "ringing":
      return { live: true, tone: "busy", text: "Ringing…" };
    case "in-progress":
      return { live: true, tone: "busy", text: "Answered: playing the message…" };
    case "completed":
      return c.answered_by?.startsWith("machine")
        ? { live: false, tone: "good", text: `Left on voicemail${secs(c.duration)}.` }
        : { live: false, tone: "good", text: `Answered and played${secs(c.duration)}.` };
    case "busy":
      return { live: false, tone: "bad", text: "Line busy." };
    case "no-answer":
      return { live: false, tone: "bad", text: "No answer." };
    default:
      return ENDED.has(c.status)
        ? { live: false, tone: "bad", text: "The call didn't go through." }
        : { live: true, tone: "busy", text: "Placing the call…" };
  }
}

export type BlastTally = {
  total: number;
  placing: number;
  answered: number;
  voicemail: number;
  missed: number;
  failed: number;
  stopped: number;
  /** Seconds listened, over the calls answered by a person. */
  listened: number;
};

/** An auto-call's calls, counted. */
export function tallyCalls(calls: CallRow[]): BlastTally {
  const t: BlastTally = {
    total: calls.length,
    placing: 0,
    answered: 0,
    voicemail: 0,
    missed: 0,
    failed: 0,
    stopped: 0,
    listened: 0,
  };
  for (const c of calls) {
    if (c.digits === "9") t.stopped++;
    if (c.error || c.status === "failed" || c.status === "canceled") t.failed++;
    else if (c.status === "busy" || c.status === "no-answer") t.missed++;
    else if (c.status === "completed") {
      if (c.answered_by?.startsWith("machine")) t.voicemail++;
      else {
        t.answered++;
        t.listened += c.duration ?? 0;
      }
    } else t.placing++;
  }
  return t;
}

/** Words for a phone number as Kenya writes it, to digits with the country code; "" when not one. */
export function phoneDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^[17]\d{8}$/.test(d)) return `254${d}`;
  if (/^254[17]\d{8}$/.test(d)) return d;
  return /^\d{9,15}$/.test(d) && !d.startsWith("0") ? d : "";
}

/** About how long a script takes to say, in seconds (150 words a minute). */
export const speakingSeconds = (script: string) =>
  Math.round((script.trim().split(/\s+/).filter(Boolean).length / 150) * 60);
