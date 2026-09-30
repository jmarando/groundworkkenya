// Checks for the daily rival sweep: posts become mentions of the rival, how
// comments landed is counted but never kept, and every request comes out of
// the day's budget. Uses a stand-in database and stand-ins for ScrapeCreators
// and the AI; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/race-sweep.test.ts

import { runRivalSweep } from "@/lib/race-sweep.server";

import { fakeSupabase } from "./fake-supabase";

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

const NOW = new Date(Date.UTC(2026, 8, 29, 12));
const secs = (daysAgo: number) => Math.floor(NOW.getTime() / 1000) - daysAgo * 86400;

let likes = 1000;
const tiktok = () => ({
  aweme_list: [
    {
      aweme_id: "111",
      desc: "Maji kwa kila mtaa",
      create_time: secs(1),
      statistics: { digg_count: likes, comment_count: 200, share_count: 50 },
    },
    {
      aweme_id: "222",
      desc: "An old video",
      create_time: secs(10),
      statistics: { digg_count: 5, comment_count: 1, share_count: 0 },
    },
  ],
});
const TWEETS = {
  tweets: [
    {
      rest_id: "333",
      legacy: {
        full_text: "Nairobi deserves better.",
        created_at: "Mon Sep 28 12:00:00 +0000 2026",
        favorite_count: 1500,
        reply_count: 300,
        retweet_count: 200,
        quote_count: 20,
      },
    },
  ],
};
const COMMENTS = {
  comments: [
    { text: "Maji hakuna!", user: { nickname: "a person", uid: "1" } },
    { text: "Great work", user: { nickname: "another", uid: "2" } },
  ],
  has_more: false,
  cursor: 20,
};
const MOODS = `data: ${JSON.stringify({
  type: "response.output_text.delta",
  delta: JSON.stringify({
    results: [
      { i: 0, sentiment: "negative", issue: "water" },
      { i: 1, sentiment: "positive", issue: "general" },
    ],
  }),
})}\n\n`;

type Route = (url: string) => { status?: number; body: string } | null;
function stubFetch(route: Route = () => null) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    const r =
      route(u) ??
      (u.includes("/v3/tiktok/profile/videos")
        ? { body: JSON.stringify(tiktok()) }
        : u.includes("/v1/twitter/user-tweets")
          ? { body: JSON.stringify(u.includes("Other1") ? { tweets: [] } : TWEETS) }
          : u.includes("/v1/tiktok/video/comments")
            ? { body: JSON.stringify(COMMENTS) }
            : u.includes("ai.gateway")
              ? { body: MOODS }
              : { status: 404, body: "not here" });
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}
const scCalls = (calls: string[]) => calls.filter((c) => c.includes("scrapecreators"));

function world(cap = 60) {
  let used = 0;
  return fakeSupabase(
    {
      race_rivals: [
        {
          id: "r1",
          campaign_id: "c2",
          name: "Babu Owino",
          tiktok: "he.babuowino",
          x: "HEBabuOwino",
          facebook: null,
        },
        {
          id: "r2",
          campaign_id: "c3",
          name: "Other Rival",
          tiktok: null,
          x: "Other1",
          facebook: null,
        },
      ],
      listening_mentions: [],
      listening_jobs: [],
    },
    {
      take_social_credits: (a) => {
        const n = Number(a["_n"]);
        if (used + n > cap) return false;
        used += n;
        return true;
      },
    },
  );
}
const mentions = (sb: ReturnType<typeof world>) => sb.tables["listening_mentions"] ?? [];

async function main() {
  process.env["SCRAPECREATORS_API_KEY"] = "test-key";
  process.env["LOVABLE_API_KEY"] = "test-key";

  {
    const sb = world();
    const calls = stubFetch();
    const r = await runRivalSweep(sb as never, { now: NOW });
    const ms = mentions(sb);
    eq(
      "posts become mentions of the rival, in the rival's campaign",
      ms.map((m) => [m["source"], m["rival_id"], m["campaign_id"], m["author"], m["reach"]]),
      [
        ["tiktok", "r1", "c2", "Babu Owino", 1250],
        ["x", "r1", "c2", "Babu Owino", 2020],
      ],
    );
    eq(
      "a ten-day-old video is left out",
      ms.some((m) => String(m["url"]).endsWith("/222")),
      false,
    );
    const video = ms.find((m) => m["source"] === "tiktok");
    eq(
      "how the video landed, counted",
      [
        video?.["comments_read"],
        video?.["comments_positive"],
        video?.["comments_negative"],
        video?.["comments_issue"],
      ],
      [2, 1, 1, "water"],
    );
    eq("no comment is kept anywhere", JSON.stringify(sb.tables).includes("Maji hakuna"), false);
    eq("nor who wrote one", JSON.stringify(sb.tables).includes("a person"), false);
    eq(
      "no replies are asked of X",
      calls.some((c) => c.includes("/v1/twitter/tweet")),
      false,
    );
    eq("every request came out of the budget", r.requests, scCalls(calls).length);
    eq("four requests: two feeds, one page of comments, one more feed", r.requests, 4);
    eq(
      "a clean read leaves no note for Listening",
      sb.tables["listening_jobs"]?.[0]?.["detail"],
      null,
    );

    const before = calls.length;
    eq(
      "once a day: a second run does nothing",
      (await runRivalSweep(sb as never, { now: NOW })).ran,
      false,
    );
    eq("and asks nothing", calls.length, before);

    likes = 2000;
    await runRivalSweep(sb as never, { now: NOW, force: true });
    const again = mentions(sb).find((m) => m["source"] === "tiktok");
    eq(
      "a post seen again keeps its counts, with its reach brought up to date",
      [mentions(sb).length, again?.["comments_read"], again?.["reach"]],
      [2, 2, 2250],
    );
    likes = 1000;
  }
  {
    const sb = world(1);
    const calls = stubFetch();
    const r = await runRivalSweep(sb as never, { now: NOW });
    eq("the day's limit stops it", scCalls(calls).length, 1);
    eq(
      "and it says so",
      r.notes.some((n) => n.includes("limit")),
      true,
    );
  }
  {
    const sb = world();
    const calls = stubFetch((u) =>
      u.includes("/v3/tiktok/profile/videos") ? { status: 500, body: "try later" } : null,
    );
    const r = await runRivalSweep(sb as never, { now: NOW });
    eq(
      "one platform failing doesn't stop the rest",
      mentions(sb).map((m) => m["source"]),
      ["x"],
    );
    eq(
      "the other rival is still read",
      scCalls(calls).some((c) => c.includes("Other1")),
      true,
    );
    // Every campaign's team can read the job, so its note names no rival.
    const detail = String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");
    eq(
      "Listening is told an account could not be read, without naming it",
      [detail, detail.includes("Babu"), detail.includes("babuowino")],
      ["1 account could not be read.", false, false],
    );
    eq(
      "the scheduler hears which",
      r.notes.some((n) => n.startsWith("Babu Owino on tiktok")),
      true,
    );
  }
  {
    const sb = world();
    const calls = stubFetch((u) =>
      u.includes("scrapecreators") ? { status: 402, body: "out of credits" } : null,
    );
    const r = await runRivalSweep(sb as never, { now: NOW });
    eq("out of ScrapeCreators credits: it stops asking", scCalls(calls).length, 1);
    eq(
      "and says so",
      r.notes.some((n) => n.includes("out of credits")),
      true,
    );
  }
  {
    delete process.env["SCRAPECREATORS_API_KEY"];
    const sb = world();
    const calls = stubFetch();
    const r = await runRivalSweep(sb as never, { now: NOW });
    eq("no key: nothing asked", [r.ran, r.requests, scCalls(calls).length], [true, 0, 0]);
    eq(
      "and Listening is told",
      String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "").includes("not connected"),
      true,
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
