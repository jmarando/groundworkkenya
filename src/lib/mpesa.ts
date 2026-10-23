// M-Pesa payouts (Safaricom Daraja B2C): the request a stipend becomes and what M-Pesa's answer
// says. Pure. The calls are src/lib/mpesa.server.ts; the callbacks /api/public/mpesa/b2c-*.

/** A Kenyan mobile number as M-Pesa wants it: 2547XXXXXXXX or 2541XXXXXXXX; null if it isn't one. */
export function msisdn(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[\s-]/g, "");
  const m = d.match(/^(?:\+?254|0)([71]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

export type B2CConfig = {
  shortcode: string;
  initiatorName: string;
  securityCredential: string;
  resultUrl: string;
  timeoutUrl: string;
};

/** The payment request body for one stipend: whole shillings, to one phone. */
export function b2cRequest(
  c: B2CConfig,
  p: { requestId: string; phone: string; amountKes: number; remarks: string },
) {
  const to = msisdn(p.phone);
  if (!to) throw new Error("That isn't an M-Pesa number.");
  const amount = Math.round(p.amountKes);
  if (!Number.isFinite(amount) || amount < 10 || amount > 150_000)
    throw new Error("M-Pesa pays KES 10 to 150,000 at a time.");
  return {
    OriginatorConversationID: p.requestId,
    InitiatorName: c.initiatorName,
    SecurityCredential: c.securityCredential,
    CommandID: "BusinessPayment",
    Amount: amount,
    PartyA: c.shortcode,
    PartyB: to,
    Remarks: p.remarks.slice(0, 100) || "Stipend",
    QueueTimeOutURL: c.timeoutUrl,
    ResultURL: c.resultUrl,
    Occasion: "Stipend",
  };
}

/** M-Pesa's result callback, read without trust: the request it answers, and paid or why not. */
export function readB2CResult(
  body: unknown,
):
  | { request: string; ok: true; receipt: string }
  | { request: string; ok: false; error: string }
  | null {
  const r = ((body ?? {}) as { Result?: Record<string, unknown> }).Result;
  if (!r || typeof r !== "object") return null;
  const request =
    typeof r["OriginatorConversationID"] === "string" ? r["OriginatorConversationID"] : "";
  if (!/^GW-[0-9a-f]{32}$/.test(request)) return null;
  const code = Number(r["ResultCode"]);
  const receipt = typeof r["TransactionID"] === "string" ? r["TransactionID"] : "";
  if (code === 0 && /^[A-Z0-9]{8,14}$/.test(receipt)) return { request, ok: true, receipt };
  const desc = typeof r["ResultDesc"] === "string" ? r["ResultDesc"] : "M-Pesa declined it.";
  return { request, ok: false, error: desc.slice(0, 200) };
}
