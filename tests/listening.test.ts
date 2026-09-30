// Checks for the listening sweep: what it stores, what it reads and what it
// spends. Uses a stand-in database and stand-ins for web search, the AI and
// ScrapeCreators; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening.test.ts

import { runListeningScan } from "@/lib/listening.server";

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

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
