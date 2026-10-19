// The calls to Safaricom's Daraja API for M-Pesa payouts (B2C). Every credential is a secret and
// none is logged:
//   MPESA_ENV                    sandbox (default) or production
//   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET   the Daraja app's keys
//   MPESA_SHORTCODE              the B2C shortcode money is paid from
//   MPESA_INITIATOR_NAME         the API operator Safaricom set up for it
//   MPESA_SECURITY_CREDENTIAL    that operator's password, encrypted with Safaricom's certificate
//   MPESA_CALLBACK_TOKEN         a long random secret; the callbacks carry it in ?token=
//   PUBLIC_APP_URL               where M-Pesa reaches us, e.g. https://groundwork.ke

import { b2cRequest } from "@/lib/mpesa";

const TIMEOUT_MS = 20_000;

const env = (k: string) => process.env[k] ?? "";

export function mpesaConfigured(): boolean {
  return [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_INITIATOR_NAME",
    "MPESA_SECURITY_CREDENTIAL",
    "MPESA_CALLBACK_TOKEN",
    "PUBLIC_APP_URL",
  ].every((k) => env(k));
}

const base = () =>
  env("MPESA_ENV") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

async function accessToken(): Promise<string> {
  const basic = Buffer.from(
    `${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`,
  ).toString("base64");
  const res = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!res.ok || !json?.access_token) throw new Error("M-Pesa didn't let us sign in.");
  return json.access_token;
}

/**
 * Sends one payout. Accepted means M-Pesa has queued it; the result arrives later at the callback.
 * A refusal M-Pesa answered means nothing was sent. When no answer came (the network dropped or
 * timed out) the money may still go, so `unclear` says to check the statement before paying again.
 */
export async function sendB2C(p: {
  requestId: string;
  phone: string;
  amountKes: number;
  remarks: string;
}): Promise<{ accepted: true } | { accepted: false; unclear: boolean; why: string }> {
  const app = env("PUBLIC_APP_URL").replace(/\/+$/, "");
  const token = encodeURIComponent(env("MPESA_CALLBACK_TOKEN"));
  const body = b2cRequest(
    {
      shortcode: env("MPESA_SHORTCODE"),
      initiatorName: env("MPESA_INITIATOR_NAME"),
      securityCredential: env("MPESA_SECURITY_CREDENTIAL"),
      resultUrl: `${app}/api/public/mpesa/b2c-result?token=${token}`,
      timeoutUrl: `${app}/api/public/mpesa/b2c-timeout?token=${token}`,
    },
    p,
  );
  try {
    const res = await fetch(`${base()}/mpesa/b2c/v3/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as {
      ResponseCode?: string;
      errorMessage?: string;
      ResponseDescription?: string;
    } | null;
    if (res.ok && json?.ResponseCode === "0") return { accepted: true };
    return {
      accepted: false,
      unclear: res.status >= 500 || !json,
      why: (json?.errorMessage ?? json?.ResponseDescription ?? "M-Pesa refused it.").slice(0, 200),
    };
  } catch (e) {
    console.error("M-Pesa payout request failed", e instanceof Error ? e.name : "error");
    return {
      accepted: false,
      unclear: true,
      why: "No answer from M-Pesa. Check the statement before paying again.",
    };
  }
}
