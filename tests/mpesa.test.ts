// Checks for M-Pesa payouts: phone numbers as M-Pesa wants them, the payout request, and reading
// M-Pesa's result without trusting it. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/mpesa.test.ts

import { b2cRequest, msisdn, readB2CResult } from "@/lib/mpesa";

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
const throws = (name: string, f: () => unknown, msg: string) => {
  try {
    f();
    eq(name, "no error", msg);
  } catch (e) {
    eq(name, (e as Error).message, msg);
  }
};

eq("07…", msisdn("0712 345 678"), "254712345678");
eq("+254…", msisdn("+254112345678"), "254112345678");
eq("254…", msisdn("254712-345-678"), "254712345678");
eq("not a mobile", msisdn("0201234567"), null);
eq("nothing", msisdn(null), null);

const c = {
  shortcode: "600000",
  initiatorName: "api",
  securityCredential: "enc",
  resultUrl: "https://x/r",
  timeoutUrl: "https://x/t",
};
const req = b2cRequest(c, {
  requestId: "GW-1",
  phone: "0712345678",
  amountKes: 1499.6,
  remarks: "Stipend Wanjiru",
});
eq(
  "a payout request",
  [req.PartyB, req.Amount, req.CommandID, req.OriginatorConversationID, req.PartyA],
  ["254712345678", 1500, "BusinessPayment", "GW-1", "600000"],
);
throws(
  "not a phone",
  () => b2cRequest(c, { requestId: "GW-1", phone: "12", amountKes: 100, remarks: "" }),
  "That isn't an M-Pesa number.",
);
throws(
  "too little",
  () => b2cRequest(c, { requestId: "GW-1", phone: "0712345678", amountKes: 5, remarks: "" }),
  "M-Pesa pays KES 10 to 150,000 at a time.",
);

const id = "GW-" + "a".repeat(32);
eq(
  "paid",
  readB2CResult({
    Result: {
      ResultCode: 0,
      OriginatorConversationID: id,
      TransactionID: "RKT55XYZ1A",
      ResultDesc: "ok",
    },
  }),
  { request: id, ok: true, receipt: "RKT55XYZ1A" },
);
eq(
  "declined",
  readB2CResult({
    Result: {
      ResultCode: 2001,
      OriginatorConversationID: id,
      ResultDesc: "The initiator information is invalid.",
    },
  }),
  { request: id, ok: false, error: "The initiator information is invalid." },
);
eq(
  "someone else's request id is ignored",
  readB2CResult({
    Result: { ResultCode: 0, OriginatorConversationID: "X-1", TransactionID: "RKT55XYZ1A" },
  }),
  null,
);
eq(
  "a success with no receipt is not paid",
  readB2CResult({ Result: { ResultCode: 0, OriginatorConversationID: id } })?.ok,
  false,
);
eq("junk", readB2CResult("junk"), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
