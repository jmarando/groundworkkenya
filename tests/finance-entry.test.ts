// Checks for what Finance accepts when money is recorded by hand.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/finance-entry.test.ts

import { cleanContribution, cleanExpense } from "@/lib/finance.functions";

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
const refused = (name: string, fn: () => unknown, words: string) => {
  try {
    fn();
    eq(name, "accepted", words);
  } catch (e) {
    eq(name, (e as Error).message, words);
  }
};

const gift = {
  donorName: " Wanjiru Kamau ",
  donorType: "individual",
  amountKes: "10,000",
  method: "mpesa",
  reference: "SJK7Q2X9PL",
  receivedOn: "2026-10-20",
};
eq("a contribution, tidied", cleanContribution(gift), {
  donorName: "Wanjiru Kamau",
  donorType: "individual",
  amountKes: 10000,
  method: "mpesa",
  reference: "SJK7Q2X9PL",
  receivedOn: "2026-10-20",
});
eq(
  "cash needs no reference",
  cleanContribution({ ...gift, method: "cash", reference: "" }).reference,
  null,
);
refused(
  "M-Pesa needs its code",
  () => cleanContribution({ ...gift, reference: " " }),
  "Add the M-Pesa code from the confirmation SMS.",
);
refused(
  "random letters are not an M-Pesa code",
  () => cleanContribution({ ...gift, reference: "asdfgh" }),
  '"asdfgh" isn\'t an M-Pesa code. An M-Pesa code is the 10 letters and numbers at the start of the confirmation SMS, like SJK3L2M9QX.',
);
eq(
  "an M-Pesa code typed in small letters or with spaces is tidied",
  cleanContribution({ ...gift, reference: " sjk7 q2x9pl " }).reference,
  "SJK7Q2X9PL",
);
eq(
  "a bank reference and a cheque number are kept as written",
  [
    cleanContribution({ ...gift, method: "bank", reference: " FT26298ABC12 " }).reference,
    cleanContribution({ ...gift, method: "cheque", reference: "000123" }).reference,
  ],
  ["FT26298ABC12", "000123"],
);
refused(
  "a bank reference with no number in it",
  () => cleanContribution({ ...gift, method: "bank", reference: "paid" }),
  "A bank reference has numbers in it, like FT26298ABC12.",
);
refused(
  "no donor",
  () => cleanContribution({ ...gift, donorName: "" }),
  "Who gave it? Put the donor's name.",
);
refused(
  "no amount",
  () => cleanContribution({ ...gift, amountKes: "0" }),
  "Enter an amount in shillings above zero.",
);
refused(
  "an unknown method",
  () => cleanContribution({ ...gift, method: "crypto" }),
  "Say how it was paid.",
);
refused(
  "a date in the future",
  () => cleanContribution({ ...gift, receivedOn: "2099-01-01" }),
  "The date can't be in the future.",
);

const spend = {
  description: "Tents for the Kiambaa rally",
  category: "events",
  vendor: "Kiambu Tents Ltd",
  amountKes: 45000,
  reference: "",
  incurredOn: "2026-10-19",
};
eq(
  "an expense without a receipt yet is fine (it stays pending)",
  cleanExpense(spend).reference,
  null,
);
refused(
  "an unknown category",
  () => cleanExpense({ ...spend, category: "bribes" }),
  "Pick a category.",
);
refused(
  "no description",
  () => cleanExpense({ ...spend, description: "  " }),
  "Say what it was for.",
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
