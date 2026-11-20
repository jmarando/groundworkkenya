// Checks for the hourly job's wider-news reads: each campaign's newest unread county or national
// story read for its seat by the AI, at most two a day per campaign. A read takes about a minute,
// and the hourly call must answer within pg_net's ten minutes (three calls after midnight on
// 20 Nov 2026 did not), so a call makes at most three, the campaigns with the fewest reads today
// first, and the hourly route makes them last. Stand-ins answer instead of the AI and the
// database; nothing leaves this process. Invented campaigns only. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/wider-news.test.ts

import { readFileSync } from "node:fs";

import { nairobiToday } from "@/lib/nairobi-date";
import { AUTO_READER, autoReadWiderNews } from "@/lib/roadmap.functions";

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

/** The AI (Gemini) reading a story for a seat. */
const READING = JSON.stringify({
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          {
            text: JSON.stringify({
              scope: "county",
              stance: "context",
              reading: "It matters here.",
              moves: ["Visit the market."],
            }),
          },
        ],
      },
      finishReason: "STOP",
    },
  ],
});

/** The AI answering every request with a reading, or failing with this status; each request counted. */
function stubAi(status = 200) {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    asked.push(String(url));
    return status === 200
      ? new Response(READING, { status: 200 })
      : new Response(JSON.stringify({ error: { code: status, message: "Not found." } }), {
          status,
        });
  }) as typeof fetch;
  return asked;
}

const anHourAgo = new Date(Date.now() - 3_600_000).toISOString();

/** Campaigns, each with a county keyword and one unread story, and the reads each had today. */
function world(ids: string[], readToday: Record<string, number> = {}) {
  const today = nairobiToday();
  return fakeSupabase({
    campaigns: ids.map((id) => ({
      id,
      name: `Campaign ${id}`,
      candidate: `Candidate ${id}`,
      seat: `Seat ${id}`,
    })),
    listening_topics: ids.map((id) => ({
      id: `t-${id}`,
      campaign_id: id,
      label: `County ${id}`,
      kind: "county",
    })),
    listening_mentions: ids.map((id) => ({
      id: `m-${id}`,
      campaign_id: id,
      topic_id: `t-${id}`,
      source: "news",
      title: `Story for ${id}`,
      url: `https://news.test/${id}`,
      snippet: "What happened.",
      published_at: anHourAgo,
      found_at: anHourAgo,
    })),
    news_impacts: Object.entries(readToday).flatMap(([id, n]) =>
      Array.from({ length: n }, (_, i) => ({
        id: `r-${id}-${i}`,
        campaign_id: id,
        url: `https://news.test/earlier-${id}-${i}`,
        mention_id: null,
        written_by: AUTO_READER,
        created_at: `${today}T06:00:00+03:00`,
      })),
    ),
  });
}

/** The campaigns this call read for, in the order it read them. */
const readFor = (sb: ReturnType<typeof world>) =>
  (sb.tables["news_impacts"] ?? []).filter((r) => r["mention_id"]).map((r) => r["campaign_id"]);

const ai = (asked: string[]) => asked.filter((u) => u.includes("generativelanguage")).length;

async function main() {
  process.env["GEMINI_API_KEY"] = "test-key";
  delete process.env["ANTHROPIC_API_KEY"];

  {
    const sb = world(["a", "b", "c", "d", "e"]);
    const asked = stubAi();
    const n = await autoReadWiderNews(sb as never);
    eq("five campaigns waiting: a call reads three", [n, readFor(sb).length, ai(asked)], [3, 3, 3]);
  }
  {
    const sb = world(["a", "b", "c", "d"], { a: 1, b: 1 });
    stubAi();
    await autoReadWiderNews(sb as never);
    eq("the campaigns with the fewest reads today go first", readFor(sb), ["c", "d", "a"]);
  }
  {
    const sb = world(["a", "b"], { a: 2 });
    stubAi();
    await autoReadWiderNews(sb as never);
    eq("a campaign read twice today waits for tomorrow", readFor(sb), ["b"]);
  }
  {
    const sb = world(["a", "b", "c", "d", "e"]);
    const asked = stubAi(404);
    const n = await autoReadWiderNews(sb as never);
    eq("a read the AI fails still counts towards the three", [n, ai(asked)], [0, 3]);
  }
  {
    // The hourly route: the reads come after every other step, so a slow AI read can't stop the
    // candidates' read, crowd events or the day's records.
    const route = readFileSync("src/routes/api/public/listening/scan.ts", "utf8");
    const at = (call: string) => route.indexOf(call);
    const wider = at("autoReadWiderNews(sb");
    eq(
      "the hourly route reads wider news last",
      [
        "runMorningStory(sb",
        "runRivalSweep(sb",
        "runSearchInterest(sb",
        "runCrowdEvents(sb",
        "recordSweepDays(sb",
        '"comms_to_ledger"',
        '"prune_old_records"',
      ].filter((c) => at(c) < 0 || at(c) > wider),
      [],
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
