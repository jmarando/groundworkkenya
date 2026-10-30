// Checks for how a stored post becomes the Mention the Listening screens read: numbers as numbers,
// the keyword and the candidate named from their lookups, and nothing missing becoming a crash.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-mention.test.ts

import { toMention, type MentionRow } from "@/lib/listening-mention";

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

const topics = new Map([["t1", { label: "Githunguri", kind: "campaign" }]]);
const rivals = new Map([
  ["r1", { name: "Test Rival", is_us: false }],
  ["r2", { name: "Wanjiru", is_us: true }],
]);
const row = (o: Partial<MentionRow> = {}): MentionRow => ({
  id: "m1",
  topic_id: "t1",
  source: "x",
  domain: "x.com",
  title: "A title",
  url: "https://x.com/a/status/1",
  snippet: "Some text",
  published_at: "2026-10-29T10:00:00Z",
  found_at: "2026-10-29T11:00:00Z",
  sentiment: "negative",
  sentiment_score: "-0.6",
  issue: "water",
  status: "new",
  rival_id: null,
  author: "@a",
  reach: "1200",
  shares: 4,
  comments_read: null,
  comments_positive: null,
  comments_negative: null,
  ...o,
});
const mention = (o: Partial<MentionRow> = {}) => toMention(row(o), topics, rivals);

eq("the whole shape", mention(), {
  id: "m1",
  topicId: "t1",
  topic: "Githunguri",
  source: "x",
  domain: "x.com",
  title: "A title",
  url: "https://x.com/a/status/1",
  snippet: "Some text",
  publishedAt: "2026-10-29T10:00:00Z",
  foundAt: "2026-10-29T11:00:00Z",
  sentiment: "negative",
  sentimentScore: -0.6,
  issue: "water",
  status: "new",
  topicKind: "campaign",
  rivalId: null,
  rival: null,
  rivalIsUs: false,
  author: "@a",
  reach: 1200,
  shares: 4,
  commentsRead: null,
  commentsPositive: null,
  commentsNegative: null,
});

eq("a numeric string for views becomes a number", mention({ reach: "1200" }).reach, 1200);
eq("no views stays null", mention({ reach: null }).reach, null);
// A column the select did not return is absent, not undefined.
const without = (key: "reach" | "author") => {
  const r = row();
  delete r[key];
  return toMention(r, topics, rivals);
};
eq("views missing altogether stays null", without("reach").reach, null);
eq("no score stays null", mention({ sentiment_score: null }).sentimentScore, null);
eq("a numeric score is kept", mention({ sentiment_score: 0.25 }).sentimentScore, 0.25);
eq("no author is null", without("author").author, null);

eq(
  "an unknown keyword names nothing",
  [mention({ topic_id: "nope" }).topic, mention({ topic_id: "nope" }).topicKind],
  [null, null],
);
eq(
  "no keyword names nothing",
  [mention({ topic_id: null }).topic, mention({ topic_id: null }).topicKind],
  [null, null],
);

eq(
  "a rival's own post names the rival",
  [
    mention({ rival_id: "r1" }).rival,
    mention({ rival_id: "r1" }).rivalIsUs,
    mention({ rival_id: "r1" }).rivalId,
  ],
  ["Test Rival", false, "r1"],
);
eq("our own candidate's post is ours", mention({ rival_id: "r2" }).rivalIsUs, true);
eq(
  "an unknown rival id is a post from nobody in particular",
  [mention({ rival_id: "zz" }).rival, mention({ rival_id: "zz" }).rivalIsUs],
  [null, false],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
