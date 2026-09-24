import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time secret comparison. Hashing first gives both sides the same
 * length, so the comparison leaks neither the secret nor its length.
 */
export function tokenMatches(
  sent: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !sent) return false;
  const a = createHash("sha256").update(sent).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Africa's Talking does not sign its callbacks, so the callback URL carries a
 * secret instead: https://<host>/api/public/sms/inbound?token=<AT_CALLBACK_TOKEN>
 */
export function atCallbackAllowed(request: Request): boolean {
  const url = new URL(request.url);
  return tokenMatches(url.searchParams.get("token"), process.env["AT_CALLBACK_TOKEN"]);
}

/** Africa's Talking posts application/x-www-form-urlencoded. */
export async function readForm(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    for (const [k, v] of Object.entries(body ?? {})) out[k] = String(v ?? "");
    return out;
  }
  const form = await request.formData().catch(() => null);
  form?.forEach((v, k) => {
    out[k] = typeof v === "string" ? v : "";
  });
  return out;
}
