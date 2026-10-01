// Checks for the daily read of search interest: once a morning, each
// campaign's candidates searched as people search them and its week's top
// issues, Nairobi first and Kenya when Nairobi's answer is thin, within the
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

function world(now: Date, cap = 8) {
  let used = 0;
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
  return fakeSupabase(
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
      ],
      listening_mentions: [
        ...["w1", "w2", "w3", "w4", "w5"].map((id) => story(id, "water")),
        story("f1", "floods"),
      ],
      conversations: [],
      person_events: [],
      search_interest: [],
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
const reads = (sb: ReturnType<typeof world>) => sb.tables["search_interest"] ?? [];
const detail = (sb: ReturnType<typeof world>) =>
  String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");

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
    // Nairobi's answer for the candidates is all zeros, so Kenya's is used.
    const asked = stubSerp((q, geo) =>
      answer(q.split(","), q.startsWith("Sakaja") && geo === "KE-110" ? 0 : 30),
    );
    const r = await runSearchInterest(sb as never, { now });
    eq(
      "ours first, searched as people search, from Nairobi then Kenya; then the week's issues",
      asked,
      [
        ["Sakaja,Babu Owino", "KE-110"],
        ["Sakaja,Babu Owino", "KE"],
        ["water shortage,floods", "KE-110"],
      ],
    );
    const cand = reads(sb).find((x) => x["kind"] === "candidates");
    eq(
      "kept from Kenya, each line tied to its candidate",
      [cand?.["geo"], (cand?.["series"] as { ref: string }[]).map((t) => t.ref)],
      ["KE", ["s", "b"]],
    );
    const issues = reads(sb).find((x) => x["kind"] === "issues");
    eq(
      "the week's issues, from Nairobi",
      [
        issues?.["geo"],
        (issues?.["series"] as { term: string; ref: string }[]).map((t) => [t.term, t.ref]),
      ],
      [
        "KE-110",
        [
          ["water shortage", "water"],
          ["floods", "floods"],
        ],
      ],
    );
    eq("a campaign with no race and no issues asks nothing", r.searches, 3);
    eq(
      "the shared note names no one",
      [detail(sb), /Sakaja|Babu|water/i.test(detail(sb))],
      ["Read 2 sets of search interest.", false],
    );
    eq("once a morning", (await runSearchInterest(sb as never, { now: at("07:05") })).ran, false);
  }
  {
    const now = at("06:05");
    const sb = world(now, 1);
    const asked = stubSerp((q, geo) => answer(q.split(","), geo === "KE-110" ? 0 : 30));
    await runSearchInterest(sb as never, { now });
    eq("the day's limit stops it", asked.length, 1);
    eq("and it says so", detail(sb).includes("limit"), true);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubSerp((q, geo) =>
      geo === "KE-110" ? { error: "Unsupported geo." } : answer(q.split(","), 20),
    );
    await runSearchInterest(sb as never, { now });
    eq(
      "an error for Nairobi falls back to Kenya",
      reads(sb).map((x) => x["geo"]),
      ["KE", "KE"],
    );
  }
  {
    delete process.env["SERPAPI_API_KEY"];
    const now = at("06:05");
    const sb = world(now);
    const asked = stubSerp((q) => answer(q.split(","), 30));
    const r = await runSearchInterest(sb as never, { now });
    eq("no key: nothing asked", [r.ran, asked.length], [true, 0]);
    eq("and Home is told", detail(sb).includes("not connected"), true);
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
