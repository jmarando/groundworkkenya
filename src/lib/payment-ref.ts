// The reference that proves a payment, checked for its shape before it goes on the books: an
// M-Pesa code is the ten letters and digits on the confirmation SMS (SJK3L2M9QX), a bank or
// cheque reference carries a number. Pure.

/** An M-Pesa transaction code in capitals without spaces, or null when it isn't one. */
export function mpesaCode(raw: unknown): string | null {
  const c = String(raw ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return /^[A-Z][A-Z0-9]{9}$/.test(c) ? c : null;
}

export const MPESA_HINT =
  "An M-Pesa code is the 10 letters and numbers at the start of the confirmation SMS, like SJK3L2M9QX.";

/** A bank, cheque or other reference, tidied, or null when it has no number in it or is too short. */
export function bankRef(raw: unknown): string | null {
  const r = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (r.length < 4 || r.length > 40) return null;
  if (!/^[A-Za-z0-9 ./#-]+$/.test(r) || !/\d/.test(r)) return null;
  return r;
}

/**
 * The reference for a payment made by `method`, or the words to show when it won't do. Cash needs
 * none; anything typed for cash is kept as written.
 */
export function paymentRef(
  method: string,
  raw: unknown,
): { ok: true; ref: string | null } | { ok: false; error: string } {
  const typed = String(raw ?? "").trim();
  if (method === "cash") return { ok: true, ref: typed ? typed.slice(0, 80) : null };
  if (!typed)
    return {
      ok: false,
      error:
        method === "mpesa"
          ? "Add the M-Pesa code from the confirmation SMS."
          : method === "cheque"
            ? "Add the cheque number."
            : "Add the bank reference.",
    };
  if (method === "mpesa") {
    const code = mpesaCode(typed);
    return code
      ? { ok: true, ref: code }
      : { ok: false, error: `"${typed.slice(0, 20)}" isn't an M-Pesa code. ${MPESA_HINT}` };
  }
  const ref = bankRef(typed);
  return ref
    ? { ok: true, ref }
    : {
        ok: false,
        error:
          method === "cheque"
            ? "A cheque number is digits, like 000123."
            : "A bank reference has numbers in it, like FT26298ABC12.",
      };
}
