// Checks for the 06:00 step: once a morning, a story for each campaign from its
// own last day of news, never over the team's, headlines when the AI fails.
// Stand-ins for the database and the AI; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story-step.test.ts

import { takeBackupNote } from "@/lib/listening.server";
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
  JSON.stringify({
    candidates: [
      {
        content: { role: "model", parts: [{ text: JSON.stringify(answer) }] },
        finishReason: "STOP",
      },
    ],
  });

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
      { id: "c4", name: "Quiet Place", candidate: "A. Candidate", seat: "MCA · Quiet Ward" },
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
      mention("c3", "https://mathira.test/tea", "Mathira tea prices", 50),
      mention("c4", "https://quiet.test/old", "Old news from a quiet place", 200),
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
  process.env["GEMINI_API_KEY"] = "test-key";

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
      [3, "c2", "2026-09-30", "groundwork"],
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
      [prompts[0]?.includes("Mathira tea prices"), prompts[0]?.includes("Quiet place")],
      [false, false],
    );
    eq(
      "a quiet seat reaches back a week rather than going without",
      [
        prompts[1]?.includes("Mathira tea prices"),
        prompts[1]?.includes("found in the last week"),
        prompts[0]?.includes("found in the last two days"),
      ],
      [true, true, true],
    );
    eq("a campaign with nothing even in a week gets none", [r.written, r.quiet], [2, 1]);
    const detail = String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");
    eq(
      "the shared note names no campaign",
      [detail, /Sakaja|Mathira/.test(detail)],
      ["Wrote 2 stories. · 1 campaign had no news in the last week.", false],
    );

    const again = await runMorningStory(sb as never, { now: at("07:05") });
    eq(
      "a second call only checks missing-source campaigns without AI",
      [again.ran, prompts.length],
      [true, 2],
    );

    const tomorrow = at("06:10", "2026-10-01");
    const next = await runMorningStory(sb as never, { now: tomorrow });
    eq("the next morning writes again", [next.ran, stories(sb).length], [true, 6]);
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
      [3, "Ours", 1, 1],
    );
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubAi(500);
    const r = await runMorningStory(sb as never, { now });
    const story = stories(sb)[0]?.["story"] as { kind: string; also: unknown[] };
    const lead = story as unknown as { headline: string; summary: string };
    eq(
      "the AI down: the morning's headlines instead, with the lead's own words on top",
      [r.headlines, story.kind, story.also.length, lead.headline, lead.summary],
      [2, "headlines", 1, "Rationing extended in 14 Eastlands wards", "Supply cut to 1.1 million."],
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

  {
    const now = at("06:05");
    const sb = world(now, {
      listening_jobs: [
        {
          key: "morning_story",
          status: "paused",
          paused_reason: "AI access denied",
          last_run_at: hoursBefore(now, 2),
        },
      ],
    });
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now, force: true });
    const story = stories(sb).find((s) => s["campaign_id"] === "c2")?.["story"] as {
      kind: string;
      from: number;
    };
    eq(
      "a pause keeps the AI off but still saves the headlines",
      [r.ran, prompts.length, story?.kind, story?.from],
      [true, 0, "headlines", 2],
    );
    const job = sb.tables["listening_jobs"]?.find((j) => j["key"] === "morning_story");
    eq(
      "and leaves the pause and its time as they were",
      [job?.["status"], job?.["last_run_at"]],
      ["paused", hoursBefore(now, 2)],
    );
  }
  {
    const now = at("06:05");
    const sb = world(now);
    const prompts = stubAi(403);
    await runMorningStory(sb as never, { now });
    await runMorningStory(sb as never, { now: at("07:05") });
    const job = sb.tables["listening_jobs"]?.find((j) => j["key"] === "morning_story");
    eq(
      "AI denial persists and the AI is not asked again within the hour",
      [job?.["status"], prompts.length],
      ["paused", 1],
    );
    eq(
      "the campaign denied the AI still gets its headlines",
      (stories(sb).find((s) => s["campaign_id"] === "c2")?.["story"] as { kind: string })?.kind,
      "headlines",
    );
  }
  {
    // Paused two days ago: the next morning tries the AI again and writes the story.
    const now = at("06:05");
    const sb = world(now, {
      listening_jobs: [
        {
          key: "morning_story",
          status: "paused",
          paused_reason: "AI stopped (402): credits",
          last_run_at: hoursBefore(now, 48),
        },
      ],
    });
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now });
    const job = sb.tables["listening_jobs"]?.find((j) => j["key"] === "morning_story");
    eq(
      "an old pause is tried again and lifts when the AI answers",
      [r.written, prompts.length, job?.["status"]],
      [2, 2, "idle"],
    );
  }
  {
    // The AI fails at six: the morning holds headlines. When it answers later, the story replaces them.
    const sb = world(at("06:05"));
    stubAi(500);
    await runMorningStory(sb as never, { now: at("06:05") });
    const kindOf = (campaign: string) =>
      (stories(sb).find((x) => x["campaign_id"] === campaign)?.["story"] as { kind: string })?.kind;
    eq("the AI down at six: headlines", [kindOf("c2"), kindOf("c3")], ["headlines", "headlines"]);
    const prompts = stubAi();
    const later = await runMorningStory(sb as never, { now: at("07:05") });
    eq(
      "answering an hour later, it writes the story over the headlines",
      [later.written, kindOf("c2"), kindOf("c3"), stories(sb).length],
      [2, "written", "written", 3],
    );
    eq("and asked once for each campaign", prompts.length, 2);
    const noMore = await runMorningStory(sb as never, { now: at("08:05") });
    eq("a written story is not written again", [noMore.kept, prompts.length], [2, 2]);
  }
  {
    // Not in the evening: after 20:00 a morning that fell back to headlines is left as it is.
    const sb = world(at("06:05"));
    stubAi(500);
    await runMorningStory(sb as never, { now: at("06:05") });
    const prompts = stubAi();
    const evening = await runMorningStory(sb as never, { now: at("20:05") });
    eq("no retry in the evening", [evening.kept, evening.written, prompts.length], [2, 0, 0]);
  }
  {
    // What the AI is told: lead with the seat, but do not fixate on it.
    const sb = world(at("06:05"));
    const prompts = stubAi();
    await runMorningStory(sb as never, { now: at("06:05") });
    const told = prompts[0] ?? "";
    eq(
      "lead with local without fixating on it",
      [
        told.includes("Lead with the seat's own news when something there matters"),
        told.includes("do not fixate on it"),
        told.includes("a national development shapes the race more"),
        told.includes("national news only where it lands on the seat"),
      ],
      [true, true, true, false],
    );
    eq(
      "a quiet seat is no reason for no story",
      [
        told.includes("A quiet seat is no reason for no story"),
        told.includes("only when no item at all"),
      ],
      [true, true],
    );
    eq(
      "reports lead and posts show the mood",
      [
        told.includes("Reports by news outlets say what happened"),
        told.includes("use posts for the mood"),
      ],
      [true, true],
    );
  }
  {
    // Gemini's day used up, and a key for Claude: Claude writes the stories, nothing pauses, the job says so.
    process.env["ANTHROPIC_API_KEY"] = "claude-key";
    takeBackupNote();
    const now = at("06:05");
    const sb = world(now);
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
    const byClaude = JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "toolu_1", name: "answer", input: ANSWER }],
    });
    globalThis.fetch = (async (url: string | URL) =>
      String(url).includes("api.anthropic.com")
        ? new Response(byClaude, { status: 200 })
        : new Response(dayUsed, { status: 429 })) as typeof fetch;
    const r = await runMorningStory(sb as never, { now });
    const job = (sb.tables["listening_jobs"] ?? []).find((j) => j["key"] === "morning_story");
    eq(
      "Gemini's day used up: Claude writes the stories and the AI is not paused",
      [r.written, r.headlines, job?.["status"]],
      [2, 0, "idle"],
    );
    eq(
      "and the job says so",
      String(job?.["detail"] ?? "").includes(
        "Gemini could not answer (its limit was reached), so Claude Haiku, the backup AI, gave 2 answers.",
      ),
      true,
    );
    delete process.env["ANTHROPIC_API_KEY"];
  }
  {
    // The AI down: a report leads the morning, not a tweet found after it.
    const now = at("06:05");
    const row = (
      url: string,
      title: string,
      snippet: string,
      hoursAgo: number,
      source: string,
      domain: string,
    ) => ({
      id: url,
      campaign_id: "c2",
      url,
      title,
      snippet,
      source,
      domain,
      published_at: hoursBefore(now, hoursAgo),
      found_at: hoursBefore(now, hoursAgo),
      rival_id: null,
      reach: null,
    });
    const sb = world(now, {
      listening_mentions: [
        row(
          "https://x.com/sakaja/status/1",
          "Thank you Nairobi, more to come",
          "We are only getting started and the work continues.",
          1,
          "x",
          "x.com",
        ),
        row(
          "https://the-star.co.ke/water",
          "Water rationing ends in Eastlands",
          "The utility says supply is back to normal in all wards.",
          6,
          "news",
          "the-star.co.ke",
        ),
      ],
    });
    stubAi(500);
    await runMorningStory(sb as never, { now });
    const s = stories(sb).find((r) => r["campaign_id"] === "c2")?.["story"] as {
      kind: string;
      headline: string;
      also: { url: string }[];
    };
    eq(
      "the AI down: the report leads and the tweet follows it",
      [s.kind, s.headline, s.also.map((a) => a.url)],
      ["headlines", "Water rationing ends in Eastlands", ["https://x.com/sakaja/status/1"]],
    );
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
