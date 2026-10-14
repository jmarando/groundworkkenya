// Checks for working out the findings against a stand-in database: field
// agents refused, the counts read and checked, each campaign ward placed in
// the atlas, the house totals, and every count missing before schema 25 is
// applied without the page failing. Nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-functions.test.ts

import { FINDINGS_DENIED, loadFindings } from "@/lib/findings.functions";
import { toIssueWeeks, toRivalWeeks, toWardIssues, toWardSpend } from "@/lib/findings/rows";
import { HOUSE_TOTALS, houseTotals } from "@/lib/house-totals";
import { MAP_AREAS } from "@/lib/map-areas";

import { fakeSupabase } from "./fake-supabase";
import { ATLAS, FULL, KEYS } from "./findings-fixture";

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

async function refuses(name: string, fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const CAMP = "camp-sakaja";
const TODAY = "2026-10-13";
const NOW = new Date("2026-10-13T09:00:00Z");

/** The fixture's atlas and campaign as database rows. */
const SEED = {
  campaigns: [{ id: CAMP, level: "governor", seat: "Governor · Nairobi", map_area: "nairobi" }],
  atlas_areas: ATLAS.areas,
  atlas_candidates: ATLAS.candidates.map((c) => ({ ...c, election_id: c.election })),
  atlas_results: ATLAS.results.map((r) => ({
    candidate_id: r.candidate,
    area_key: r.area,
    votes: r.votes,
    source_id: r.source,
  })),
  atlas_turnout: ATLAS.turnout.map((t) => ({
    election_id: t.election,
    area_key: t.area,
    registered: t.registered,
    cast_votes: t.cast,
    rejected: t.rejected,
    valid: t.valid,
    source_id: t.source,
  })),
  atlas_register: ATLAS.register.map((r) => ({
    year: r.year,
    area_key: r.area,
    registered: r.registered,
    source_id: r.source,
  })),
  atlas_population: ATLAS.population.map((p) => ({
    area_key: p.area,
    year: p.year,
    total: p.total,
    adults: p.adults,
    young_adults: p.youngAdults,
    source_id: p.source,
  })),
  atlas_sources: ATLAS.sources,
  atlas_indicators: ATLAS.indicators.map((x) => ({
    area_key: x.area,
    indicator: x.indicator,
    year: x.year,
    value: x.value,
    source_id: x.source,
  })),
  atlas_sides: [{ election_id: "2022-governor", bloc: "Bloc A" }],
  wards: FULL.wards.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    constituency: w.constituency,
    target_votes: w.targetVotes,
  })),
  diary_entries: FULL.diary.map((e) => ({
    id: e.id,
    day: e.day,
    starts_at: null,
    title: e.title,
    kind: e.kind,
    ward_id: e.wardId,
    note: null,
  })),
  race_rivals: FULL.rivals.map((r) => ({
    id: r.id,
    name: r.name,
    party: null,
    office: null,
    is_us: r.isUs,
    tone: r.tone,
    sort: r.sort,
  })),
  race_polls: FULL.polls.map((p) => ({
    id: p.id,
    pollster: p.pollster,
    fieldwork_from: null,
    fieldwork_to: null,
    published_on: p.publishedOn,
    sample_size: p.sampleSize,
    margin: p.margin,
    source_url: p.sourceUrl,
    shares: p.shares.map((s) => ({ name: s.name, share: s.share, rival_id: s.rivalId })),
    undecided: null,
    approval: null,
    disapproval: null,
  })),
};

/** The counting functions, as schema 25 returns them. */
const COUNTS = {
  house_doors: () =>
    FULL.doors!.map((d) => ({
      ward_id: d.wardId,
      knocked: d.knocked,
      rated: 0,
      supporters: 0,
      doors_week: 0,
      agents_today: [],
    })),
  ward_supporters: () =>
    FULL.supporters!.map((s) => ({ ward_id: s.wardId, supporters: s.supporters })),
  ward_spend: () => FULL.spend!.map((s) => ({ ward_id: s.wardId, kes: String(s.kes) })),
  ward_issues: () =>
    FULL.issues!.map((r) => ({ ward_id: r.wardId, source: r.source, issue: r.issue, n: r.n })),
  issue_weeks: () =>
    FULL.issueWeeks!.map((r) => ({ week: r.week, source: r.source, issue: r.issue, n: r.n })),
  rival_mention_weeks: () =>
    FULL.rivalWeeks!.map((r) => ({ week: r.week, rival_id: r.rivalId, n: r.n })),
};
const as = (role: string, counts: Record<string, () => unknown> = COUNTS) =>
  fakeSupabase(SEED, { my_campaign_role: () => role, my_campaign: () => CAMP, ...counts });

// ---------------------------------------------------------------- who

await refuses(
  "a field agent is refused",
  () => loadFindings(as("agent"), TODAY, NOW),
  FINDINGS_DENIED,
);
await refuses(
  "someone waiting to be admitted is refused",
  () => loadFindings(as("pending"), TODAY, NOW),
  FINDINGS_DENIED,
);

// ---------------------------------------------------------------- with schema 25

{
  const r = await loadFindings(as("organiser"), TODAY, NOW);
  eq("worked out now", r.asOf, "2026-10-13T09:00:00.000Z");
  eq("nothing waiting", r.waiting, []);
  eq("the side is set", r.sideSet, true);
  eq("each ward placed in the atlas", r.wardKeys["w-kawangware"], KEYS.kawangware);
  eq("every rule fires, as on the example", [...new Set(r.findings.map((f) => f.rule))].length, 12);
  eq(
    "the first finding",
    r.findings[0]?.line,
    "Kasarani: no diary stop in the last 60 days and none planned, with about 26,603 votes within reach.",
  );
}

// ---------------------------------------------------------------- before schema 25

{
  const r = await loadFindings(as("manager", { house_doors: COUNTS.house_doors }), TODAY, NOW);
  eq("the new counts are named as waiting", r.waiting, [
    "issue_weeks",
    "rival_mention_weeks",
    "ward_issues",
    "ward_spend",
    "ward_supporters",
  ]);
  eq(
    "the rules that need them are quiet; the rest still run",
    [...new Set(r.findings.map((f) => f.rule))],
    [
      "not-visited",
      "time-in-safe-seats",
      "one-seat-different-places",
      "votes-within-reach",
      "doors-behind",
      "unregistered-adults",
      "poll-move",
    ],
  );
}

// ---------------------------------------------------------------- rows

eq(
  "issue rows: malformed ones dropped, numbers as text read",
  toWardIssues([
    { ward_id: "w", source: "door", issue: "Water", n: "3" },
    { ward_id: "w", source: "sms", issue: "Water", n: 3 },
    { ward_id: null, source: "door", issue: "Water", n: 3 },
    { ward_id: "w", source: "news", issue: " ", n: 3 },
    "nonsense",
  ]),
  [{ wardId: "w", source: "door", issue: "Water", n: 3 }],
);
eq(
  "week rows",
  [
    toIssueWeeks([
      { week: 1, source: "messages", issue: "Floods", n: 2 },
      { week: -1, source: "door", issue: "x", n: 1 },
    ]),
    toRivalWeeks([
      { week: 0, rival_id: null, n: 9 },
      { week: 0, rival_id: 7, n: 1 },
    ]),
  ],
  [[{ week: 1, source: "messages", issue: "Floods", n: 2 }], [{ week: 0, rivalId: null, n: 9 }]],
);
eq("spend rows: numeric as text", toWardSpend([{ ward_id: "w", kes: "1500.50" }]), [
  { wardId: "w", kes: 1500.5 },
]);
eq("nothing that isn't a list", toWardIssues(null), []);

// ---------------------------------------------------------------- house totals

eq(
  "every map area has its house totals",
  MAP_AREAS.filter((a) => !HOUSE_TOTALS[a.key]).map((a) => a.key),
  [],
);
eq(
  "houses per ward slug",
  [
    houseTotals("nairobi")?.["kawangware"] !== undefined,
    Object.keys(houseTotals("nyeri/mathira") ?? {}).length,
    houseTotals(null),
    houseTotals("mombasa"),
  ],
  [true, 6, null, null],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
