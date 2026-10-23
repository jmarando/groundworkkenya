// Checks for poll thank-you airtime: reading Africa's Talking's reply and the amounts it sends.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/airtime.test.ts

import { interpretAirtimeReply } from "@/lib/at.server";
import { airtimeAmount } from "@/lib/outbox.server";

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

const sent = JSON.stringify({
  errorMessage: "None",
  numSent: 1,
  responses: [
    {
      phoneNumber: "+254711000001",
      amount: "KES 20.0000",
      status: "Sent",
      requestId: "ATQid_1",
      errorMessage: "None",
    },
    {
      phoneNumber: "+254711000002",
      amount: "KES 20.0000",
      status: "Failed",
      requestId: "None",
      errorMessage: "Insufficient Credit",
    },
  ],
});
const r = interpretAirtimeReply(201, sent);
eq("answered per number", r.kind, "answered");
if (r.kind === "answered") {
  eq(
    "sent: id and cost",
    [r.recipients[0]?.ok, r.recipients[0]?.id, r.recipients[0]?.costKes],
    [true, "ATQid_1", 20],
  );
  eq(
    "failed: the reason, and it stops the run",
    [r.recipients[1]?.ok, r.recipients[1]?.error, r.recipients[1]?.accountWide],
    [false, "Insufficient Credit", true],
  );
}
eq(
  "nothing sent is a refusal",
  interpretAirtimeReply(200, JSON.stringify({ errorMessage: "Invalid amount", responses: [] }))
    .kind,
  "refused",
);
eq("a server error is unknown", interpretAirtimeReply(502, "bad gateway").kind, "unknown");
eq("an unreadable reply is unknown", interpretAirtimeReply(200, "<html>").kind, "unknown");
eq(
  "a 401 is a refusal",
  interpretAirtimeReply(401, "The supplied authentication is invalid").kind,
  "refused",
);

eq(
  "amounts: whole shillings from 5",
  [
    airtimeAmount("20"),
    airtimeAmount(" 5 "),
    airtimeAmount("4"),
    airtimeAmount("10.5"),
    airtimeAmount("x"),
  ],
  [20, 5, null, null, null],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
