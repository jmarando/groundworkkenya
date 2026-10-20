// Checks for Listening's overview: the actions, the conversations and the posts behind them.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-read.test.ts

import { actions, conversations, postsFor, type Post } from "@/lib/listening-read";

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

const NOW = Date.parse("2026-10-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
let seq = 0;
const p = (o: Partial<Post>): Post => ({
  id: `p${++seq}`,
  topicId: null,
  topic: null,
  topicKind: null,
  rivalId: null,
  rival: null,
  rivalIsUs: false,
  source: "web",
  domain: "news.test",
  issue: null,
  sentiment: "neutral",
  status: "new",
  publishedAt: null,
  foundAt: daysAgo(1),
  reach: null,
  commentsRead: null,
  commentsNegative: null,
  ...o,
});

const topics = [
  { id: "you", label: "Our candidate", kind: "campaign", active: true },
  { id: "kago", label: "Gabriel Kago", kind: "rival", active: true },
  { id: "dairy", label: "Dairy farmers", kind: "issue", active: true },
  { id: "old", label: "Switched off, nothing found", kind: "issue", active: false },
];
const you = { topicId: "you", topicKind: "campaign" };
const kago = { topicId: "kago", topicKind: "rival" };
const posts: Post[] = [
  p({ ...you, sentiment: "negative", issue: "housing" }),
  p({ ...you, sentiment: "negative", issue: "housing" }),
  p({ ...you, sentiment: "negative", issue: "bursaries", status: "actioned" }),
  p({ ...you, sentiment: "positive", issue: "bursaries", source: "facebook" }),
  p({ ...you, sentiment: "positive", foundAt: daysAgo(10) }),
  p({ ...kago, sentiment: "positive", issue: "security" }),
  p({ ...kago, sentiment: "positive", issue: "security" }),
  p({ ...kago, sentiment: "positive", issue: "jobs" }),
  p({ topicId: "dairy", topicKind: "issue", issue: "jobs", sentiment: "negative" }),
  p({ topicId: "dairy", topicKind: "issue", issue: "jobs", sentiment: "neutral" }),
  p({
    topicId: "dairy",
    topicKind: "issue",
    issue: "jobs",
    sentiment: "negative",
    publishedAt: daysAgo(9),
  }),
  p({
    rivalId: "r1",
    rival: "Gabriel Kago",
    source: "facebook",
    reach: 340,
    commentsRead: 30,
    commentsNegative: 2,
    sentiment: null,
  }),
  p({ rivalId: "r1", rival: "Gabriel Kago", source: "facebook", reach: 107, sentiment: null }),
];

const convos = conversations(topics, posts, NOW);
eq(
  "rows: you, rivals, issues; the empty switched-off keyword left out",
  convos.map((c) => c.label),
  ["Our candidate", "Gabriel Kago", "Gabriel Kago's own posts", "Dairy farmers"],
);
const ours = convos[0];
eq("this week and the week before", [ours.week, ours.prevWeek], [4, 1]);
eq("mood this week", [ours.positive, ours.neutral, ours.negative], [1, 0, 3]);
eq("angry and unhandled", ours.unhandledAngry, 2);
eq("top issue, not 'general'", ours.topIssue, "housing");
const own = convos[2];
eq(
  "own posts: reach and replies",
  [own.own, own.reach, own.commentsRead, own.commentsNegative],
  [true, 447, 30, 2],
);
eq("published date wins over found date", [convos[3].week, convos[3].prevWeek], [2, 1]);

const acts = actions(convos, posts, NOW);
eq(
  "actions in order",
  acts.map((a) => a.key),
  ["angry-you", "rising-jobs", "warmer-t:kago", "own-r:r1", "warm-you"],
);
eq("angry headline", acts[0].headline, "2 angry posts about you have not been handled");
eq("angry names the issue", acts[0].why.startsWith("Most are about housing."), true);
eq(
  "rising issue figures",
  acts[1].headline,
  "Jobs is coming up: 3 posts this week, 1 the week before",
);
eq(
  "rival warmer figures",
  acts[2].headline,
  "Gabriel Kago had warmer coverage than you this week: 3 warm posts to your 1",
);
eq("own posts headline", acts[3].headline, "Gabriel Kago posted 2 times this week, reaching 447");
eq(
  "each action's count is the posts it opens",
  acts.map((a) => postsFor(posts, a.focus, NOW).length),
  acts.map((a) => a.n),
);

eq("drill-down by source", postsFor(posts, { label: "fb", source: "facebook" }, NOW).length, 3);
eq("drill-down newest first", postsFor(posts, ours.focus, NOW).at(-1)?.foundAt, daysAgo(10));
const thisWeekOnly = posts.filter(
  (x) => Date.parse(x.publishedAt ?? x.foundAt) > NOW - 7 * 86_400_000,
);
eq(
  "no rising issue before last week was swept",
  actions(conversations(topics, thisWeekOnly, NOW), thisWeekOnly, NOW).some((a) =>
    a.key.startsWith("rising"),
  ),
  false,
);
eq("nothing to say, nothing said", actions([], [], NOW), []);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
