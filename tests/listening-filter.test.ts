// Checks for filtering Listening's mentions, including by issue from a link on
// Home. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-filter.test.ts

import { filterMentions } from "@/lib/listening-filter";

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

const m = (id: string, issue: string | null, sentiment: string | null, title: string) => ({
  id,
  issue,
  sentiment,
  title,
  snippet: null,
  domain: "news.test",
  source: "news",
  topicId: "t1",
});
const ms = [
  m("1", "Water", "negative", "Taps dry"),
  m("2", "water", null, "Bowsers late"),
  m("3", "floods", "negative", "Drains"),
  m("4", null, null, "Other"),
];
const all = { source: "all", mood: "all", topic: "all", search: "", issue: null };

eq(
  "nothing chosen, everything",
  filterMentions(ms, all).map((x) => x.id),
  ["1", "2", "3", "4"],
);
eq(
  "one issue, any case",
  filterMentions(ms, { ...all, issue: "water" }).map((x) => x.id),
  ["1", "2"],
);
eq(
  "an issue and a mood",
  filterMentions(ms, { ...all, issue: "water", mood: "negative" }).map((x) => x.id),
  ["1"],
);
eq(
  "words in the title",
  filterMentions(ms, { ...all, search: "DRAINS" }).map((x) => x.id),
  ["3"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
