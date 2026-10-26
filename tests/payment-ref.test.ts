// Checks for the references that prove a payment (M-Pesa codes, bank and cheque references) and
// for email addresses as typed. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/payment-ref.test.ts

import { emailAddress } from "@/lib/email";
import { bankRef, mpesaCode, paymentRef } from "@/lib/payment-ref";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

eq(
  "M-Pesa codes: ten letters and digits starting with a letter, in capitals",
  ["SJK3L2M9QX", "sjk3l2m9qx", " SJK3 L2M9 QX ", "RKT55XYZ1A"].map(mpesaCode),
  ["SJK3L2M9QX", "SJK3L2M9QX", "SJK3L2M9QX", "RKT55XYZ1A"],
);
eq(
  "not M-Pesa codes: too short, too long, a digit first, symbols, nothing",
  ["asdfgh", "SJK3L2M9QXX", "1JK3L2M9QX", "SJK3L2M9Q-", "", null, undefined].map(mpesaCode),
  [null, null, null, null, null, null, null],
);
eq(
  "bank and cheque references need a number and a sensible length",
  ["FT26298ABC12", "000123", "Ref 12/2026", "paid", "12", "x".repeat(41), "<script>1"].map(bankRef),
  ["FT26298ABC12", "000123", "Ref 12/2026", null, null, null, null],
);
eq(
  "the reference a payment method needs",
  [
    paymentRef("cash", ""),
    paymentRef("cash", "envelope 4"),
    paymentRef("mpesa", ""),
    paymentRef("cheque", ""),
    paymentRef("bank", " "),
    paymentRef("mpesa", "sjk3l2m9qx"),
  ],
  [
    { ok: true, ref: null },
    { ok: true, ref: "envelope 4" },
    { ok: false, error: "Add the M-Pesa code from the confirmation SMS." },
    { ok: false, error: "Add the cheque number." },
    { ok: false, error: "Add the bank reference." },
    { ok: true, ref: "SJK3L2M9QX" },
  ],
);
eq(
  "email addresses: tidied, and the shapes that can't be one refused",
  [
    " Wanjiru@Example.co.ke ",
    "a@b.ke",
    "a@",
    "a@b",
    "@b.ke",
    "a b@c.ke",
    "a@b..ke",
    "name@example.c",
  ].map(emailAddress),
  ["wanjiru@example.co.ke", "a@b.ke", null, null, null, null, null, null],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
