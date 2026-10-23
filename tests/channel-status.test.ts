// Checks for Inbox's channel card: each pill follows what is actually set up.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/channel-status.test.ts

import { channelStatuses, type ChannelFacts } from "@/lib/channel-status";

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

const bare: ChannelFacts = {
  smsLive: false,
  smsProvider: false,
  ussd: false,
  own: {},
  accounts: {},
};
const pills = (f: ChannelFacts) => channelStatuses(f).map((c) => `${c.code}:${c.label}`);

eq("nothing set up says so, never Ready", pills(bare), [
  "SMS:No provider",
  "US:No provider",
  "EM:Not set up",
  "FB:Not connected",
  "IG:Not connected",
  "X:Not connected",
  "TT:Listening only",
  "WA:Not set up",
]);
eq(
  "a provider without the live switch stages",
  pills({ ...bare, smsProvider: true })[0],
  "SMS:Staged, not sending",
);
const set = channelStatuses({
  smsLive: true,
  smsProvider: true,
  ussd: true,
  own: {
    email: { status: "pending", identifier: "githunguri" },
    whatsapp: { status: "live", identifier: "+254700000000" },
  },
  accounts: {
    facebook: { live: true, handle: "HonGathoniWamuchomba" },
    x: { live: false, handle: "hon_wamuchomba" },
  },
});
eq(
  "what is set up",
  set.map((c) => `${c.code}:${c.label}`),
  [
    "SMS:Ready",
    "US:Ready",
    "EM:Being set up",
    "FB:Ready",
    "IG:Not connected",
    "X:Connected, not live",
    "TT:Listening only",
    "WA:Ready",
  ],
);
eq("the handle is named", set[3]?.name, "Messenger (HonGathoniWamuchomba)");
eq(
  "the reply address is named",
  set[2]?.note,
  "Replies come back to githunguri+…@in.groundwork.ke.",
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
