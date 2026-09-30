// Checks for the listening sweep: what it stores, what it reads and what it
// spends. Uses a stand-in database and stand-ins for web search, the AI and
// ScrapeCreators; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening.test.ts

import { runListeningScan } from "@/lib/listening.server";
import { dailyCredits } from "@/lib/social-credits";

import { ALERT_XML } from "./alert-feed-fixture";
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

/** The AI, answering with no verdicts: moods aren't what these checks are about. */
const NO_MOODS = `data: ${JSON.stringify({
  type: "response.output_text.delta",
  delta: JSON.stringify({ results: [] }),
})}\n\n`;

function stubFetch(route: (url: string) => { status?: number; body: string }) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    const r = route(String(url));
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const search = (urls: string[]) =>
  JSON.stringify({
    data: urls.map((u, i) => ({
      url: u,
      title: `Story ${i + 1}`,
      description: "About water in Nairobi.",
    })),
  });

const TOPIC = {
  id: "t1",
  campaign_id: "c1",
  label: "Water",
  query: "Nairobi water",
  kind: "issue",
  active: true,
  keywords: [],
  exclude_terms: [],
  last_scanned_at: null,
  alert_feed_url: null,
};

function world(
  extra: Record<string, Record<string, unknown>[]> = {},
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {},
) {
  return fakeSupabase(
    {
      listening_topics: [TOPIC],
      listening_mentions: [],
      listening_jobs: [],
      listening_alerts: [],
      ...extra,
    },
    rpcs,
  );
}

async function main() {
  process.env["LOVABLE_API_KEY"] = "test-key";
  process.env["FIRECRAWL_API_KEY"] = "test-key";
  delete process.env["SCRAPECREATORS_API_KEY"];

  {
    const sb = world();
    stubFetch((u) =>
      u.includes("firecrawl")
        ? { body: search(["https://news.test/a", "https://news.test/b"]) }
        : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("what the sweep finds is stored", r.stored, 2);
    eq(
      "under the topic's campaign",
      sb.tables["listening_mentions"]?.map((m) => m["campaign_id"]),
      ["c1", "c1"],
    );
    const again = await runListeningScan(sb as never, {
      topicLimit: 4,
      classifyLimit: 40,
      force: true,
    });
    eq(
      "the same stories again are not stored twice",
      [again.stored, sb.tables["listening_mentions"]?.length],
      [0, 2],
    );
  }
  {
    const sb = world({
      listening_mentions: [
        { id: "m0", campaign_id: "c2", url: "https://news.test/a", source: "news" },
      ],
    });
    stubFetch((u) =>
      u.includes("firecrawl") ? { body: search(["https://news.test/a"]) } : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("a story another campaign has is still stored for this one", r.stored, 1);
  }
  {
    const FEED = "https://www.google.com/alerts/feeds/0123/4567";
    const sb = world({ listening_topics: [{ ...TOPIC, alert_feed_url: FEED }] });
    const calls = stubFetch((u) =>
      u === FEED
        ? { body: ALERT_XML }
        : u.includes("firecrawl")
          ? { body: search([]) }
          : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("the keyword's Google Alert feed is read", calls.includes(FEED), true);
    eq(
      "its stories are stored as Google Alerts, at the article's own address",
      sb.tables["listening_mentions"]?.map((m) => [m["source"], m["url"]]),
      [["google_alerts", "https://www.the-star.co.ke/news/2026-09-29-water/"]],
    );
  }
  {
    const sb = world({
      listening_topics: [{ ...TOPIC, alert_feed_url: "https://evil.test/feed" }],
    });
    const calls = stubFetch((u) =>
      u.includes("firecrawl") ? { body: search([]) } : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a feed link that isn't Google's is never fetched",
      calls.some((c) => c.includes("evil.test")),
      false,
    );
    eq(
      "and the sweep says so",
      r.notes.some((n) => n.includes("not a Google Alerts feed")),
      true,
    );
  }

  // ScrapeCreators keyword search comes out of a daily budget.
  process.env["SCRAPECREATORS_API_KEY"] = "test-key";
  {
    const asked: number[] = [];
    const sb = world(
      {},
      {
        take_social_credits: (a) => {
          asked.push(Number(a["_n"]));
          return false;
        },
      },
    );
    const calls = stubFetch((u) =>
      u.includes("firecrawl") ? { body: search([]) } : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "no credits left: ScrapeCreators is not asked",
      calls.some((c) => c.includes("scrapecreators")),
      false,
    );
    eq("the three searches are asked for together", asked, [3]);
    eq(
      "and the sweep says why",
      r.notes.some((n) => n.includes("today's ScrapeCreators credits")),
      true,
    );
  }
  {
    const sb = world({}, { take_social_credits: () => true });
    const calls = stubFetch((u) =>
      u.includes("firecrawl")
        ? { body: search([]) }
        : u.includes("scrapecreators")
          ? { body: "{}" }
          : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "with credits: TikTok, Reddit and YouTube",
      calls.filter((c) => c.includes("scrapecreators")).length,
      3,
    );
  }
  {
    // "Sweep now" counts credits with the server's own client, not the person's.
    const personAsked: string[] = [];
    const sb = world(
      {},
      {
        take_social_credits: () => {
          personAsked.push("person");
          return true;
        },
      },
    );
    const serverAsked: number[] = [];
    const server = {
      rpc: async (fn: string, a: Record<string, unknown>) => {
        serverAsked.push(Number(a["_n"]));
        return { data: fn === "take_social_credits", error: null };
      },
    };
    const calls = stubFetch((u) =>
      u.includes("firecrawl")
        ? { body: search([]) }
        : u.includes("scrapecreators")
          ? { body: "{}" }
          : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40, credits: server });
    eq(
      "credits are counted by the server",
      [serverAsked, personAsked, calls.filter((c) => c.includes("scrapecreators")).length],
      [[3], [], 3],
    );
  }
  {
    const sb = world({}, { take_social_credits: () => true });
    const calls = stubFetch((u) =>
      u.includes("firecrawl") ? { body: search([]) } : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40, credits: null });
    eq(
      "a sweep that may not spend credits leaves social search out",
      calls.some((c) => c.includes("scrapecreators")),
      false,
    );
  }
  delete process.env["SCRAPECREATORS_API_KEY"];
  process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "25";
  eq("the limit comes from the environment", dailyCredits("keywords"), 25);
  process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "lots";
  eq("an unreadable limit falls back to 60", dailyCredits("keywords"), 60);
  delete process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"];
  eq("the rivals' limit is its own", dailyCredits("rivals"), 60);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
