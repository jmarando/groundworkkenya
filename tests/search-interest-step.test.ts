// Checks for the daily read of search interest: once a morning, each
// campaign's candidates searched as people search them and its week's top
// issues, all of Kenya at one search a read, campaigns taking turns within the
// day's budget. Stand-ins for the database and SerpApi; nothing leaves this
// process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/search-interest-step.test.ts

import { runSearchInterest } from "@/lib/search-interest.server";

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

type Row = Record<string, unknown>;

const at = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00+03:00`);
const ts = (day: string) => String(Date.parse(`${day}T00:00:00Z`) / 1000);

/** A month of SerpApi's answer for `terms`, every day at `value`. */
const answer = (terms: string[], value: number) => ({
  interest_over_time: {
    timeline_data: Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.parse("2026-08-31T00:00:00Z") + i * 864e5)
        .toISOString()
        .slice(0, 10);
      return {
        timestamp: ts(day),
        values: terms.map((t) => ({ query: t, extracted_value: value })),
      };
    }),
  },
});

function stubSerp(route: (q: string, geo: string) => unknown) {
  const asked: [string, string][] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = new URL(String(url));
    const q = u.searchParams.get("q") ?? "";
    const geo = u.searchParams.get("geo") ?? "";
    asked.push([q, geo]);
    return new Response(JSON.stringify(route(q, geo)), { status: 200 });
  }) as typeof fetch;
  return asked;
}

/** c2 has a race and a week's news; c3 has nothing unless `extra` gives it a candidate. */
function world(now: Date, cap = 8, extra: { rivals?: Row[]; reads?: Row[] } = {}) {
  const budget = { cap, used: 0 };
  const yesterday = new Date(now.getTime() - 864e5).toISOString();
  const story = (id: string, issue: string) => ({
    id,
    campaign_id: "c2",
    issue,
    title: id,
    url: `https://n.test/${id}`,
    found_at: yesterday,
    rival_id: null,
  });
  const sb = fakeSupabase(
    {
      campaigns: [
        { id: "c2", name: "Sakaja 2027" },
        { id: "c3", name: "Waruru Gikandi" },
      ],
      race_rivals: [
        { id: "b", campaign_id: "c2", name: "Babu Owino", search_as: null, is_us: false, sort: 1 },
        {
          id: "s",
          campaign_id: "c2",
          name: "Johnson Sakaja",
          search_as: "Sakaja",
          is_us: true,
          sort: 0,
        },
        ...(extra.rivals ?? []),
      ],
      listening_mentions: [
        ...["w1", "w2", "w3", "w4", "w5"].map((id) => story(id, "water")),
        story("f1", "floods"),
      ],
      conversations: [],
      person_events: [],
      search_interest: [...(extra.reads ?? [])],
      listening_jobs: [],
    },
    {
      take_social_credits: (a) => {
        const n = Number(a["_n"]);
        if (budget.used + n > budget.cap) return false;
        budget.used += n;
        return true;
      },
    },
  );
  return Object.assign(sb, { budget });
}
const reads = (sb: ReturnType<typeof world>) => sb.tables["search_interest"] ?? [];
const detail = (sb: ReturnType<typeof world>) =>
  String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");

const third = {
  id: "g",
  campaign_id: "c3",
  name: "Candidate C",
  search_as: null,
  is_us: true,
  sort: 0,
};

async function main() {
  process.env["SERPAPI_API_KEY"] = "test-key";

  {
    const asked = stubSerp((q) => answer(q.split(","), 30));
    const r = await runSearchInterest(world(at("05:59")) as never, { now: at("05:59") });
    eq("before 06:00 nothing is asked", [r.ran, asked.length], [false, 0]);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    const asked = stubSerp((q) => answer(q.split(","), 30));
    const r = await runSearchInterest(sb as never, { now });
    eq("ours first, searched as people search, for all of Kenya; then the week's issues", asked, [
      ["Sakaja,Babu Owino", "KE"],
      ["water shortage,floods", "KE"],
    ]);
    const cand = reads(sb).find((x) => x["kind"] === "candidates");
    eq(
      "kept for Kenya, each line tied to its candidate",
      [cand?.["geo"], (cand?.["series"] as { ref: string }[]).map((t) => t.ref)],
      ["KE", ["s", "b"]],
    );
    const issues = reads(sb).find((x) => x["kind"] === "issues");
    eq(
      "the week's issues, for Kenya",
      [
        issues?.["geo"],
        (issues?.["series"] as { term: string; ref: string }[]).map((t) => [t.term, t.ref]),
      ],
      [
        "KE",
        [
          ["water shortage", "water"],
          ["floods", "floods"],
        ],
      ],
    );
    eq("one search a read; a campaign with no race and no issues asks nothing", r.searches, 2);
    eq(
      "the shared note names no one",
      [detail(sb), /Sakaja|Babu|water/i.test(detail(sb))],
      ["Read 2 sets of search interest.", false],
    );
    eq("once a morning", (await runSearchInterest(sb as never, { now: at("07:05") })).ran, false);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    const asked = stubSerp((q) => answer(q.split(","), 0));
    await runSearchInterest(sb as never, { now });
    eq("an answer of zeros is kept and not asked again", [asked.length, reads(sb).length], [2, 2]);
  }
  {
    const now = at("06:05");
    const sb = world(now, 1);
    const asked = stubSerp((q) => answer(q.split(","), 30));
    await runSearchInterest(sb as never, { now });
    eq("the day's limit stops it", asked.length, 1);
    eq("and it says so", detail(sb).includes("limit"), true);
  }
  {
    const now = at("06:05");
    const sb = world(now, 1, {
      rivals: [third],
      reads: [
        {
          id: "r1",
          campaign_id: "c2",
          day: "2026-09-29",
          kind: "candidates",
          geo: "KE",
          series: [],
          created_at: "2026-09-29T03:05:00Z",
        },
      ],
    });
    const asked = stubSerp((q) => answer(q.split(","), 30));
    await runSearchInterest(sb as never, { now });
    eq("a campaign never read goes before one read yesterday", asked, [["Candidate C", "KE"]]);
  }
  {
    const now = at("06:05");
    const sb = world(now, 2, { rivals: [third] });
    const asked = stubSerp((q) => answer(q.split(","), 30));
    await runSearchInterest(sb as never, { now });
    eq("the limit leaves the second campaign for later", asked.length, 2);
    // Today's count put back by hand: a second run the same day reads only the rest.
    sb.budget.used = 0;
    asked.length = 0;
    const r = await runSearchInterest(sb as never, { now: at("09:00"), force: true });
    eq(
      "a second run the same day reads only campaigns not read today",
      [r.ran, asked],
      [true, [["Candidate C", "KE"]]],
    );
    eq("and keeps the morning's reads", reads(sb).length, 3);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubSerp((q) =>
      q.startsWith("Sakaja") ? { error: "SerpApi is busy." } : answer(q.split(","), 20),
    );
    const r = await runSearchInterest(sb as never, { now });
    eq(
      "an error is noted for the scheduler and the next read still runs",
      [reads(sb).map((x) => x["kind"]), r.notes.length],
      [["issues"], 1],
    );
    eq("the shared note counts it", detail(sb).includes("1 read could not be made."), true);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubSerp((q) =>
      q.startsWith("Sakaja")
        ? { error: "Google Trends hasn't returned any results for this query." }
        : answer(q.split(","), 20),
    );
    const r = await runSearchInterest(sb as never, { now });
    const cand = reads(sb).find((x) => x["kind"] === "candidates");
    eq(
      "too few searches to chart is kept as a read of nothing, so the campaign takes its turn",
      [
        (cand?.["series"] as { term: string; ref: string; points: unknown[] }[]).map((t) => [
          t.term,
          t.ref,
          t.points.length,
        ]),
        r.notes,
        detail(sb),
      ],
      [
        [
          ["Sakaja", "s", 0],
          ["Babu Owino", "b", 0],
        ],
        [],
        "Read 2 sets of search interest.",
      ],
    );
  }
  {
    delete process.env["SERPAPI_API_KEY"];
    const now = at("06:05");
    const sb = world(now);
    const asked = stubSerp((q) => answer(q.split(","), 30));
    const r = await runSearchInterest(sb as never, { now });
    eq("no key: nothing asked", [r.ran, asked.length], [true, 0]);
    eq("and the job says so", detail(sb).includes("not connected"), true);
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
