// Checks for the listening sweep: what it stores, what it reads and what it
// spends. Uses a stand-in database and stand-ins for the news feeds, Google News,
// the AI (Gemini) and ScrapeCreators; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening.test.ts

import { runListeningScan } from "@/lib/listening.server";
import { OUTLET_FEEDS } from "@/lib/news-feeds";
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

/** The AI (Gemini), answering with no verdicts: moods aren't what these checks are about. */
const NO_MOODS = JSON.stringify({
  candidates: [
    {
      content: { role: "model", parts: [{ text: JSON.stringify({ results: [] }) }] },
      finishReason: "STOP",
    },
  ],
});

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;

/** Every outlet feed answers with one story that no keyword here asks for, unless a check says otherwise. */
const OUTLET_QUIET = rss(
  "<item><title>Unrelated story</title><link>https://outlet.test/unrelated</link></item>",
);
const OUTLET_URLS = new Set(OUTLET_FEEDS.map((f) => f.url));

function stubFetch(
  route: (url: string) => { status?: number; body: string },
  outlets: string = OUTLET_QUIET,
) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    if (OUTLET_URLS.has(String(url))) return new Response(outlets, { status: 200 });
    const r = route(String(url));
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

/** Google News's search feed, with one story at each address. */
const search = (urls: string[], title = (i: number) => `Story ${i + 1} about water in Nairobi`) =>
  rss(
    urls
      .map(
        (u, i) =>
          `<item><title>${title(i)} - Test Courier</title><link>${u}</link>` +
          `<pubDate>${new Date().toUTCString()}</pubDate>` +
          `<source url="https://courier.test">Test Courier</source></item>`,
      )
      .join(""),
  );

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
  process.env["GEMINI_API_KEY"] = "test-key";
  delete process.env["SCRAPECREATORS_API_KEY"];

  {
    const sb = world();
    stubFetch((u) =>
      u.includes("news.google.com")
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
      u.includes("news.google.com")
        ? { body: search(["https://news.test/a"]) }
        : { body: NO_MOODS },
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
        : u.includes("news.google.com")
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
      u.includes("news.google.com") ? { body: search([]) } : { body: NO_MOODS },
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

  {
    // Every campaign's team can read the sweep's job row, so it names no keyword.
    const sb = world();
    stubFetch((u) =>
      u.includes("news.google.com") ? { status: 500, body: "try later" } : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "the shared note says what failed, without the keyword",
      sb.tables["listening_jobs"]?.[0]?.["detail"],
      "1 keyword could not be searched.",
    );
    eq(
      "the one who swept hears which",
      r.notes.some((n) => n.startsWith("Water:")),
      true,
    );
  }

  {
    // The outlets' own feeds are read against every keyword, and cost nothing.
    const sb = world();
    const now = new Date().toUTCString();
    const calls = stubFetch(
      (u) => (u.includes("news.google.com") ? { body: search([]) } : { body: NO_MOODS }),
      rss(
        "<item><title>Water shortage in Nairobi: tankers promised</title>" +
          `<link>https://outlet.test/water</link><pubDate>${now}</pubDate>` +
          "<description>Residents wait.</description></item>" +
          "<item><title>Mombasa port fees rise</title><link>https://outlet.test/port</link></item>",
      ),
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a story that answers the keyword is stored from the outlets' feeds",
      sb.tables["listening_mentions"]?.map((m) => [
        m["source"],
        m["url"],
        m["domain"],
        m["campaign_id"],
      ]),
      [["news", "https://outlet.test/water", "outlet.test", "c1"]],
    );
    eq("and one that doesn't is left out", r.stored, 1);
    eq(
      "each outlet feed is read once",
      OUTLET_FEEDS.every((f) => calls.filter((c) => c === f.url).length === 1),
      true,
    );
    eq(
      "the moods are read by the lighter Gemini model",
      calls.some((c) => c.includes("/models/gemini-3.5-flash-lite:generateContent")),
      true,
    );
  }
  {
    // One story found by an outlet's feed and by Google News is kept once, under the outlet's address.
    const sb = world();
    const same = "Water shortage in Nairobi: tankers promised";
    stubFetch(
      (u) =>
        u.includes("news.google.com")
          ? { body: search(["https://news.google.com/rss/articles/CBMiExample?oc=5"], () => same) }
          : { body: NO_MOODS },
      rss(
        `<item><title>${same}</title><link>https://outlet.test/water</link>` +
          `<pubDate>${new Date().toUTCString()}</pubDate></item>`,
      ),
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "the same headline from two sources is stored once",
      sb.tables["listening_mentions"]?.map((m) => m["url"]),
      ["https://outlet.test/water"],
    );
  }
  {
    const sb = world();
    stubFetch((u) =>
      u.includes("news.google.com")
        ? { body: search(["https://news.google.com/rss/articles/CBMiOne"]) }
        : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a Google News story is kept as news, under the outlet's own site",
      sb.tables["listening_mentions"]?.map((m) => [m["source"], m["domain"]]),
      [["news", "courier.test"]],
    );
  }
  {
    // Google News is free and unguaranteed: refusing never stops the rest of the keyword.
    const FEED = "https://www.google.com/alerts/feeds/0123/4567";
    const sb = world({ listening_topics: [{ ...TOPIC, alert_feed_url: FEED }] });
    stubFetch((u) =>
      u === FEED
        ? { body: ALERT_XML }
        : u.includes("news.google.com")
          ? { status: 503, body: "later" }
          : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "Google News refusing leaves the keyword's Google Alert read",
      sb.tables["listening_mentions"]?.map((m) => m["source"]),
      ["google_alerts"],
    );
    eq("and does not pause the sweep", r.paused, undefined);
  }
  {
    // The AI is what can stop a sweep: a limit reached, a key turned away, or no key at all.
    const limit = JSON.stringify({
      error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." },
    });
    const sb = world();
    stubFetch((u) =>
      u.includes("news.google.com")
        ? { body: search(["https://news.test/a"]) }
        : u.includes("generativelanguage")
          ? { status: 429, body: limit }
          : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "when the AI's limit is reached the sweep pauses, and says why",
      [r.paused, sb.tables["listening_jobs"]?.[0]?.["status"]],
      ["AI stopped (429): RESOURCE_EXHAUSTED: Quota exceeded.", "paused"],
    );
  }
  {
    const badKey = JSON.stringify({
      error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid." },
    });
    const sb = world();
    stubFetch((u) =>
      u.includes("news.google.com")
        ? { body: search(["https://news.test/a"]) }
        : u.includes("generativelanguage")
          ? { status: 400, body: badKey }
          : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a key the AI turns away pauses the sweep too",
      r.paused,
      "AI stopped (400): INVALID_ARGUMENT: API key not valid.",
    );
  }
  {
    delete process.env["GEMINI_API_KEY"];
    const sb = world();
    stubFetch((u) =>
      u.includes("news.google.com")
        ? { body: search(["https://news.test/a"]) }
        : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("with no AI key the sweep pauses and says so", r.paused, "AI is not configured.");
    eq("the stories were still stored", r.stored, 1);
    process.env["GEMINI_API_KEY"] = "test-key";
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
      u.includes("news.google.com") ? { body: search([]) } : { body: NO_MOODS },
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
      u.includes("news.google.com")
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
      u.includes("news.google.com")
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
      u.includes("news.google.com") ? { body: search([]) } : { body: NO_MOODS },
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
