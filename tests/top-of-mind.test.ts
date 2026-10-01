// Checks for what's on people's minds this week: issue names brought together,
// and the four sources counted on their own and averaged. Pure; nothing leaves
// this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/top-of-mind.test.ts

import { issueKey, listOf, mindBasis, pct, sourcesOf, topOfMind } from "@/lib/top-of-mind";

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
  "issue names brought together",
  [
    issueKey("Rubbish"),
    issueKey("Water and sanitation"),
    issueKey(" Floods "),
    issueKey("insecurity"),
    issueKey("Street lights"),
  ],
  ["garbage", "water", "floods", "security", "lighting"],
);
eq(
  "no issue",
  [issueKey("general"), issueKey("Campaign"), issueKey(""), issueKey(null)],
  [null, null, null, null],
);

const news = (issue: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    issue,
    title: `${issue} story ${i + 1}`,
    url: `https://news.test/${issue}/${i + 1}`,
  }));
const mind = topOfMind({
  news: [...news("water", 6), ...news("floods", 2), ...news("general", 2)],
  messages: ["water", "water", "water", "Rubbish", "garbage"],
  door: ["Water", "Water"],
  searches: [
    { issue: "water", average: 30 },
    { issue: "floods", average: 10 },
  ],
});
const r3 = (x: number) => Math.round(x * 1000) / 1000;
eq(
  "the week's issues, each source counted on its own",
  mind.lines.map((l) => [l.key, r3(l.score)]),
  [
    ["water", 0.7],
    ["floods", 0.167],
    ["garbage", 0.133],
  ],
);
eq("a source with under five items doesn't count", mind.lines[0]?.shares, {
  news: 0.75,
  messages: 0.6,
  door: null,
  searches: 0.75,
});
eq(
  "with the latest headlines",
  mind.lines[0]?.examples.map((e) => e.text),
  ["water story 1", "water story 2"],
);
eq("how much each source had", mind.sizes, { news: 8, messages: 5, door: 2, searches: 2 });
eq(
  "what it rests on",
  mindBasis(mind),
  "Across 8 news and social items, 5 messages and Google searches, the last 7 days.",
);
eq(
  "an issue's sources in words",
  sourcesOf(mind.lines[0]!),
  "news and social, messages to us and searches",
);
eq(
  "a quiet week",
  topOfMind({ news: news("water", 2), messages: [], door: [], searches: [] }).lines,
  [],
);
eq(
  "nothing to say yet",
  mindBasis(topOfMind({ news: [], messages: [], door: [], searches: [] })),
  "Not enough raised this week to say yet.",
);
eq("percentages", pct(0.7000000000000001), "70%");
eq(
  "lists",
  [listOf(["a"]), listOf(["a", "b"]), listOf(["a", "b", "c"])],
  ["a", "a and b", "a, b and c"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
