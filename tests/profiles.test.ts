// Checks for looking up the followers of the accounts Listening names: which request asks for an
// account, how an answer is read, and which accounts are worth a lookup this hour. Invented
// accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/profiles.test.ts

import { bigVoices, type Column } from "@/lib/big-voices";
import { lookupCandidates, profileRequest, readFollowers, type Known } from "@/lib/profiles";
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

// ---- which request asks for an account
eq("tiktok", profileRequest("tiktok:@some_creator"), {
  path: "/v1/tiktok/profile",
  params: { handle: "some_creator" },
});
eq("x", profileRequest("x:@abc"), { path: "/v1/twitter/profile", params: { handle: "abc" } });
eq("instagram", profileRequest("instagram:some.page"), {
  path: "/v1/instagram/profile",
  params: { handle: "some.page" },
});
eq(
  "youtube by its channel address, as the documentation's own example is",
  profileRequest("youtube:@mamanjeri"),
  {
    path: "/v1/youtube/channel",
    params: { url: "https://www.youtube.com/@mamanjeri" },
  },
);
eq(
  "youtube by a channel title cannot be asked for",
  profileRequest("youtube:mama njeri talks"),
  null,
);
eq("facebook by its page", profileRequest("facebook:somepage"), {
  path: "/v1/facebook/profile",
  params: { url: "https://www.facebook.com/somepage" },
});
eq("reddit has no endpoint", profileRequest("reddit:u/someone"), null);
eq("a news site has no endpoint", profileRequest("site:nation.example.test"), null);
eq("a key with no platform is nothing", profileRequest("nonsense"), null);
eq("a handle with a slash is refused", profileRequest("x:@a/b"), null);
eq("a handle too long for the platform is refused", profileRequest("x:@abcdefghijklmnopq"), null);
eq("an injected query is refused", profileRequest("tiktok:@a&b=c"), null);

// ---- how an answer is read
eq("tiktok's own shape", readFollowers({ stats: { followerCount: 4_100_000 } }), 4_100_000);
eq("a digit string", readFollowers({ followers_count: "880000" }), 880_000);
eq("x's own shape", readFollowers({ legacy: { followers_count: 12 } }), 12);
eq("wrapped in data", readFollowers({ data: { stats: { followerCount: 77 } } }), 77);
eq("a channel's subscribers", readFollowers({ subscriberCount: "22000" }), 22_000);
eq("instagram's shape", readFollowers({ edge_followed_by: { count: 64_000 } }), 64_000);
// The shapes in ScrapeCreators' API description, with invented numbers.
eq(
  "tiktok, as documented: stats is beside user",
  readFollowers({
    user: { id: "1", uniqueId: "x" },
    stats: { followerCount: 120_000, heartCount: 5 },
  }),
  120_000,
);
eq(
  "instagram, as documented: data.user.edge_followed_by.count",
  readFollowers({
    success: true,
    credits_charged: 1,
    data: {
      user: { full_name: "A Page", edge_followed_by: { count: 8_800 }, edge_follow: { count: 90 } },
    },
  }),
  8_800,
);
eq(
  "youtube, as documented: subscriberCount beside its text",
  readFollowers({
    channelId: "UC1",
    subscriberCount: 15_000,
    subscriberCountText: "15K subscribers",
  }),
  15_000,
);
eq(
  "facebook, as documented: followerCount",
  readFollowers({ name: "A Page", followerCount: 3_200 }),
  3_200,
);
eq(
  "x, as documented: legacy.followers_count, not the fast or normal ones",
  readFollowers({
    legacy: { fast_followers_count: 0, followers_count: 377_608, normal_followers_count: 3 },
  }),
  377_608,
);
eq("nothing in it", readFollowers({}), null);
eq("not an object", readFollowers("oops"), null);
eq("a negative count is no count", readFollowers({ followers: -4 }), null);
eq("a list of followers is not a count", readFollowers({ followers: [{ id: 1 }] }), null);
eq("a fraction is rounded", readFollowers({ followers: 10.6 }), 11);

// ---- who is worth a lookup
const NOW = Date.parse("2026-10-30T12:00:00Z");
const DAY = 86_400_000;
let n = 0;
const post = (o: Partial<VoicePost>): VoicePost => ({
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
const x = (h: string, o: Partial<VoicePost> = {}) =>
  post({ source: "x", author: `@${h}`, url: `https://x.com/${h}/status/${++n}`, ...o });
const fb = (page: string, o: Partial<VoicePost> = {}) =>
  post({ source: "facebook", url: `https://www.facebook.com/${page}/posts/${++n}`, ...o });
const columns = (posts: VoicePost[]): Column[] =>
  bigVoices(posts, {
    now: NOW,
    followers: new Map(),
    rivalKeys: new Set(),
    labels: { seat: "Seat", county: "County", country: "Country" },
    floor: false,
    accounts: 1000,
  });
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const none = new Map<string, Known>();

{
  const cols = columns([
    x("few", { reach: 10 }),
    x("many", { reach: 90_000 }),
    fb("pagea"),
    fb("pagea"),
    fb("pageb"),
    post({
      source: "news",
      domain: "paper.example.test",
      url: "https://paper.example.test/a",
      reach: 99_999,
    }),
    post({
      source: "reddit",
      author: "u/redditor",
      url: "https://www.reddit.com/r/kenya/1",
      reach: 5,
    }),
  ]);
  eq(
    "the most viewed first, then the most posted among those with no views; never an outlet or a platform with no endpoint",
    lookupCandidates(cols, none, NOW, 20),
    ["x:@many", "x:@few", "facebook:pagea", "facebook:pageb"],
  );
  eq("the limit holds", lookupCandidates(cols, none, NOW, 2), ["x:@many", "x:@few"]);
  eq("a limit of nothing is nothing", lookupCandidates(cols, none, NOW, 0), []);
}
{
  const cols = columns([
    x("a", { reach: 5 }),
    x("b", { reach: 4 }),
    x("c", { reach: 3 }),
    x("d", { reach: 2 }),
  ]);
  const known = new Map<string, Known>([
    ["x:@a", { followers: 100, checkedAt: ago(6), failedAt: null }],
    ["x:@b", { followers: 100, checkedAt: ago(8), failedAt: null }],
    ["x:@c", { followers: null, checkedAt: null, failedAt: ago(3) }],
    ["x:@d", { followers: null, checkedAt: null, failedAt: ago(9) }],
  ]);
  eq(
    "a count under a week old is kept, one over is asked again; a failure under a week old is left, one over is retried",
    lookupCandidates(cols, known, NOW, 20),
    ["x:@b", "x:@d"],
  );
}
{
  const many = Array.from({ length: 14 }, (_, i) => x(`acct${i}`, { reach: 100 - i }));
  eq("ten by views per column", lookupCandidates(columns(many), none, NOW, 100).length, 10);
  const twoColumns = columns([
    x("seatvoice", { reach: 50 }),
    x("countyvoice", { reach: 40, topicKind: "county" }),
    x("seatvoice", { reach: 50, topicKind: "national" }),
  ]);
  eq("one account in two columns is asked once", lookupCandidates(twoColumns, none, NOW, 100), [
    "x:@seatvoice",
    "x:@countyvoice",
  ]);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
