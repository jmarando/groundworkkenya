// Checks for which unread posts the mood reader takes next: each campaign in turn, so one busy
// campaign never keeps another's posts unread. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/mood-queue.test.ts

import { fairShare } from "@/lib/mood-queue";

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

// Newest first, as the sweep reads them: a busy campaign's posts, then a quiet one's, then a third's.
const unread = [
  { id: "busy-1", campaign_id: "busy" },
  { id: "busy-2", campaign_id: "busy" },
  { id: "busy-3", campaign_id: "busy" },
  { id: "busy-4", campaign_id: "busy" },
  { id: "quiet-1", campaign_id: "quiet" },
  { id: "third-1", campaign_id: "third" },
  { id: "third-2", campaign_id: "third" },
];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

eq("each campaign's newest first, the campaigns in turn", ids(fairShare(unread, 4)), [
  "busy-1",
  "quiet-1",
  "third-1",
  "busy-2",
]);
eq("the rest follow in the same order", ids(fairShare(unread, 10)), [
  "busy-1",
  "quiet-1",
  "third-1",
  "busy-2",
  "third-2",
  "busy-3",
  "busy-4",
]);
eq("never more than the limit", fairShare(unread, 2).length, 2);
eq("one campaign alone keeps its order", ids(fairShare(unread.slice(0, 3), 2)), [
  "busy-1",
  "busy-2",
]);
eq("nothing unread, nothing taken", fairShare([], 5), []);
eq("a limit of none takes none", fairShare(unread, 0), []);
eq(
  "a post with no campaign still gets its turn",
  ids(
    fairShare(
      [
        { id: "a", campaign_id: "c" },
        { id: "b", campaign_id: "c" },
        { id: "x", campaign_id: null },
      ],
      2,
    ),
  ),
  ["a", "x"],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
