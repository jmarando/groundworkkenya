// Twilio: SMS (primary when a Twilio number is set) and voice.
//
// Calls go through the Lovable connector gateway with TWILIO_API_KEY; the
// gateway adds the account and its credentials. TWILIO_FROM_NUMBER is the
// Twilio number (E.164). Optional TWILIO_MESSAGING_SERVICE_SID sends through a
// messaging service instead (needed for an alphanumeric sender in Kenya).
//
// Twilio's callbacks carry ?token=<TWILIO_CALLBACK_TOKEN>, because the gateway
// keeps the auth token needed to check Twilio's own signature.

import type { AtBatchResult, AtRecipient } from "@/lib/at.server";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

/** SMS via Twilio only when TWILIO_SMS_ENABLED=true (number may be voice-only). */
export function twilioConfigured(): boolean {
  return Boolean(
    process.env["TWILIO_SMS_ENABLED"] === "true" &&
    process.env["LOVABLE_API_KEY"] &&
    process.env["TWILIO_API_KEY"] &&
    (process.env["TWILIO_FROM_NUMBER"] || process.env["TWILIO_MESSAGING_SERVICE_SID"]),
  );
}

export function twilioVoiceConfigured(): boolean {
  return Boolean(
    process.env["LOVABLE_API_KEY"] &&
    process.env["TWILIO_API_KEY"] &&
    process.env["TWILIO_FROM_NUMBER"],
  );
}

/** Public address Twilio calls back on. */
export function publicBase(): string {
  return (process.env["PUBLIC_BASE_URL"] ?? "https://groundwork.ke").replace(/\/$/, "");
}

export function callbackUrl(path: string): string {
  const t = process.env["TWILIO_CALLBACK_TOKEN"];
  return `${publicBase()}${path}${t ? `?token=${encodeURIComponent(t)}` : ""}`;
}

/** A callback address with the token and these parameters. */
export function callbackWith(path: string, params: Record<string, string>): string {
  const u = new URL(callbackUrl(path));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export async function twilioPost(
  path: string,
  params: Record<string, string | string[]>,
): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const res = await fetch(`${GATEWAY}${path}`, {
    signal: AbortSignal.timeout(20_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TWILIO_API_KEY"]!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // A list (StatusCallbackEvent) is sent as the same name repeated, as Twilio expects.
    body: new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]],
      ),
    ),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text };
}

/** Twilio error codes that apply to the whole account, not one number. */
const ACCOUNT_WIDE = new Set([20003, 21606, 21212, 21659, 20429, 30044]);

/** One text to one number. */
async function sendOne(digits: string, body: string): Promise<AtRecipient | { unknown: string }> {
  const params: Record<string, string> = {
    To: `+${digits}`,
    Body: body,
    StatusCallback: callbackUrl("/api/public/twilio/status"),
  };
  const svc = process.env["TWILIO_MESSAGING_SERVICE_SID"]?.trim();
  if (svc) params["MessagingServiceSid"] = svc;
  else params["From"] = process.env["TWILIO_FROM_NUMBER"]!.trim();

  let r: Awaited<ReturnType<typeof twilioPost>>;
  try {
    r = await twilioPost("/Messages.json", params);
  } catch (e) {
    return { unknown: `Network error reaching Twilio: ${(e as Error).message}` };
  }
  if (r.status >= 500 || !r.json) return { unknown: `Twilio ${r.status}: ${r.text.slice(0, 200)}` };
  if (r.status >= 200 && r.status < 300 && r.json["sid"]) {
    return {
      number: digits,
      ok: true,
      id: String(r.json["sid"]),
      costKes: null,
      error: "",
      accountWide: false,
    };
  }
  const code = Number(r.json["code"]);
  return {
    number: digits,
    ok: false,
    id: null,
    costKes: null,
    error: `Twilio ${code || r.status}: ${String(r.json["message"] ?? "refused").slice(0, 200)}`,
    accountWide: ACCOUNT_WIDE.has(code) || r.status === 401,
  };
}

/** Same contract as Africa's Talking's batch: one text, many numbers (digits only). */
export async function sendSmsBatchTwilio(digits: string[], body: string): Promise<AtBatchResult> {
  const recipients: AtRecipient[] = [];
  for (let i = 0; i < digits.length; i += 5) {
    const answers = await Promise.all(digits.slice(i, i + 5).map((d) => sendOne(d, body)));
    for (const a of answers) {
      if ("unknown" in a) {
        // Leave this one out: the outbox marks it outcome-unknown, never resent.
        continue;
      }
      recipients.push(a);
      if (a.accountWide) return { kind: "answered", recipients };
    }
  }
  if (!recipients.length) return { kind: "unknown", error: "Twilio gave no usable answer." };
  return { kind: "answered", recipients };
}

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

export function twiml(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

const EVENTS = ["initiated", "ringing", "answered", "completed"];

/**
 * Ring the team member first; when they pick up, connect them to the voter. The voter sees the
 * campaign's number, not the team member's. Every step is reported to call-status for `callId`
 * (voice_calls), so the screen can say where the call is.
 */
export async function bridgeCall(
  staffDigits: string,
  voterDigits: string,
  voterName: string,
  callId: string,
): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const from = process.env["TWILIO_FROM_NUMBER"]!.trim();
  // Without the callback token Twilio's reports would be refused, so none are asked for: the call
  // still connects, it just can't be followed on screen.
  const reports = Boolean(process.env["TWILIO_CALLBACK_TOKEN"]);
  const status = callbackWith("/api/public/twilio/call-status", { call: callId });
  const voter = callbackWith("/api/public/twilio/call-status", { call: callId, leg: "voter" });
  const action = reports ? ` action="${escapeXml(voter)}" method="POST"` : "";
  const inner =
    `<Say>Connecting you to ${escapeXml(voterName)}.</Say>` +
    `<Dial callerId="${escapeXml(from)}" timeout="30"${action}><Number>+${voterDigits}</Number></Dial>`;
  const r = await twilioPost("/Calls.json", {
    To: `+${staffDigits}`,
    From: from,
    Twiml: `<Response>${inner}</Response>`,
    ...(reports
      ? { StatusCallback: status, StatusCallbackEvent: EVENTS, StatusCallbackMethod: "POST" }
      : {}),
    Timeout: "30",
  });
  if (r.status >= 200 && r.status < 300 && r.json?.["sid"])
    return { ok: true, sid: String(r.json["sid"]) };
  return {
    ok: false,
    error: `Twilio ${String(r.json?.["code"] ?? r.status)}: ${String(r.json?.["message"] ?? r.text).slice(0, 200)}`,
  };
}

/**
 * An auto-call: Twilio rings the person and, when answered, fetches what to play from the
 * autocall address for `callId`; every step is reported to call-status. Answering machines are
 * told apart so a voicemail is counted as one.
 */
export async function autoCall(
  toDigits: string,
  callId: string,
): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const from = process.env["TWILIO_FROM_NUMBER"]!.trim();
  const r = await twilioPost("/Calls.json", {
    To: `+${toDigits}`,
    From: from,
    Url: callbackWith("/api/public/twilio/autocall", { call: callId }),
    Method: "POST",
    StatusCallback: callbackWith("/api/public/twilio/call-status", { call: callId }),
    StatusCallbackEvent: EVENTS,
    StatusCallbackMethod: "POST",
    MachineDetection: "Enable",
    Timeout: "30",
  });
  if (r.status >= 200 && r.status < 300 && r.json?.["sid"])
    return { ok: true, sid: String(r.json["sid"]) };
  return {
    ok: false,
    error: `Twilio ${String(r.json?.["code"] ?? r.status)}: ${String(r.json?.["message"] ?? r.text).slice(0, 200)}`,
  };
}
