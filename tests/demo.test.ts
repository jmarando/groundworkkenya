// Checks for the demo scenarios, the briefing arithmetic and the simulated
// election night. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/demo.test.ts

import { readFileSync } from "node:fs";

import { getScenario, scenarioKey, SCENARIOS } from "@/lib/demo";
import { buildNight, clockOf, frameAt, minuteOf, NIGHT_END } from "@/lib/demo/election-night";
import {
  countAtLeast,
  daysBetween,
  ELECTION_DAY,
  turnoutWhatIf,
  weightedShares,
} from "@/lib/demo/insights";
import { spokenBriefing } from "@/lib/demo/spoken";

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

function ok(name: string, cond: boolean, detail = "") {
  eq(detail && !cond ? `${name} (${detail})` : name, cond, true);
}

function slugsOf(file: string): Set<string> {
  const geo = JSON.parse(readFileSync(new URL(`../public${file}`, import.meta.url), "utf8")) as {
    features: { properties: { slug: string } }[];
  };
  return new Set(geo.features.map((f) => f.properties.slug));
}

// ---- scenarios
eq(
  "three scenarios, one per office",
  SCENARIOS.map((s) => `${s.key}:${s.office}`),
  ["kalonzo:president", "sakaja:governor", "mathira:mp"],
);
eq(
  "an unknown candidate falls back to the workspace's own race",
  [scenarioKey("x"), scenarioKey(undefined), scenarioKey("mathira")],
  ["sakaja", "sakaja", "mathira"],
);
eq(
  "area counts",
  SCENARIOS.map((s) => s.areas.length),
  [47, 85, 6],
);

for (const s of SCENARIOS) {
  const geo = slugsOf(s.geo.file);
  const mine = new Set(s.areas.map((a) => a.slug));
  eq(
    `${s.key}: every area is on the map`,
    [...mine].filter((x) => !geo.has(x)),
    [],
  );
  eq(
    `${s.key}: every map shape has an area`,
    [...geo].filter((x) => !mine.has(x)),
    [],
  );
  ok(
    `${s.key}: shares in each area add up to at most 100`,
    s.areas.every((a) => Object.values(a.shares).reduce((x, y) => x + y, 0) <= 100.5),
  );
  eq(`${s.key}: exactly three things today`, s.today.length, 3);
  const actions = [
    ...s.today.map((t) => t.action),
    ...s.story.actions,
    ...s.news.flatMap((n) => (n.action ? [n.action] : [])),
  ];
  ok(
    `${s.key}: every poll action carries a question`,
    actions.every((a) => a.kind !== "poll" || a.ask.trim().endsWith("?")),
  );
  ok(
    `${s.key}: every draft has a body`,
    actions.every((a) => a.kind !== "draft" || a.body.length > 80),
  );
  eq(`${s.key}: our candidate comes first`, s.contenders[0]?.us, true);
  ok(
    `${s.key}: rivals are placeholders`,
    s.contenders.slice(1).every((c) => /^(The incumbent|Challenger [AB])$/.test(c.name)),
  );
  eq(`${s.key}: twelve weeks of polling`, s.polls.average.length, 12);
  const polls = [
    ...s.polls.average.map((p) => p.shares),
    s.polls.own.shares,
    ...s.polls.outside.map((p) => p.shares),
  ];
  ok(
    `${s.key}: every poll adds up to 100`,
    polls.every((sh) => Math.abs(Object.values(sh).reduce((x, y) => x + y, 0) - 100) < 0.01),
  );
  eq(
    `${s.key}: the latest point of the average is our own poll`,
    s.polls.average.at(-1)?.shares,
    s.polls.own.shares,
  );
  ok(
    `${s.key}: news is tagged and explained`,
    s.news.length >= 4 && s.news.every((n) => n.soWhat.length > 20),
  );
}
eq("the Mathira candidate is fictional", getScenario("mathira").candidate.fictional, true);
eq(
  "only real results are marked official",
  SCENARIOS.map((s) => s.lastTime.official),
  [true, true, false],
);

// ---- insights
const k = getScenario("kalonzo");
const keys = k.contenders.map((c) => c.key);
const at25 = countAtLeast(k.areas, "us", 25);
ok("President: at 25% or more in at least 24 counties", at25 >= 24, String(at25));
const w = weightedShares(k.areas, keys);
ok(
  "President: short of 50% today, ahead of the incumbent",
  (w["us"] ?? 0) < 50 && (w["us"] ?? 0) > (w["a"] ?? 0),
  JSON.stringify(w),
);
const whatIf = turnoutWhatIf(k.areas, keys, "us", 3);
ok(
  "turnout in our strongholds adds votes and share",
  whatIf.extraVotes > 100_000 && (whatIf.after["us"] ?? 0) > (whatIf.before["us"] ?? 0),
);
eq("days to the election from 25 Sep 2026", daysBetween("2026-09-25", ELECTION_DAY), 319);

// ---- election night
eq(
  "clock round trip",
  [minuteOf("17:00"), minuteOf("23:40"), minuteOf("06:00"), clockOf(400)],
  [0, 400, 780, "23:40"],
);
for (const s of SCENARIOS) {
  const night = buildNight(s);
  eq(
    `${s.key}: the same seed plays the same night`,
    frameAt(night, 300).votes,
    frameAt(buildNight(s), 300).votes,
  );
  let prev = frameAt(night, 0);
  ok(`${s.key}: nothing counted at 17:00`, prev.valid === 0 && prev.call.state === "early");
  let monotone = true;
  let sums = true;
  let pipeline = true;
  let earlyCall = false;
  let calledAt: number | null = null;
  for (let m = 10; m <= NIGHT_END; m += 10) {
    const f = frameAt(night, m);
    if (
      f.valid < prev.valid ||
      f.stations.reported < prev.stations.reported ||
      f.votes.some((v, i) => v < (prev.votes[i] ?? 0))
    ) {
      monotone = false;
    }
    if (f.valid > 0 && Math.abs(f.shares.reduce((x, y) => x + y, 0) + f.othersShare - 100) > 0.01) {
      sums = false;
    }
    if (f.stations.entered < f.stations.verified || f.stations.reported < f.stations.entered) {
      pipeline = false;
    }
    if (f.call.state === "called" && calledAt === null) calledAt = m;
    if (m < 150 && f.call.state === "called") earlyCall = true;
    prev = f;
  }
  ok(`${s.key}: counts never fall`, monotone);
  ok(`${s.key}: shares add up to 100`, sums);
  ok(`${s.key}: reported ≥ entered ≥ verified`, pipeline);
  ok(`${s.key}: no call before 19:30`, !earlyCall);
  ok(`${s.key}: the call comes after 23:00`, calledAt !== null && calledAt >= minuteOf("23:00"));
  const early = frameAt(night, minuteOf("21:00"));
  const late = frameAt(night, minuteOf("02:00"));
  ok(
    `${s.key}: the range narrows as results come in`,
    late.projection.band < early.projection.band,
    `${early.projection.band.toFixed(2)} → ${late.projection.band.toFixed(2)}`,
  );
  const end = frameAt(night, NIGHT_END);
  ok(
    `${s.key}: nearly every station in by 06:00`,
    end.stations.reported >= end.stations.total * 0.97,
    `${end.stations.reported}/${end.stations.total}`,
  );
  eq(`${s.key}: we win on the night`, [end.call.state, end.call.who], ["called", 0]);
  ok(
    `${s.key}: the portal disagrees once, and says so`,
    end.portal.mismatches > 0 && end.portal.alert === s.night.divergence.detail,
  );
  ok(`${s.key}: flags for a human`, end.flags.length >= 2);
  const first = minuteOf(s.night.incidents[0]!.at);
  ok(
    `${s.key}: incidents arrive on time`,
    frameAt(night, first - 1).incidents.length === 0 &&
      end.incidents.length === s.night.incidents.length,
  );
  console.log(
    `  ${s.key}: ${end.stations.total} stations, called at ${calledAt === null ? "never" : clockOf(calledAt)}, final ${end.shares.map((x) => x.toFixed(1)).join(" / ")}${end.at25 !== null ? `, ${end.at25} counties at 25%` : ""}`,
  );
}
ok(
  "only the President counts counties at 25%",
  frameAt(buildNight(k), NIGHT_END).at25 !== null &&
    frameAt(buildNight(getScenario("sakaja")), NIGHT_END).at25 === null,
);

// ---- the spoken briefing
for (const s of SCENARIOS) {
  const text = spokenBriefing(s, "2026-09-25");
  ok(
    `${s.key}: the spoken briefing greets the candidate`,
    text.startsWith(`Good morning, ${s.candidate.first}.`),
  );
  const words = text.split(/\s+/).length;
  ok(`${s.key}: about three minutes to listen`, words > 250 && words < 600, String(words));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
