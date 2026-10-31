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

/** The news search's answer (Serper), one story at each address. */
const search = (urls: string[], title = (i: number) => `Story ${i + 1} about water in Nairobi`) =>
  JSON.stringify({
    news: urls.map((u, i) => ({
      title: title(i),
      link: u,
      snippet: "Residents wait for tankers.",
      date: "1 hour ago",
      source: "Test Courier",
      position: i + 1,
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
  process.env["GEMINI_API_KEY"] = "test-key";
  process.env["SERPER_API_KEY"] = "test-key";
  delete process.env["SCRAPECREATORS_API_KEY"];

  {
    const sb = world();
    stubFetch((u) =>
      u.includes("google.serper.dev")
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
      u.includes("google.serper.dev")
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
        : u.includes("google.serper.dev")
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
      u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS },
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
      u.includes("google.serper.dev") ? { status: 500, body: "try later" } : { body: NO_MOODS },
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
      (u) => (u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS }),
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
    // One story found by an outlet's feed and by the news search is kept once, under the feed's address.
    const sb = world();
    const same = "Water shortage in Nairobi: tankers promised";
    stubFetch(
      (u) =>
        u.includes("google.serper.dev")
          ? { body: search(["https://www.outlet.test/water?from=search"], () => same) }
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
      u.includes("google.serper.dev")
        ? { body: search(["https://www.courier.test/story-1"]) }
        : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a news-search story is kept as news, under its outlet's site",
      sb.tables["listening_mentions"]?.map((m) => [m["source"], m["domain"]]),
      [["news", "courier.test"]],
    );
  }
  {
    // A news search that fails never stops the rest of the keyword.
    const FEED = "https://www.google.com/alerts/feeds/0123/4567";
    const sb = world({ listening_topics: [{ ...TOPIC, alert_feed_url: FEED }] });
    stubFetch((u) =>
      u === FEED
        ? { body: ALERT_XML }
        : u.includes("google.serper.dev")
          ? { status: 503, body: "later" }
          : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a failed news search leaves the keyword's Google Alert read",
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
      u.includes("google.serper.dev")
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
    // A model's minute used up is not a stopped sweep: that read waits for the next run.
    const minute = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "Quota exceeded.",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
          },
        ],
      },
    });
    const sb = world();
    stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search(["https://news.test/a"]) }
        : u.includes("generativelanguage")
          ? { status: 429, body: minute }
          : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a minute's allowance used up does not pause the sweep",
      [r.paused, sb.tables["listening_jobs"]?.[0]?.["status"]],
      [undefined, "idle"],
    );
  }
  {
    const badKey = JSON.stringify({
      error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid." },
    });
    const sb = world();
    stubFetch((u) =>
      u.includes("google.serper.dev")
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
      u.includes("google.serper.dev")
        ? { body: search(["https://news.test/a"]) }
        : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("with no AI key the sweep pauses and says so", r.paused, "AI is not configured.");
    eq("the stories were still stored", r.stored, 1);
    process.env["GEMINI_API_KEY"] = "test-key";
  }

  {
    // The news search costs a credit a keyword: with no key it is left out, and the sweep says so.
    delete process.env["SERPER_API_KEY"];
    const sb = world();
    const calls = stubFetch((u) =>
      u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "with no Serper key no search is made",
      calls.some((c) => c.includes("google.serper.dev")),
      false,
    );
    eq(
      "and the shared note says it is off",
      String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "").includes(
        "Keyword news search is off",
      ),
      true,
    );
    process.env["SERPER_API_KEY"] = "test-key";
  }
  {
    // A wrong key or used-up credits: asked once, then left alone for the rest of the sweep.
    const sb = world({
      listening_topics: [TOPIC, { ...TOPIC, id: "t2", label: "Roads", query: "Nairobi roads" }],
    });
    const calls = stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { status: 400, body: JSON.stringify({ message: "Not enough credits", statusCode: 400 }) }
        : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a refused search is asked once",
      calls.filter((c) => c.includes("google.serper.dev")).length,
      1,
    );
    eq(
      "the shared note says the search stopped, naming no keyword",
      [
        String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "").includes(
          "Keyword news search stopped",
        ),
        String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "").includes("Water"),
      ],
      [true, false],
    );
    eq("and it does not pause the sweep", r.paused, undefined);
  }
  {
    // An extra keyword of two words is searched as a phrase.
    const sb = world({
      listening_topics: [
        { ...TOPIC, query: "Githunguri milk", keywords: ["fresha", "githunguri dairy"] },
      ],
    });
    const asked: string[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (OUTLET_URLS.has(u)) return new Response(OUTLET_QUIET);
      if (u.includes("google.serper.dev")) {
        asked.push(String(init?.body ?? ""));
        return new Response(search([]));
      }
      return new Response(NO_MOODS);
    }) as typeof fetch;
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "the search is Kenya's, the last week, the phrase in quotes",
      asked
        .map((b) => JSON.parse(b) as Record<string, unknown>)
        .map((b) => [b["q"], b["gl"], b["tbs"]]),
      [['Githunguri milk (fresha OR "githunguri dairy")', "ke", "qdr:w"]],
    );
  }
  {
    // Moods are read for each campaign in turn, so a busy campaign never keeps another's unread.
    const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const post = (id: string, campaign: string, hoursAgo: number) => ({
      id,
      campaign_id: campaign,
      topic_id: "t1",
      url: `https://posts.test/${id}`,
      title: `Post ${id}`,
      snippet: null,
      sentiment: null,
      found_at: at(hoursAgo),
    });
    const sb = world({
      listening_mentions: [
        post("busy-1", "c1", 1),
        post("busy-2", "c1", 2),
        post("busy-3", "c1", 3),
        post("quiet-1", "c2", 9),
      ],
    });
    const prompts: string[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (OUTLET_URLS.has(u)) return new Response(OUTLET_QUIET);
      if (u.includes("google.serper.dev")) return new Response(search([]));
      prompts.push(String(init?.body ?? ""));
      return new Response(NO_MOODS);
    }) as typeof fetch;
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 2 });
    eq("two batches in a sweep", prompts.length, 2);
    eq(
      "the first batch takes the quiet campaign's post beside the busy one's newest",
      [
        prompts[0]?.includes("busy-1"),
        prompts[0]?.includes("quiet-1"),
        prompts[0]?.includes("busy-2"),
      ],
      [true, true, false],
    );
    eq(
      "the second batch takes the rest",
      [prompts[1]?.includes("busy-2"), prompts[1]?.includes("busy-3")],
      [true, true],
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
      u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS },
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
      u.includes("google.serper.dev")
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
      u.includes("google.serper.dev")
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
      u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40, credits: null });
    eq(
      "a sweep that may not spend credits leaves social search out",
      calls.some((c) => c.includes("scrapecreators")),
      false,
    );
  }
  {
    // The paid social search runs every six hours, not every hour, and keeps its own clock.
    const social = (calls: string[]) => calls.filter((c) => c.includes("scrapecreators")).length;
    const answer = (u: string) =>
      u.includes("google.serper.dev")
        ? { body: search([]) }
        : u.includes("scrapecreators")
          ? { body: "{}" }
          : { body: NO_MOODS };
    const sb = world({}, { take_social_credits: () => true });
    const calls = stubFetch(answer);
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("the first sweep searches the social platforms", social(calls), 3);
    const record = () => sb.tables["listening_jobs"]?.find((j) => j["key"] === "listening_social");
    eq(
      "and writes down when",
      [typeof record()?.["last_run_at"], record()?.["detail"]],
      ["string", "1 keyword searched on social platforms."],
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("the next sweep, soon after, leaves the paid search alone", social(calls), 3);
    record()!["last_run_at"] = new Date(Date.now() - 6 * 3_600_000).toISOString();
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("six hours on, it searches again", social(calls), 6);
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40, force: true });
    eq("Sweep now does not wait for the six hours", social(calls), 9);
  }
  {
    // A run that could not search (no credits left) is not written down, so the next sweep tries.
    const sb = world({}, { take_social_credits: () => false });
    stubFetch((u) => (u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS }));
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "no credits: the clock does not start",
      sb.tables["listening_jobs"]?.some((j) => j["key"] === "listening_social"),
      false,
    );
  }
  {
    // A run spends its share of the day, not the day: 12 credits is a keyword a run.
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "12";
    const topic = (id: string, label: string) => ({
      ...TOPIC,
      id,
      label,
      query: `Nairobi ${label}`,
    });
    const sb = world(
      { listening_topics: [TOPIC, topic("t2", "roads"), topic("t3", "health")] },
      { take_social_credits: () => true },
    );
    const calls = stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search([]) }
        : u.includes("scrapecreators")
          ? { body: "{}" }
          : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "three keywords in the sweep, one searched socially",
      calls.filter((c) => c.includes("scrapecreators")).length,
      3,
    );
    delete process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"];
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
