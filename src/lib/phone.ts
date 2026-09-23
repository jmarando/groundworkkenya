// Kenyan phone numbers arrive in every shape: 0712…, 712…, 254712…, +254 712 …,
// 0110…. Everything is stored as E.164 (+2547XXXXXXXX / +2541XXXXXXXX), so a
// person is one row however they first reached the campaign.

/** Normalise to E.164, or null if it is not a Kenyan mobile number. */
export function normalizeKePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("254")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  // Safaricom, Airtel and Telkom mobile ranges start with 7 or 1, then 8 digits.
  if (!/^[17]\d{8}$/.test(d)) return null;
  return "+254" + d;
}

/**
 * For display: +254 712 ••• 448. Anywhere a number is shown to someone who
 * does not need to dial it — lists, exports, logs.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = e164.match(/^\+254(\d{3})(\d{3})(\d{3})$/);
  return m ? `+254 ${m[1]} ••• ${m[3]}` : e164;
}
