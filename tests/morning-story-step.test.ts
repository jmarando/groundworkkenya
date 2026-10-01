// Checks for the 06:00 step: once a morning, a story for each campaign from its
// own last day of news, never over the team's, headlines when the AI fails.
// Stand-ins for the database and the AI; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story-step.test.ts

import { runMorningStory } from "@/lib/morning-story.server";

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

// 06:05 in Nairobi on 30 September is 03:05 UTC.
const at = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00+03:00`);
const hoursBefore = (d: Date, h: number) => new Date(d.getTime() - h * 3600_000).toISOString();

const ANSWER = {
  noStory: false,
  headline: "Rationing hits Eastlands",
  summary: "Water rationing now covers 14 wards.",
  why: "Water is the loudest issue.",
  rivals: "Babu Owino blames City Hall.",
  line: "Tankers to every ward this week.",
  figures: [{ value: "14", label: "wards on rationing", item: 1 }],
  items: [1],
  also: [{ item: 2, soWhat: "Floods next." }],
};
const aiSays = (answer: unknown) =>
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(answer) })}\n\n`;

function stubAi(status = 200, answer: unknown = ANSWER) {
  const prompts: string[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    prompts.push(String(init?.body ?? ""));
    return new Response(status === 200 ? aiSays(answer) : "down", { status });
  }) as typeof fetch;
  return prompts;
}

function world(now: Date, extra: Record<string, Record<string, unknown>[]> = {}) {
  const mention = (
    campaign: string,
    url: string,
    title: string,
    hoursAgo: number,
    rival: string | null = null,
  ) => ({
    id: url,
    campaign_id: campaign,
    url,
    title,
    snippet:
      title === "Rationing extended in 14 Eastlands wards" ? "Supply cut to 1.1 million." : null,
    source: rival ? "tiktok" : "news",
    domain: rival ? null : "nation.africa",
    published_at: hoursBefore(now, hoursAgo),
    found_at: hoursBefore(now, hoursAgo),
    rival_id: rival,
    reach: rival ? 1000 : null,
  });
  return fakeSupabase({
    campaigns: [
      { id: "c2", name: "Sakaja 2027", candidate: "Johnson Sakaja", seat: "Governor · Nairobi" },
      { id: "c3", name: "Waruru Gikandi", candidate: "Waruru Gikandi", seat: "MP · Mathira" },
    ],
    listening_mentions: [
      mention(
        "c2",
        "https://nation.africa/rationing",
        "Rationing extended in 14 Eastlands wards",
        2,
      ),
      mention("c2", "https://the-star.co.ke/drains", "Drains blocked on Jogoo Road", 5),
      mention(
        "c2",
        "https://www.tiktok.com/@he.babuowino/video/1",
        "Maji kwa kila mtaa",
        10,
        "r-babu",
      ),
      mention("c2", "https://www.tiktok.com/@sakaja/video/2", "Our own post", 10, "r-us"),
      mention("c3", "https://mathira.test/tea", "Mathira tea prices", 30),
    ],
    race_rivals: [
      { id: "r-babu", campaign_id: "c2", name: "Babu Owino", is_us: false },
      { id: "r-us", campaign_id: "c2", name: "Johnson Sakaja", is_us: true },
    ],
    morning_stories: [],
    listening_jobs: [],
    ...extra,
  });
}
const stories = (sb: ReturnType<typeof world>) => sb.tables["morning_stories"] ?? [];

async function main() {
  process.env["LOVABLE_API_KEY"] = "test-key";

  {
    const sb = world(at("05:59"));
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now: at("05:59") });
    eq("before 06:00 nothing is written", [r.ran, prompts.length], [false, 0]);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now });
    const s = stories(sb)[0];
    eq(
      "a story for the campaign with news",
      [stories(sb).length, s?.["campaign_id"], s?.["day"], s?.["written_by"]],
      [1, "c2", "2026-09-30", "groundwork"],
    );
    const story = s?.["story"] as {
      headline: string;
      sources: { url: string }[];
      figures: unknown[];
    };
    eq(
      "written from the day's news",
      [story.headline, story.sources[0]?.url],
      ["Rationing hits Eastlands", "https://nation.africa/rationing"],
    );
    eq(
      "the AI read the rival's post, not ours",
      [prompts[0]?.includes("Babu Owino on tiktok"), prompts[0]?.includes("Our own post")],
      [true, false],
    );
    eq(
      "nor another campaign's news",
      prompts.some((p) => p.includes("Mathira tea prices")),
      false,
    );
    eq("a campaign with no news that day gets none", [r.written, r.quiet], [1, 1]);
    const detail = String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");
    eq(
      "the shared note names no campaign",
      [detail, /Sakaja|Mathira/.test(detail)],
      ["Wrote 1 story. · 1 campaign had no news in the last day.", false],
    );

    const again = await runMorningStory(sb as never, { now: at("07:05") });
    eq("a second call that morning writes nothing", [again.ran, prompts.length], [false, 1]);

    const tomorrow = at("06:10", "2026-10-01");
    const next = await runMorningStory(sb as never, { now: tomorrow });
    eq(
      "the next morning writes again",
      [next.ran, stories(sb).length],
      [true, 1 + (next.written + next.headlines)],
    );
  }
  {
    const now = at("06:05");
    const sb = world(now, {
      morning_stories: [
        {
          id: "own",
          campaign_id: "c2",
          day: "2026-09-30",
          story: { kind: "written", headline: "Ours" },
          written_by: "team",
        },
      ],
    });
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now });
    eq(
      "the team's story stays",
      [
        stories(sb).length,
        (stories(sb)[0]?.["story"] as { headline: string }).headline,
        r.kept,
        prompts.length,
      ],
      [1, "Ours", 1, 0],
    );
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubAi(500);
    const r = await runMorningStory(sb as never, { now });
    const story = stories(sb)[0]?.["story"] as { kind: string; also: unknown[] };
    eq(
      "the AI down: the morning's headlines instead",
      [r.headlines, story.kind, story.also.length],
      [1, "headlines", 2],
    );
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubAi(200, { ...ANSWER, noStory: true });
    await runMorningStory(sb as never, { now });
    eq(
      "nothing bears on the race: headlines too",
      (stories(sb)[0]?.["story"] as { kind: string }).kind,
      "headlines",
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
