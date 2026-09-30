// Checks for reading rivals' posts out of ScrapeCreators' answers, and for
// counting how comments landed. Pure; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/rival-posts.test.ts

import { commentTexts, facebookPosts, tally, tiktokPosts, xPosts } from "@/lib/rival-posts";

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

// The shapes follow ScrapeCreators' documented answers.
const TIKTOK = {
  aweme_list: [
    {
      aweme_id: "7560000000000000001",
      desc: "Maji kwa kila mtaa",
      create_time: 1790640000,
      statistics: { play_count: 90000, digg_count: 12000, comment_count: 800, share_count: 400 },
    },
    { desc: "no id" },
  ],
};
eq("TikTok videos", tiktokPosts(TIKTOK, "he.babuowino"), [
  {
    platform: "tiktok",
    url: "https://www.tiktok.com/@he.babuowino/video/7560000000000000001",
    text: "Maji kwa kila mtaa",
    publishedAt: "2026-09-29T00:00:00.000Z",
    reach: 13200,
  },
]);

const X = {
  tweets: [
    {
      rest_id: "1970000000000000001",
      legacy: {
        full_text: "Nairobi deserves better.",
        created_at: "Mon Sep 28 09:30:00 +0000 2026",
        favorite_count: 1500,
        reply_count: 300,
        retweet_count: 200,
        quote_count: 20,
      },
    },
  ],
};
eq("tweets", xPosts(X, "HEBabuOwino"), [
  {
    platform: "x",
    url: "https://x.com/HEBabuOwino/status/1970000000000000001",
    text: "Nairobi deserves better.",
    publishedAt: "2026-09-28T09:30:00.000Z",
    reach: 2020,
  },
]);

const FB = {
  posts: [
    {
      id: "p1",
      text: "Drainage works in Githogoro",
      url: "https://www.facebook.com/sakaja/posts/p1",
      publishTime: 1790640000,
      reactionCount: 900,
      commentCount: 120,
    },
    { id: "p2", text: "no link", url: "javascript:alert(1)", publishTime: 1790640000 },
  ],
};
eq("Facebook posts, web links only", facebookPosts(FB), [
  {
    platform: "facebook",
    url: "https://www.facebook.com/sakaja/posts/p1",
    text: "Drainage works in Githogoro",
    publishedAt: "2026-09-29T00:00:00.000Z",
    reach: 1020,
  },
]);
eq(
  "an empty or odd answer, no posts",
  [tiktokPosts(null, "x"), xPosts({ tweets: "no" }, "x")],
  [[], []],
);

eq(
  "comment words only",
  commentTexts({
    comments: [
      { text: " Maji hakuna! ", user: { nickname: "someone", uid: "1" } },
      { text: "" },
      { user: {} },
    ],
  }),
  ["Maji hakuna!"],
);

eq(
  "how comments landed",
  tally([
    { sentiment: "negative", issue: "water" },
    { sentiment: "negative", issue: "Water" },
    { sentiment: "positive", issue: "general" },
    { sentiment: "neutral", issue: "roads" },
  ]),
  { positive: 1, negative: 2, issue: "water" },
);
eq("no issue among catch-alls", tally([{ sentiment: "neutral", issue: "general" }]).issue, null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
