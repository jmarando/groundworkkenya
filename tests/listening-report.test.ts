// Checks for Listening's Report: the headline figures against the period before, the mood about
// you as one score, the warmest and angriest day, where posts came from, the share of the
// conversation you hold against your rivals, the phrases people use, and the lanes gone quiet.
// Plain code; no AI. Invented posts, accounts and places only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-report.test.ts

import {
  IDS,
  aboutYou,
  keyFigures,
  moodDays,
  moodPeaks,
  moodScore,
  newestIds,
  percentChange,
  phraseTable,
  popularPhrases,
  postDay,
  quietSources,
  shareOfVoice,
  sourceMix,
  within,
  type ReportPost,
} from "@/lib/listening-report";

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

let n = 0;
const post = (o: Partial<ReportPost> = {}): ReportPost => {
  n++;
  return {
    id: `p${n}`,
    topicId: "t-you",
    topicKind: "campaign",
    rivalId: null,
    source: "x",
    domain: null,
    url: `https://x.com/mtaani_voice/status/${n}`,
    author: "@mtaani_voice",
    title: null,
    snippet: null,
    sentiment: "neutral",
    publishedAt: "2026-11-10T09:00:00Z",
    foundAt: "2026-11-10T10:00:00Z",
    reach: null,
    shares: null,
    ...o,
  };
};

// ------------------------------------------------------------------ change
{
  eq("up a fifth", percentChange(12, 10), 20);
  eq("down to nothing", percentChange(0, 4), -100);
  eq("level", percentChange(7, 7), 0);
  eq("nothing before to compare with", percentChange(5, 0), null);
}

// ------------------------------------------------------------- day of a post
{
  // 22:30 UTC on 2 Nov is 01:30 on 3 Nov in Nairobi.
  eq(
    "posted day, in Nairobi",
    postDay(post({ publishedAt: "2026-11-02T22:30:00Z" })),
    "2026-11-03",
  );
  eq(
    "found day when the platform gives no date",
    postDay(post({ publishedAt: null, foundAt: "2026-11-04T21:10:00Z" })),
    "2026-11-05",
  );
  const span = { from: "2026-11-03", to: "2026-11-05" };
  const a = post({ publishedAt: "2026-11-02T20:00:00Z" }); // 2 Nov, 23:00 in Nairobi: before
  const b = post({ publishedAt: "2026-11-02T21:00:00Z" }); // 3 Nov, 00:00: the first moment in
  const c = post({ publishedAt: "2026-11-05T20:59:00Z" }); // 5 Nov, 23:59: the last day
  const d = post({ publishedAt: "2026-11-05T21:00:00Z" }); // 6 Nov: after
  eq(
    "within the days, both ends included",
    within([a, b, c, d], span).map((p) => p.id),
    [b.id, c.id],
  );
}

// --------------------------------------------------------------- about you
{
  const mine = post();
  const rivalKeyword = post({ topicId: "t-rival", topicKind: "rival" });
  const issue = post({ topicId: "t-water", topicKind: "issue" });
  const ownAccount = post({ topicId: null, topicKind: null, rivalId: "r-us" });
  eq(
    "only what your own keywords found",
    aboutYou([mine, rivalKeyword, issue, ownAccount]).map((p) => p.id),
    [mine.id],
  );
}

// ------------------------------------------------------------ key figures
{
  const now = [
    post({ reach: 1200, shares: 30, author: "@mtaani_voice" }),
    post({ reach: 800, shares: null, author: "@MTAANI_VOICE" }), // the same voice, other case
    post({
      source: "news",
      author: null,
      url: "https://example-news.co.ke/a",
      domain: "example-news.co.ke",
    }),
    post({ source: "reddit", author: "u/estate_watch", reach: null }),
  ];
  const before = [post({ reach: 1000, shares: 10 }), post({ reach: 500, shares: 5 })];
  const f = keyFigures(now, before);
  eq("posts and their change", [f.posts.value, f.posts.before, f.posts.change], [4, 2, 100]);
  eq("views: only those reported, and how many reported", [f.views.value, f.views.from], [2000, 2]);
  eq("views change", f.views.change, 33);
  eq("shares: only those reported", [f.shares.value, f.shares.from, f.shares.change], [30, 1, 100]);
  eq("voices: each account or outlet once", [f.voices.value, f.voices.before], [3, 1]);
  const none = keyFigures([], []);
  eq("nothing at all", [none.posts.value, none.views.from, none.posts.change], [0, 0, null]);
}

// -------------------------------------------------------------- mood score
{
  const posts = [
    ...Array.from({ length: 6 }, () => post({ sentiment: "positive" })),
    ...Array.from({ length: 2 }, () => post({ sentiment: "neutral" })),
    ...Array.from({ length: 2 }, () => post({ sentiment: "negative" })),
    post({ sentiment: null }),
  ];
  const m = moodScore(posts);
  eq(
    "counts, the net score and the verdict",
    [m.posts, m.read, m.warm, m.neutral, m.angry, m.unread, m.net, m.verdict],
    [11, 10, 6, 2, 2, 1, 40, "Mostly warm"],
  );
  const angry = moodScore([
    post({ sentiment: "negative" }),
    post({ sentiment: "negative" }),
    post({ sentiment: "neutral" }),
  ]);
  eq("mostly angry, net below zero", [angry.net, angry.verdict], [-67, "Mostly angry"]);
  // Half warm and half angry: no mood holds more than the others.
  const split = moodScore([post({ sentiment: "positive" }), post({ sentiment: "negative" })]);
  eq("an even split is mixed", [split.net, split.verdict], [0, "Mixed"]);
  const unread = moodScore([post({ sentiment: null })]);
  eq("nothing read yet says nothing", [unread.net, unread.verdict, unread.unread], [null, null, 1]);
}

// ------------------------------------------------------------- mood by day
{
  const span = { from: "2026-11-08", to: "2026-11-10" };
  const w1 = post({ sentiment: "positive", publishedAt: "2026-11-08T06:00:00Z" });
  const a1 = post({ sentiment: "negative", publishedAt: "2026-11-10T05:00:00Z" });
  const a2 = post({ sentiment: "negative", publishedAt: "2026-11-10T08:00:00Z" });
  const u1 = post({ sentiment: null, publishedAt: "2026-11-10T07:00:00Z" });
  const out = post({ sentiment: "positive", publishedAt: "2026-11-11T06:00:00Z" });
  const days = moodDays([w1, a1, a2, u1, out], span);
  eq(
    "every day kept, empty ones too",
    days.map((d) => [d.day, d.warm, d.neutral, d.angry, d.unread]),
    [
      ["2026-11-08", 1, 0, 0, 0],
      ["2026-11-09", 0, 0, 0, 0],
      ["2026-11-10", 0, 0, 2, 1],
    ],
  );
  eq("a day opens its own posts, newest first", days[2]!.ids, [a2.id, u1.id, a1.id]);
  eq("a figure opens its posts, newest first", newestIds([a1, w1, a2]), [a2.id, a1.id, w1.id]);
  eq(
    "at most as many as Listening reads at once",
    newestIds(Array.from({ length: IDS + 5 }, () => post())).length,
    IDS,
  );

  const peaks = moodPeaks(days);
  eq("warmest and angriest day", [peaks.warm?.day, peaks.angry?.day], ["2026-11-08", "2026-11-10"]);
  const tie = moodPeaks(
    moodDays(
      [
        post({ sentiment: "negative", publishedAt: "2026-11-08T06:00:00Z" }),
        post({ sentiment: "negative", publishedAt: "2026-11-09T06:00:00Z" }),
      ],
      span,
    ),
  );
  eq("on a tie the later day", tie.angry?.day, "2026-11-09");
  eq("no warm post, no warmest day", tie.warm, null);
}

// ----------------------------------------------------------------- sources
{
  const rows = sourceMix([
    post({ source: "x", reach: 400 }),
    post({ source: "x", reach: 100 }),
    post({ source: "news", reach: null }),
  ]);
  eq(
    "share to one decimal, views only where counted",
    rows.map((r) => [r.key, r.label, r.posts, r.share, r.views]),
    [
      ["x", "X", 2, 66.7, 500],
      ["news", "News", 1, 33.3, null],
    ],
  );
  eq("no posts, no sources", sourceMix([]), []);
}

// ----------------------------------------------------------- share of voice
{
  const topics = [
    { id: "t-you", label: "Our candidate", kind: "campaign", active: true },
    { id: "t-seat", label: "Mtaani ward", kind: "campaign", active: true },
    { id: "t-r1", label: "Rival One", kind: "rival", active: true },
    { id: "t-r2", label: "Rival Two", kind: "rival", active: true },
    { id: "t-r3", label: "Rival Three", kind: "rival", active: false },
    { id: "t-water", label: "Water", kind: "issue", active: true },
  ];
  const posts = [
    post({ topicId: "t-you", reach: 300 }),
    post({ topicId: "t-seat" }),
    post({ topicId: "t-r1", topicKind: "rival", reach: 900 }),
    post({ topicId: "t-r1", topicKind: "rival" }),
    post({ topicId: "t-r1", topicKind: "rival" }),
    post({ topicId: "t-water", topicKind: "issue" }),
    post({ topicId: null, topicKind: null, rivalId: "r1" }), // a candidate's own post: not the conversation
  ];
  const rows = shareOfVoice(topics, posts);
  eq(
    "you as one voice, each rival keyword its own",
    rows.map((r) => [r.key, r.label, r.kind, r.posts, r.share, r.views]),
    [
      ["t-r1", "Rival One", "rival", 3, 60, 900],
      ["you", "You", "you", 2, 40, 300],
      ["t-r2", "Rival Two", "rival", 0, 0, null],
    ],
  );
  const level = shareOfVoice(
    [
      { id: "t-you", label: "Our candidate", kind: "campaign", active: true },
      { id: "t-r1", label: "Rival One", kind: "rival", active: true },
    ],
    [post({ topicId: "t-you" }), post({ topicId: "t-r1", topicKind: "rival" })],
  );
  eq(
    "you first on a tie",
    level.map((r) => r.key),
    ["you", "t-r1"],
  );
  eq(
    "no rivals, no comparison",
    shareOfVoice(
      [{ id: "t-you", label: "Our candidate", kind: "campaign", active: true }],
      [post()],
    ),
    [],
  );
}

// ----------------------------------------------------------------- phrases
{
  const posts = [
    post({
      title: "Chapati na masala chai at the market",
      snippet: "#MtaaniMoves #fyp https://example.com/x @someone",
      publishedAt: "2026-11-10T09:00:00Z",
    }),
    post({
      title: "Masala chai prices up again",
      snippet: "#MtaaniMoves",
      publishedAt: "2026-11-10T10:00:00Z",
    }),
    // Counted once in its post, however often it says it.
    post({ title: "Masala chai, masala chai, masala chai!", publishedAt: "2026-11-10T11:00:00Z" }),
    post({ title: "Water queues in Mtaani ward", publishedAt: "2026-11-10T12:00:00Z" }),
  ];
  const phrases = popularPhrases(posts);
  eq(
    "two-word phrases and hashtags, once per post, most used first",
    phrases.map((p) => [p.phrase, p.posts]),
    [
      ["masala chai", 3],
      ["#mtaanimoves", 2],
    ],
  );
  eq("a phrase opens its posts, newest first", phrases[0]!.ids, [
    posts[2]!.id,
    posts[1]!.id,
    posts[0]!.id,
  ]);
  const busy = popularPhrases(
    Array.from({ length: IDS + 5 }, () => post({ title: "masala chai" })),
  );
  eq(
    "a phrase in many posts: all counted, the newest opened",
    [busy[0]!.posts, busy[0]!.ids.length],
    [IDS + 5, IDS],
  );
  eq(
    "noise hashtags, links and handles say nothing",
    popularPhrases(posts, 1).some((p) => ["#fyp", "example com", "someone"].includes(p.phrase)),
    false,
  );

  const table = phraseTable(
    [
      { phrase: "masala chai", posts: 10, ids: [] },
      { phrase: "water queues", posts: 5, ids: [] },
    ],
    [{ phrase: "masala chai", posts: 8, ids: [] }],
  );
  eq(
    "scored against the top phrase, set against the period before",
    table.map((r) => [r.phrase, r.posts, r.before, r.change, r.score]),
    [
      ["masala chai", 10, 8, 25, 100],
      ["water queues", 5, 0, null, 50],
    ],
  );
}

// ------------------------------------------------------------ quiet lanes
{
  const now = Date.parse("2026-11-19T18:00:00Z");
  const quiet = quietSources(
    {
      news: "2026-11-19T17:07:00Z",
      x: "2026-11-02T20:08:00Z",
      tiktok: "2026-11-02T06:08:00Z",
      youtube: "2026-11-02T21:07:00Z",
      reddit: null,
      instagram: "2026-10-26T19:07:00Z", // a lane the sweep no longer searches: not reported
    },
    now,
  );
  eq(
    "lanes with nothing for three days, the most recent first",
    quiet.map((q) => [q.source, q.since]),
    [
      ["youtube", "2026-11-02T21:07:00Z"],
      ["x", "2026-11-02T20:08:00Z"],
      ["tiktok", "2026-11-02T06:08:00Z"],
    ],
  );
  eq(
    "all lanes busy",
    quietSources({ news: "2026-11-19T17:00:00Z", x: "2026-11-18T09:00:00Z" }, now),
    [],
  );
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
