// Checks for how calls are described: an Inbox call's two legs, an auto-call's outcomes, Twilio's
// errors in plain words, phone numbers as Kenya writes them.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/call-status.test.ts

import {
  describeCall,
  phoneDigits,
  speakingSeconds,
  tallyCalls,
  twilioError,
} from "@/lib/call-status";

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

const bridge = (status: string, voter_status: string | null = null, error: string | null = null) =>
  describeCall({ kind: "bridge", status, voter_status, error });
eq("ringing you", bridge("ringing").text, "Your phone is ringing. Pick up.");
eq(
  "you answered, voter ringing",
  [bridge("in-progress").text, bridge("in-progress").live],
  ["You're on. Now ringing the voter…", true],
);
eq(
  "you didn't answer",
  bridge("no-answer").text,
  "Your phone wasn't answered, so the voter wasn't called.",
);
eq(
  "voter didn't answer",
  [bridge("completed", "no-answer").text, bridge("completed", "no-answer").live],
  ["The voter didn't pick up.", false],
);
eq("connected", bridge("in-progress", "answered").tone, "good");
eq(
  "steps",
  bridge("in-progress", "answered").steps!.map((s) => s.done),
  [true, true, true, true],
);
eq(
  "trial account explained",
  bridge("failed", null, "Twilio 21219: The number is unverified").text.startsWith(
    "Twilio's trial only calls verified numbers",
  ),
  true,
);
eq("geo permission explained", twilioError("21215")!.includes("Voice geo permissions"), true);
eq("an unknown error kept", twilioError("Something odd"), "Something odd");

const blast = (status: string, extra: Record<string, unknown> = {}) =>
  describeCall({ kind: "blast", status, ...extra });
eq(
  "voicemail",
  blast("completed", { answered_by: "machine_end_beep", duration: 31 }).text,
  "Left on voicemail (31 s).",
);
eq(
  "answered",
  blast("completed", { answered_by: "human", duration: 75 }).text,
  "Answered and played (1 min 15 s).",
);
eq(
  "pressed 9",
  blast("completed", { digits: "9" }).text,
  "Listened, then pressed 9: no more auto-calls.",
);

const t = tallyCalls([
  { kind: "blast", status: "completed", answered_by: "human", duration: 40 },
  { kind: "blast", status: "completed", answered_by: "machine_start", duration: 20 },
  { kind: "blast", status: "no-answer" },
  { kind: "blast", status: "failed", error: "21211" },
  { kind: "blast", status: "ringing" },
  { kind: "blast", status: "completed", answered_by: "human", duration: 10, digits: "9" },
]);
eq(
  "tally",
  [t.total, t.answered, t.voicemail, t.missed, t.failed, t.placing, t.stopped, t.listened],
  [6, 2, 1, 1, 1, 1, 1, 50],
);

eq(
  "phone numbers",
  ["0712 345 678", "+254 712 345678", "712345678", "0112345678", "12", "+447700900123"].map(
    phoneDigits,
  ),
  ["254712345678", "254712345678", "254712345678", "254112345678", "", "447700900123"],
);
eq("speaking time", speakingSeconds("word ".repeat(150)), 60);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
