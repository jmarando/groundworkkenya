// Checks for the pieces every inbound text goes through: phone numbers,
// STOP and START, and reading a poll answer typed on a feature phone.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/engine.test.ts

import { maskPhone, normalizeKePhone } from "@/lib/phone";
import {
  isStartWord,
  isStopWord,
  optOutText,
  parseAnswer,
  type EnginePoll,
} from "@/lib/polls.engine";

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

// ---- phone numbers
eq(
  "every way a Kenyan mobile arrives becomes one E.164 number",
  ["0712 345 678", "712345678", "254712345678", "+254 712-345-678", "00254712345678"].map(
    normalizeKePhone,
  ),
  Array(5).fill("+254712345678"),
);
eq("the 01 ranges are mobiles too", normalizeKePhone("0110 123 456"), "+254110123456");
eq(
  "landlines, short numbers and other countries are refused",
  ["020 2222222", "071234567", "+447912345678", "", null].map(normalizeKePhone),
  [null, null, null, null, null],
);
eq("shown masked", maskPhone("+254712345448"), "+254 712 ••• 448");

// ---- STOP and START
eq(
  "STOP in the ways people send it",
  ["STOP", "Stop.", " acha ", "Sitaki!", "stop all", "UNSUBSCRIBE", "toka"].map(isStopWord),
  [true, true, true, true, true, true, true],
);
eq(
  "words that only contain stop are not an opt-out",
  ["stopover", "1", "stop the corruption", ""].map(isStopWord),
  [false, false, false, false],
);
eq("START in the ways people send it", ["START", "anza", "Join!"].map(isStartWord), [
  true,
  true,
  true,
]);
eq("the opt-out confirmation says how to come back", optOutText("Timu").includes("START"), true);

// ---- poll answers
const poll = (kind: EnginePoll["kind"]): EnginePoll => ({
  id: "p",
  code: "P1",
  question: "What matters most?",
  questionSw: "Nini muhimu zaidi?",
  kind,
  lang: "sw",
  options:
    kind === "yesno"
      ? [
          { key: "1", label: "Yes", labelSw: "Ndio" },
          { key: "2", label: "No", labelSw: "Hapana" },
        ]
      : [
          { key: "1", label: "Water", labelSw: "Maji" },
          { key: "2", label: "Roads", labelSw: "Barabara" },
          { key: "3", label: "Jobs for youth", labelSw: "Kazi kwa vijana" },
        ],
  weighting: true,
  rewardMethod: "none",
  rewardAmount: 0,
});
const key = (p: EnginePoll, raw: string) => parseAnswer(p, raw)?.optionKey ?? null;

const choice = poll("single_choice");
eq(
  "a leading number wins",
  ["1", "2 maji", "3.", " 2 "].map((r) => key(choice, r)),
  ["1", "2", "3", "2"],
);
eq(
  "a label in either language",
  ["maji", "MAJI.", "Roads", "kazi"].map((r) => key(choice, r)),
  ["1", "1", "2", "3"],
);
eq(
  "anything unclear is not guessed",
  ["4", "xyz", "", "ma"].map((r) => parseAnswer(choice, r)),
  [null, null, null, null],
);

const yesno = poll("yesno");
eq(
  "yes and no in English and Swahili",
  ["ndio", "Ndiyo", "yes.", "Hapana", "la", "2"].map((r) => key(yesno, r)),
  ["1", "1", "1", "2", "2", "2"],
);

const open = poll("open");
eq("an open question keeps the words", parseAnswer(open, "  Maji safi  "), {
  optionKey: null,
  freeText: "Maji safi",
});
eq("and caps them", parseAnswer(open, "x".repeat(900))?.freeText?.length, 500);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
