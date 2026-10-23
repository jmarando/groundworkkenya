// The calls to Daraja Pulse, server to server, with Groundwork's job key. The key and the
// functions' base URL are secrets (PULSE_JOB_KEY, PULSE_FUNCTIONS_URL); neither is ever logged
// or sent to the browser. The contract is docs/superpowers/specs/2026-10-20-daraja-pulse-link-design.md.

/** How long Pulse has to answer. */
const TIMEOUT_MS = 20_000;

export const pulseConfigured = () =>
  !!process.env["PULSE_FUNCTIONS_URL"] && !!process.env["PULSE_JOB_KEY"];

/** Pulse's answer: its JSON and status, or why there is none. */
export async function callPulse(
  fn: "groundwork-brief" | "groundwork-report" | "groundwork-rapid",
  body: unknown,
): Promise<{ status: number; json: unknown } | { status: 0; json: null; why: string }> {
  const base = process.env["PULSE_FUNCTIONS_URL"];
  const key = process.env["PULSE_JOB_KEY"];
  if (!base || !key) return { status: 0, json: null, why: "Daraja Pulse isn't connected yet." };
  if (!/^https:\/\//.test(base))
    return { status: 0, json: null, why: "Daraja Pulse's address must be https." };
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-job-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    return { status: res.status, json };
  } catch (e) {
    console.error("Daraja Pulse call failed", fn, e instanceof Error ? e.name : "error");
    return { status: 0, json: null, why: "Couldn't reach Daraja Pulse. Try again shortly." };
  }
}
