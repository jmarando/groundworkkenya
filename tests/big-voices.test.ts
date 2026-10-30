// Checks for Listening's big voices: who is loud in the seat, the county and the country, how big
// they are, how their posts feel towards the campaign, and the move to suggest. Invented accounts
// only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/big-voices.test.ts

import {
  FLOOR,
  bigVoices,
  levelOf,
  moveFor,
  rivalVoiceKeys,
  type BigVoicesOpts,
} from "@/lib/big-voices";
import type { VoicePost } from "@/lib/voices";

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

const NOW = Date.parse("2026-10-30T12:00:00Z");
let n = 0;
const post = (o: Partial<VoicePost> = {}): VoicePost => ({
  id: `p${++n}`,
  topicId: "t1",
  topic: "Githunguri",
  topicKind: "campaign",
  rivalId: null,
  rival: null,
  rivalIsUs: false,
  source: "x",
  domain: null,
  issue: null,
  sentiment: null,
  status: "new",
  publishedAt: "2026-10-29T10:00:00Z",
  foundAt: "2026-10-29T11:00:00Z",
  reach: null,
  commentsRead: null,
  commentsNegative: null,
  url: "https://x.com/someone/status/1",
  author: null,
  ...o,
});
const x = (handle: string, o: Partial<VoicePost> = {}) =>
  post({ source: "x", author: `@${handle}`, url: `https://x.com/${handle}/status/${++n}`, ...o });
const fb = (page: string, o: Partial<VoicePost> = {}) =>
  post({
    source: "facebook",
    author: null,
    url: `https://www.facebook.com/${page}/posts/${++n}`,
    ...o,
  });
const site = (host: string, o: Partial<VoicePost> = {}) =>
  post({ source: "news", domain: host, url: `https://${host}/story-${++n}`, ...o });

const labels = { seat: "Githunguri", county: "Kiambu", country: "Kenya" };
const opts = (o: Partial<BigVoicesOpts> = {}): BigVoicesOpts => ({
  now: NOW,
  followers: new Map(),
  rivalKeys: new Set(),
  labels,
  ...o,
});
const names = (xs: { name: string }[]) => xs.map((v) => v.name);

// ---- levelOf
eq("campaign is the seat", levelOf("campaign"), "seat");
eq("a rival's keyword is the seat", levelOf("rival"), "seat");
eq("an issue is the seat", levelOf("issue"), "seat");
eq("county is the county", levelOf("county"), "county");
eq("national is the country", levelOf("national"), "country");
eq("a candidate's own post has no level", levelOf(null), null);
eq("an unknown kind has no level", levelOf("whatever"), null);

// ---- moves
eq("an outlet is pressed", moveFor({ kind: "outlet", read: 9, warm: 9, angry: 0 }), "press");
eq(
  "half angry of two read: respond",
  moveFor({ kind: "account", read: 2, warm: 1, angry: 1 }),
  "respond",
);
eq("all angry: respond", moveFor({ kind: "account", read: 3, warm: 0, angry: 3 }), "respond");
eq(
  "two of three warm: recruit",
  moveFor({ kind: "account", read: 3, warm: 2, angry: 0 }),
  "recruit",
);
eq(
  "one read post is too few",
  moveFor({ kind: "account", read: 1, warm: 1, angry: 0 }),
  "win-over",
);
eq(
  "mostly neutral: win over",
  moveFor({ kind: "account", read: 5, warm: 1, angry: 1 }),
  "win-over",
);
eq("nothing read: win over", moveFor({ kind: "account", read: 0, warm: 0, angry: 0 }), "win-over");

// ---- rival keys
eq(
  "a rival's handles, as voice keys",
  [...rivalVoiceKeys([{ x: "Rival_One", tiktok: "rival.one", facebook: "RivalPage" }])].sort(),
  ["facebook:rivalpage", "tiktok:@rival.one", "x:@rival_one"],
);
eq("a rival with no accounts has no keys", rivalVoiceKeys([{ x: null }, {}]).size, 0);

// ---- nothing in, nothing out
eq("no posts, no columns", bigVoices([], opts()), []);
eq(
  "posts with no level or from a candidate's own account are not voices",
  bigVoices(
    [x("a", { topicKind: null, reach: 90_000 }), x("b", { rivalId: "r1", reach: 90_000 })],
    opts(),
  ),
  [],
);

// ---- the columns
{
  const cols = bigVoices(
    [
      x("seatvoice", { topicKind: "campaign", reach: 9_000 }),
      x("countyvoice", { topicKind: "county", reach: 9_000 }),
      x("nationalvoice", { topicKind: "national", reach: 9_000 }),
      x("everywhere", { topicKind: "campaign", reach: 6_000 }),
      x("everywhere", { topicKind: "national", reach: 12_000 }),
    ],
    opts(),
  );
  eq(
    "three columns, seat first",
    cols.map((c) => c.level),
    ["seat", "county", "country"],
  );
  eq(
    "each is labelled",
    cols.map((c) => c.label),
    ["Githunguri", "Kiambu", "Kenya"],
  );
  eq("the seat column", names(cols[0]!.accounts), ["@seatvoice", "@everywhere"]);
  eq("the county column", names(cols[1]!.accounts), ["@countyvoice"]);
  eq("the country column", names(cols[2]!.accounts), ["@everywhere", "@nationalvoice"]);
  eq(
    "a voice in two columns is counted in each by its own posts",
    [cols[0]!.accounts[1]!.seen, cols[2]!.accounts[0]!.seen],
    [6_000, 12_000],
  );
  eq(
    "a campaign with posts only under county keywords has one column",
    bigVoices([x("only", { topicKind: "county", reach: 9_000 })], opts()).map((c) => c.level),
    ["county"],
  );
}

// ---- the window
{
  const old = x("old", {
    publishedAt: "2026-09-01T10:00:00Z",
    foundAt: "2026-09-01T10:00:00Z",
    reach: 90_000,
  });
  const lately = x("lately", { publishedAt: "2026-10-27T10:00:00Z", reach: 90_000 });
  eq("30 days by default", names(bigVoices([old, lately], opts())[0]!.accounts), ["@lately"]);
  eq(
    "90 days reaches back",
    names(bigVoices([old, lately], opts({ days: 90 }))[0]!.accounts).sort(),
    ["@lately", "@old"],
  );
  eq(
    "a shorter window leaves out what is older",
    names(bigVoices([old, lately], opts({ days: 2 }))[0]?.accounts ?? []),
    [],
  );
  const undated = x("undated", {
    publishedAt: null,
    foundAt: "2026-10-29T11:00:00Z",
    reach: 9_000,
  });
  eq(
    "a post with no date is dated by when it was found",
    names(bigVoices([undated], opts())[0]!.accounts),
    ["@undated"],
  );
}

// ---- ranking: views where counted, else followers; ties by posts, then name
{
  const posts = [
    x("views50k", { reach: 50_000 }),
    fb("pagebig", { reach: null }),
    x("views8k", { reach: 8_000 }),
    x("tiea", { reach: 6_000 }),
    x("tieb", { reach: 6_000 }),
    x("tieb", { reach: null }),
  ];
  const followers = new Map<string, number | null>([["facebook:pagebig", 60_000]]);
  eq(
    "ranked by views seen, else followers; a tie goes to more posts then the name",
    names(bigVoices(posts, opts({ followers }))[0]!.accounts),
    ["pagebig", "@views50k", "@views8k", "@tieb", "@tiea"],
  );
}

// ---- the floor
{
  const followers = new Map<string, number | null>([
    ["facebook:exactly2000", 2_000],
    ["facebook:justunder", 1_999],
    ["facebook:unknown", null],
  ]);
  const posts = [
    fb("exactly2000"),
    fb("justunder", { reach: 4_999 }),
    x("fivethousand", { reach: 5_000 }),
    fb("unknown"),
    fb("unknown"),
    x("tiny", { reach: 40 }),
  ];
  const col = bigVoices(posts, opts({ followers }))[0]!;
  eq("2,000 followers or 5,000 views is enough", names(col.accounts).sort(), [
    "@fivethousand",
    "exactly2000",
  ]);
  eq("under both is not named, and its posts are counted", col.smaller, 4);
  eq(
    "with the floor off everyone is listed",
    names(bigVoices(posts, opts({ followers, floor: false }))[0]!.accounts).length,
    5,
  );
  eq("the floor is what the design says", FLOOR, { followers: 2000, seen: 5000 });
  eq(
    "an outlet is listed with no numbers at all",
    names(bigVoices([site("kiambucourier.example.test")], opts())[0]!.outlets),
    ["kiambucourier.example.test"],
  );
  eq(
    "an outlet is never counted among the smaller accounts",
    bigVoices([site("kiambucourier.example.test")], opts())[0]!.smaller,
    0,
  );
}

// ---- outlets
{
  const col = bigVoices(
    [
      site("a.example.test"),
      site("b.example.test"),
      site("b.example.test"),
      site("c.example.test", { reach: 1 }),
    ],
    opts(),
  )[0]!;
  eq("outlets rank by posts, then views, then name", names(col.outlets), [
    "b.example.test",
    "c.example.test",
    "a.example.test",
  ]);
  eq(
    "an outlet is an outlet, pressed",
    [col.outlets[0]!.kind, col.outlets[0]!.move],
    ["outlet", "press"],
  );
  eq(
    "an account is an account",
    bigVoices([x("a", { reach: 9_000 })], opts())[0]!.accounts[0]!.kind,
    "account",
  );
}

// ---- mood, and who counts towards it
{
  const mixed = [
    x("m", { reach: 9_000, sentiment: "positive" }),
    x("m", { sentiment: "positive" }),
    x("m", { sentiment: "negative" }),
    x("m", { sentiment: null }),
  ];
  const v = bigVoices(mixed, opts())[0]!.accounts[0]!;
  eq("read, warm, angry", [v.read, v.warm, v.angry], [3, 2, 1]);
  eq(
    "the shares towards you",
    [Math.round(v.towardsWarm! * 100), Math.round(v.towardsAngry! * 100)],
    [67, 33],
  );
  eq("a post nobody has read adds to the posts, not the mood", v.posts, 4);

  const aboutRivals = Array.from({ length: 5 }, () =>
    x("rivalwatcher", { topicKind: "rival", reach: 3_000, sentiment: "negative" }),
  );
  const w = bigVoices(aboutRivals, opts())[0]!.accounts[0]!;
  eq("posts found by a rival's keyword count as seen and as posts", [w.posts, w.seen], [5, 15_000]);
  eq("but not towards the mood", [w.read, w.angry, w.towardsAngry], [0, 0, null]);
  eq("so a voice that only talks about rivals is one to win over", w.move, "win-over");

  const none = bigVoices([x("quiet", { reach: 9_000 })], opts())[0]!.accounts[0]!;
  eq("no read posts means no shares", [none.towardsWarm, none.towardsAngry], [null, null]);
}

// ---- moves in place
{
  const angry = [
    x("sore", { reach: 9_000, sentiment: "negative" }),
    x("sore", { sentiment: "negative" }),
  ];
  const warm = [
    x("fan", { reach: 9_000, sentiment: "positive" }),
    x("fan", { sentiment: "positive" }),
  ];
  const col = bigVoices([...angry, ...warm], opts())[0]!;
  const byName = Object.fromEntries(col.accounts.map((v) => [v.name, v.move]));
  eq("angry is answered, warm is recruited", byName, { "@fan": "recruit", "@sore": "respond" });
}

// ---- the angriest post, the issues, the posts behind a voice
{
  const v = bigVoices(
    [
      x("v", { id: "calm", reach: 90_000, sentiment: "positive", issue: "roads" }),
      x("v", { id: "small", reach: 1_000, sentiment: "negative", issue: "water" }),
      x("v", { id: "big", reach: 20_000, sentiment: "negative", issue: "water" }),
      x("v", {
        id: "aboutrival",
        reach: 80_000,
        sentiment: "negative",
        topicKind: "rival",
        issue: "water",
      }),
      x("v", { id: "gen", reach: 1, issue: "general" }),
      x("v", { id: "off", reach: 1, issue: "off-topic" }),
      x("v", { id: "camp", reach: 1, issue: "campaign" }),
      x("v", { id: "roads2", reach: 1, issue: "roads" }),
    ],
    opts(),
  )[0]!.accounts[0]!;
  eq("the most-seen angry post, not a rival-keyword one", v.angryPostId, "big");
  eq("the top issues, at most two, never the empty ones", v.topIssues, ["water", "roads"]);
  eq("the posts behind a voice, most seen first", v.postIds.slice(0, 3), [
    "calm",
    "aboutrival",
    "big",
  ]);
  eq("the latest post", v.last, "2026-10-29T10:00:00.000Z");
}

// ---- rivals' own handles are not voices
{
  const keys = rivalVoiceKeys([{ x: "Rival_One" }]);
  eq(
    "a rival's handle is left out",
    names(
      bigVoices(
        [x("Rival_One", { reach: 99_000 }), x("other", { reach: 9_000 })],
        opts({ rivalKeys: keys }),
      )[0]!.accounts,
    ),
    ["@other"],
  );
}

// ---- limits
{
  const many = Array.from({ length: 12 }, (_, i) => x(`acct${i}`, { reach: 10_000 + i }));
  const outlets = Array.from({ length: 7 }, (_, i) => site(`o${i}.example.test`));
  const col = bigVoices([...many, ...outlets], opts())[0]!;
  eq(
    "ten accounts and five outlets by default",
    [col.accounts.length, col.outlets.length],
    [10, 5],
  );
  const wide = bigVoices([...many, ...outlets], opts({ accounts: 3, outlets: 2 }))[0]!;
  eq("the limits can change", [wide.accounts.length, wide.outlets.length], [3, 2]);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
