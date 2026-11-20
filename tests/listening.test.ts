// Checks for the listening sweep: what it stores, what it reads and what it
// spends. Uses a stand-in database and stand-ins for the news feeds, Google News,
// the AI (Gemini) and ScrapeCreators; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening.test.ts

import { runListeningScan, takeBackupNote } from "@/lib/listening.server";
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

/** ScrapeCreators' TikTok keyword search answering with these results; its other searches find nothing. */
const tiktokSearch = (results: unknown[]) => (u: string) =>
  u.includes("google.serper.dev")
    ? { body: search([]) }
    : u.includes("/v1/tiktok/search/keyword")
      ? { body: JSON.stringify({ success: true, search_item_list: results }) }
      : u.includes("scrapecreators")
        ? { body: "{}" }
        : { body: NO_MOODS };

/** Every search answers, finding nothing: the news search, TikTok, Reddit and YouTube. */
const quietSocial = (u: string) =>
  u.includes("google.serper.dev")
    ? { body: search([]) }
    : u.includes("scrapecreators")
      ? { body: "{}" }
      : { body: NO_MOODS };

/** The keywords TikTok was asked for, in order: one per keyword searched on the social platforms. */
const tiktokAsked = (calls: string[]) =>
  calls
    .filter((c) => c.includes("/v1/tiktok/search/keyword"))
    .map((c) => new URL(c).searchParams.get("query"));

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

/** n active keywords of one campaign, none searched yet: t1 ("Nairobi keyword 1") onwards. */
const keywords = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    ...TOPIC,
    id: `t${i + 1}`,
    label: `Keyword ${i + 1}`,
    query: `Nairobi keyword ${i + 1}`,
  }));

function world(
  extra: Record<string, Record<string, unknown>[]> = {},
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {},
  refuse: Record<string, (r: Record<string, unknown>) => string | null> = {},
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
    refuse,
  );
}

/** The database refusing one post, as a constraint would. */
const CONSTRAINT = 'new row for relation "listening_mentions" violates check constraint';
const refusing = (url: string) => ({
  listening_mentions: (r: Record<string, unknown>) => (r["url"] === url ? CONSTRAINT : null),
});

/**
 * The database before schema 51: listening_topics has no social_scanned_at yet, so ordering by it
 * or writing it is refused, as PostgREST refuses a column it doesn't know.
 */
function beforeMigration(sb: ReturnType<typeof fakeSupabase>) {
  const unknown = {
    code: "42703",
    message: "column listening_topics.social_scanned_at does not exist",
  };
  return {
    ...sb,
    from(table: string) {
      const q = sb.from(table);
      if (table !== "listening_topics") return q;
      let refused = false;
      const { order, update, then } = q;
      return Object.assign(q, {
        order(c: string, o?: { ascending?: boolean }) {
          refused ||= c === "social_scanned_at";
          return order(c, o);
        },
        update(v: Record<string, unknown>) {
          refused ||= "social_scanned_at" in v;
          return update(v);
        },
        then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return refused
            ? Promise.resolve({ data: null, error: unknown }).then(resolve, reject)
            : then(resolve, reject);
        },
      });
    },
  };
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
    // One post the database refuses costs only itself, not the keyword's whole find.
    const sb = world({}, {}, refusing("https://news.test/b"));
    stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search(["https://news.test/a", "https://news.test/b", "https://news.test/c"]) }
        : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a refused post leaves the keyword's others stored",
      [r.stored, sb.tables["listening_mentions"]?.map((m) => m["url"])],
      [2, ["https://news.test/a", "https://news.test/c"]],
    );
    eq(
      "the one who swept hears how many were lost, and why",
      r.notes.filter((n) => n.includes("could not be stored")),
      [`Water: 1 of 3 posts found could not be stored (${CONSTRAINT}).`],
    );
    eq(
      "the shared note counts them, naming no keyword",
      sb.tables["listening_jobs"]?.[0]?.["detail"],
      "1 post could not be stored.",
    );
  }
  {
    // The same for the outlets' own feeds.
    const sb = world({}, {}, refusing("https://outlet.test/water-2"));
    const now = new Date().toUTCString();
    stubFetch(
      (u) => (u.includes("google.serper.dev") ? { body: search([]) } : { body: NO_MOODS }),
      rss(
        `<item><title>Water shortage in Nairobi: tankers promised</title><link>https://outlet.test/water-1</link><pubDate>${now}</pubDate></item>` +
          `<item><title>Nairobi water rationing extended</title><link>https://outlet.test/water-2</link><pubDate>${now}</pubDate></item>`,
      ),
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a refused story leaves the feeds' other finds stored",
      [r.stored, sb.tables["listening_mentions"]?.map((m) => m["url"])],
      [1, ["https://outlet.test/water-1"]],
    );
    eq(
      "and the one who swept hears it",
      r.notes.filter((n) => n.includes("could not be stored")),
      [`Water: 1 of 2 posts the news feeds found could not be stored (${CONSTRAINT}).`],
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
    // With a key for Claude, a Gemini that cannot answer pauses nothing: Haiku reads, and the job says so.
    process.env["ANTHROPIC_API_KEY"] = "claude-key";
    takeBackupNote();
    const dayUsed = JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "Quota exceeded.",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
          },
        ],
      },
    });
    const claudeNoMoods = JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "toolu_1", name: "answer", input: { results: [] } }],
    });
    const sb = world();
    stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search(["https://news.test/a"]) }
        : u.includes("generativelanguage")
          ? { status: 429, body: dayUsed }
          : u.includes("api.anthropic.com")
            ? { body: claudeNoMoods }
            : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "with Claude as the backup a used-up Gemini day does not pause the sweep",
      [r.paused, sb.tables["listening_jobs"]?.[0]?.["status"]],
      [undefined, "idle"],
    );
    eq(
      "and the job says the backup AI read the posts",
      String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "").includes(
        "Gemini could not answer (its limit was reached), so Claude Haiku, the backup AI, gave 1 answer.",
      ),
      true,
    );
    delete process.env["ANTHROPIC_API_KEY"];
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
  {
    // TikTok's keyword search answers with each video wrapped in aweme_info.
    const sb = world({}, { take_social_credits: () => true });
    stubFetch(
      tiktokSearch([
        {
          aweme_info: {
            aweme_id: "7500000000000000001",
            desc: "Tankers are late again on our street",
            create_time: 1790640000,
            author: { unique_id: "maji.watch254" },
            statistics: { play_count: 31677, share_count: 22 },
          },
        },
      ]),
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    const row = sb.tables["listening_mentions"]?.[0];
    eq(
      "a wrapped TikTok video is stored, with who posted it and how far it went",
      [r.stored, row?.["url"], row?.["source"], row?.["author"], row?.["reach"], row?.["shares"]],
      [
        1,
        "https://www.tiktok.com/@maji.watch254/video/7500000000000000001",
        "tiktok",
        "@maji.watch254",
        31677,
        22,
      ],
    );
  }
  {
    // Results TikTok sends that cannot be read are said so, not passed off as nothing found.
    const sb = world({}, { take_social_credits: () => true });
    stubFetch(tiktokSearch([{ aweme_info: { desc: "No id, no link" } }]));
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "TikTok results that cannot be read are noted",
      r.notes.filter((n) => n.includes("TikTok")),
      ["Water social: TikTok search returned results that could not be read (first result: desc)."],
    );
    const job = sb.tables["listening_jobs"]?.find((j) => j["key"] === "listening_scan");
    eq(
      "counted as a failed social search, without pausing the sweep",
      [String(job?.["detail"] ?? "").includes("1 social search failed."), r.ran, r.paused ?? null],
      [true, true, null],
    );
  }
  {
    // A caption with an emoji across the cut: Postgres would refuse half an emoji, and with it the
    // keyword's whole find.
    const sb = world({}, { take_social_credits: () => true });
    const video = (id: string, desc: string) => ({
      aweme_info: {
        aweme_id: id,
        desc,
        create_time: 1790640000,
        author: { unique_id: "maji.watch254" },
      },
    });
    stubFetch(
      tiktokSearch([
        video("7500000000000000011", `${"a".repeat(299)}😀 tankers late`),
        video("7500000000000000012", "Maji yamefika 💧"),
      ]),
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "an emoji at the cut loses no post",
      [r.stored, sb.tables["listening_mentions"]?.map((m) => m["title"])],
      [2, ["a".repeat(299), "Maji yamefika 💧"]],
    );
    eq(
      "and nothing is said to be lost",
      r.notes.some((n) => n.includes("could not be stored")),
      false,
    );
  }
  {
    // Who posted is cut at 120 when stored: a channel name with an emoji across the cut.
    const sb = world({}, { take_social_credits: () => true });
    stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search([]) }
        : u.includes("/v1/youtube/search")
          ? {
              body: JSON.stringify({
                videos: [
                  {
                    url: "https://www.youtube.com/watch?v=abc",
                    title: "Maji Nairobi",
                    channel: { title: `${"c".repeat(119)}😀 TV` },
                  },
                ],
              }),
            }
          : u.includes("scrapecreators")
            ? { body: "{}" }
            : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "an author with an emoji at the cut loses no post",
      [r.stored, sb.tables["listening_mentions"]?.map((m) => m["author"])],
      [1, ["c".repeat(119)]],
    );
  }
  {
    // ScrapeCreators out of credits refuses every search: nothing was searched, so the six-hour
    // wait does not start, and the rest of the sweep leaves ScrapeCreators alone.
    const taken: number[] = [];
    const sb = world(
      { listening_topics: [TOPIC, { ...TOPIC, id: "t2", label: "Roads", query: "Nairobi roads" }] },
      {
        take_social_credits: (a) => {
          taken.push(Number(a["_n"]));
          return true;
        },
      },
    );
    const calls = stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search([]) }
        : u.includes("scrapecreators")
          ? { status: 402, body: JSON.stringify({ success: false, message: "Out of credits" }) }
          : { body: NO_MOODS },
    );
    const social = () => calls.filter((c) => c.includes("scrapecreators")).length;
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "every search refused for credits: no keywords are said to be searched, and no wait starts",
      sb.tables["listening_jobs"]?.find((j) => j["key"] === "listening_social") ?? null,
      null,
    );
    eq(
      "one keyword asked, not every one, and one keyword's credits taken",
      [social(), taken],
      [3, [3]],
    );
    const detail = String(
      sb.tables["listening_jobs"]?.find((j) => j["key"] === "listening_scan")?.["detail"] ?? "",
    );
    eq("the sweep says why, once", detail.split("ScrapeCreators is out of credits").length - 1, 1);
    eq(
      "the refused keywords are not marked as searched, so they stay first in line",
      sb.tables["listening_topics"]?.map((t) => t["social_scanned_at"] ?? null),
      [null, null],
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("the next sweep tries again, without waiting six hours", social(), 6);
  }
  {
    // A keyword some of whose searches answered was searched: its six hours start.
    const sb = world({}, { take_social_credits: () => true });
    stubFetch((u) =>
      u.includes("google.serper.dev")
        ? { body: search([]) }
        : u.includes("/v1/tiktok/search/keyword")
          ? { status: 402, body: "{}" }
          : u.includes("scrapecreators")
            ? { body: "{}" }
            : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "some searches answered: the clock starts",
      sb.tables["listening_jobs"]?.find((j) => j["key"] === "listening_social")?.["detail"],
      "1 keyword searched on social platforms.",
    );
  }
  // The social search takes its own keywords, apart from the hour's news keywords: the ones it
  // searched longest ago, as many as the run's share of the day's budget buys.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const socialClock = (sb: ReturnType<typeof world>) =>
    sb.tables["listening_jobs"]?.find((j) => j["key"] === "listening_social");
  {
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "24"; // two keywords a run
    const [k1, k2, k3, k4, k5] = keywords(5);
    const sb = world(
      {
        listening_topics: [
          { ...k1, last_scanned_at: null, social_scanned_at: hoursAgo(24) },
          { ...k2, last_scanned_at: hoursAgo(30), social_scanned_at: hoursAgo(48) },
          { ...k3, last_scanned_at: hoursAgo(30), social_scanned_at: null },
          { ...k4, last_scanned_at: hoursAgo(30), social_scanned_at: hoursAgo(72) },
          { ...k5, last_scanned_at: hoursAgo(30), social_scanned_at: null, active: false },
        ],
      },
      { take_social_credits: () => true },
    );
    const calls = stubFetch(quietSocial);
    await runListeningScan(sb as never, { topicLimit: 1, classifyLimit: 40 });
    const fresh = (col: string) =>
      (sb.tables["listening_topics"] ?? [])
        .filter((t) => String(t[col] ?? "") > hoursAgo(1))
        .map((t) => t["id"]);
    eq(
      "the social search takes the keyword it never searched, then the one it searched longest ago",
      tiktokAsked(calls),
      ["Nairobi keyword 3", "Nairobi keyword 4"],
    );
    eq("and marks those two as searched", fresh("social_scanned_at"), ["t3", "t4"]);
    eq("while the hour's news search took its own keyword", fresh("last_scanned_at"), ["t1"]);
    socialClock(sb)!["last_run_at"] = hoursAgo(6);
    await runListeningScan(sb as never, { topicLimit: 1, classifyLimit: 40 });
    eq(
      "six hours on, the next run takes the two now searched longest ago",
      tiktokAsked(calls).slice(2),
      ["Nairobi keyword 2", "Nairobi keyword 1"],
    );
    eq(
      "an inactive keyword is never searched",
      tiktokAsked(calls).includes("Nairobi keyword 5"),
      false,
    );
    delete process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"];
  }
  {
    // However few keywords the hour's news search takes, a run searches its share of the day: the
    // default 60 credits buy five keywords a run.
    const sb = world({ listening_topics: keywords(8) }, { take_social_credits: () => true });
    const calls = stubFetch(quietSocial);
    await runListeningScan(sb as never, { topicLimit: 2, classifyLimit: 40 });
    eq(
      "five keywords searched, though the hour's news search took two",
      [...tiktokAsked(calls)].sort(),
      [1, 2, 3, 4, 5].map((i) => `Nairobi keyword ${i}`),
    );
    eq(
      "and the clock's note counts them",
      socialClock(sb)?.["detail"],
      "5 keywords searched on social platforms.",
    );
  }
  {
    // Each post is kept under the keyword whose search found it, in that keyword's campaign.
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "24"; // two keywords a run
    const sb = world(
      {
        listening_topics: [
          TOPIC,
          { ...TOPIC, id: "t2", campaign_id: "c2", label: "Roads", query: "Kisumu roads" },
        ],
      },
      { take_social_credits: () => true },
    );
    const video = (q: string | null) =>
      q === "Nairobi water" ? "7500000000000000031" : "7500000000000000032";
    stubFetch((u) =>
      u.includes("/v1/tiktok/search/keyword")
        ? {
            body: JSON.stringify({
              success: true,
              search_item_list: [
                {
                  aweme_info: {
                    aweme_id: video(new URL(u).searchParams.get("query")),
                    desc: "Tankers and potholes",
                    author: { unique_id: "mtaa.news" },
                  },
                },
              ],
            }),
          }
        : quietSocial(u),
    );
    await runListeningScan(sb as never, { topicLimit: 1, classifyLimit: 40 });
    eq(
      "each keyword's find is stored under that keyword and its campaign",
      sb.tables["listening_mentions"]?.map((m) => [m["url"], m["topic_id"], m["campaign_id"]]),
      [
        ["https://www.tiktok.com/@mtaa.news/video/7500000000000000031", "t1", "c1"],
        ["https://www.tiktok.com/@mtaa.news/video/7500000000000000032", "t2", "c2"],
      ],
    );
    delete process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"];
  }
  {
    // Several keywords are searched at once, so twenty don't take twenty times as long as one:
    // the first alone, then at most four at a time (twelve searches).
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "240";
    const sb = world({ listening_topics: keywords(24) }, { take_social_credits: () => true });
    let open = 0;
    let most = 0;
    const asked: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (OUTLET_URLS.has(u)) return new Response(OUTLET_QUIET);
      if (u.includes("google.serper.dev")) return new Response(search([]));
      if (!u.includes("scrapecreators")) return new Response(NO_MOODS);
      asked.push(u);
      open++;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return new Response("{}");
    }) as typeof fetch;
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("240 credits: twenty keywords in the run", tiktokAsked(asked).length, 20);
    eq(
      "several keywords searched at once, never more than four",
      [most > 3, most <= 12],
      [true, true],
    );
    delete process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"];
  }
  {
    // However many keywords are due, the first is searched alone: when ScrapeCreators refuses it
    // for credits, no other keyword is asked, and only its three credits are taken.
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "240";
    const taken: number[] = [];
    const sb = world(
      { listening_topics: keywords(24) },
      {
        take_social_credits: (a) => {
          taken.push(Number(a["_n"]));
          return true;
        },
      },
    );
    const calls = stubFetch((u) =>
      u.includes("scrapecreators") ? { status: 402, body: "{}" } : quietSocial(u),
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "twenty keywords due, ScrapeCreators out of credits: one keyword asked, one keyword's credits",
      [calls.filter((c) => c.includes("scrapecreators")).length, taken],
      [3, [3]],
    );
    eq("and no wait starts", socialClock(sb) ?? null, null);
    delete process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"];
  }
  {
    // The day's credits running out partway stops the run there, and it is said once.
    let left = 2;
    const sb = world({ listening_topics: keywords(6) }, { take_social_credits: () => left-- > 0 });
    const calls = stubFetch(quietSocial);
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("two keywords' credits left: two keywords searched", tiktokAsked(calls).length, 2);
    eq(
      "the sweep says the credits are used, once",
      r.notes.filter((n) => n.includes("today's ScrapeCreators credits")).length,
      1,
    );
    eq(
      "and the clock's note counts the two",
      socialClock(sb)?.["detail"],
      "2 keywords searched on social platforms.",
    );
  }
  {
    // A keyword's posts go in in address order, so two keywords storing the same posts at once lock
    // them in the same order; in opposite orders the database could deadlock and refuse one batch.
    const video = (id: string) => ({
      aweme_info: { aweme_id: id, desc: "Maji", author: { unique_id: "maji.watch254" } },
    });
    const sb = world({}, { take_social_credits: () => true });
    stubFetch(tiktokSearch([video("7500000000000000042"), video("7500000000000000041")]));
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a keyword's posts are stored in address order",
      sb.tables["listening_mentions"]?.map((m) => String(m["url"]).slice(-2)),
      ["41", "42"],
    );
  }
  {
    // A keyword whose searches failed for another reason was still searched: it is marked, so one
    // broken keyword doesn't keep its place at the front of the line.
    const sb = world({}, { take_social_credits: () => true });
    stubFetch(tiktokSearch([{ aweme_info: { desc: "No id, no link" } }]));
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a search that failed still marks the keyword as searched",
      typeof sb.tables["listening_topics"]?.[0]?.["social_scanned_at"],
      "string",
    );
  }
  {
    // A social post the database refuses costs only itself, not the keyword's whole find.
    const video = (id: string) => ({
      aweme_info: {
        aweme_id: id,
        desc: `Tankers late ${id}`,
        create_time: 1790640000,
        author: { unique_id: "maji.watch254" },
      },
    });
    const at = (id: string) => `https://www.tiktok.com/@maji.watch254/video/${id}`;
    const sb = world({}, { take_social_credits: () => true }, refusing(at("7500000000000000021")));
    stubFetch(tiktokSearch([video("7500000000000000021"), video("7500000000000000022")]));
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "a refused social post leaves the keyword's other stored",
      [r.stored, sb.tables["listening_mentions"]?.map((m) => m["url"])],
      [1, [at("7500000000000000022")]],
    );
    eq(
      "and the one who swept hears it",
      r.notes.filter((n) => n.includes("could not be stored")),
      [`Water: 1 of 2 posts found could not be stored (${CONSTRAINT}).`],
    );
  }
  {
    // A paused sweep's probe tries one keyword, its social search included.
    const sb = world(
      {
        listening_topics: keywords(4),
        listening_jobs: [
          {
            key: "listening_scan",
            status: "paused",
            paused_reason: "AI stopped (429): RESOURCE_EXHAUSTED: Quota exceeded.",
            last_run_at: hoursAgo(7),
          },
        ],
      },
      { take_social_credits: () => true },
    );
    const calls = stubFetch(quietSocial);
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "the probe searches one keyword on the social platforms",
      [r.ran, tiktokAsked(calls).length],
      [true, 1],
    );
  }
  {
    // Before the migration that adds social_scanned_at, the database refuses that order and that
    // write: the run still searches its share, the keywords the news search reached longest ago.
    const sb = beforeMigration(
      world({ listening_topics: keywords(3) }, { take_social_credits: () => true }),
    );
    const calls = stubFetch(quietSocial);
    const r = await runListeningScan(sb as never, { topicLimit: 1, classifyLimit: 40 });
    eq(
      "before the migration, social search still runs",
      [...tiktokAsked(calls)].sort(),
      [1, 2, 3].map((i) => `Nairobi keyword ${i}`),
    );
    eq(
      "its clock starts, and the sweep finishes",
      [socialClock(sb as never)?.["detail"], r.ran, r.paused ?? null],
      ["3 keywords searched on social platforms.", true, null],
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
