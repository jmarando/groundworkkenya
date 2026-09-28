// Checks for the Overview's arithmetic: shares of each campaign's targets by
// area, the pace to polling day, readiness, runway and the verdict line.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/ops.test.ts

import { readFileSync } from "node:fs";

import { getScenario, SCENARIOS } from "@/lib/demo";
import {
  apportion,
  areaOnPace,
  listTotals,
  opsAreas,
  pace,
  readiness,
  runway,
  verdict,
  weeklyHistory,
} from "@/lib/demo/ops";

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

const TODAY = "2026-09-28";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ---- sharing a total out
eq("apportion keeps the total exactly", sum(apportion(1000, [1, 1, 1])), 1000);
eq("apportion follows the weights", apportion(10, [3, 1, 1]), [6, 2, 2]);
eq("nothing to weigh, nothing given", apportion(10, [0, 0]), [0, 0]);

// ---- every campaign's areas
for (const s of SCENARIOS) {
  const areas = opsAreas(s);
  const list = listTotals(s);
  eq(`${s.key}: one row per map area`, areas.length, s.areas.length);
  eq(
    `${s.key}: area targets add up to the campaign's`,
    sum(areas.map((a) => a.target)),
    list.target,
  );
  eq(`${s.key}: area finds add up to the campaign's`, sum(areas.map((a) => a.found)), list.found);
  eq(`${s.key}: last week's finds add up`, sum(areas.map((a) => a.lastWeek)), s.ops.foundLastWeek);
  eq(`${s.key}: doors add up`, sum(areas.map((a) => a.doors)), s.ops.doors.lastWeek);
  ok(
    `${s.key}: recruited, trained, confirmed never exceed the stage before`,
    areas.every(
      (a) => a.recruited <= a.streams && a.trained <= a.recruited && a.confirmed <= a.trained,
    ),
  );
  ok(
    `${s.key}: every area has a coordinator`,
    areas.every((a) => /^[A-Z][a-z]+ [A-Z]\.$/.test(a.coordinator)),
  );
  eq(`${s.key}: the same seed gives the same areas`, opsAreas(getScenario(s.key)), areas);

  const geo = JSON.parse(
    readFileSync(new URL(`../public${s.geo.file}`, import.meta.url), "utf8"),
  ) as {
    features: { properties: { slug: string } }[];
  };
  const slugs = new Set(geo.features.map((f) => f.properties.slug));
  ok(
    `${s.key}: every area is on the map`,
    areas.every((a) => slugs.has(a.slug)),
  );

  const hist = weeklyHistory(s, TODAY);
  eq(`${s.key}: twelve weeks of history`, hist.length, 12);
  eq(`${s.key}: history ends at today's total`, hist[11]?.total, list.found);
  eq(
    `${s.key}: last week in the history is last week's finds`,
    hist[11]?.found,
    s.ops.foundLastWeek,
  );
  ok(
    `${s.key}: the total only grows`,
    hist.every((h, i) => i === 0 || h.total >= hist[i - 1]!.total),
  );

  const r = readiness(areas);
  ok(
    `${s.key}: readiness narrows stage by stage`,
    r.streams >= r.recruited && r.recruited >= r.trained && r.trained >= r.confirmed,
  );
  ok(`${s.key}: runway is positive`, runway(s.ops.money) > 0);
}

// ---- the pace to polling day
{
  const p = pace(getScenario("mathira"), TODAY);
  eq("Mathira: 316 days is 45.1 weeks", p.weeksLeft.toFixed(1), "45.1");
  eq("Mathira: the pace needed", Math.round(p.needed), Math.round((38_000 - 24_610) / (316 / 7)));
  ok("Mathira is behind pace", !p.onPace && p.shortfall > 0, JSON.stringify(p));
  ok(
    "and the projection falls between today's count and the target",
    p.projected > 24_610 && p.projected < 38_000,
  );
}
{
  const p = pace(getScenario("sakaja"), TODAY);
  ok("Nairobi is on pace overall", p.onPace && p.shortfall === 0, JSON.stringify(p));
  const areas = opsAreas(getScenario("sakaja"));
  ok(
    "but some wards are behind their own targets",
    areas.some((a) => !areaOnPace(a, p.weeksLeft)),
  );
}
{
  const p = pace(getScenario("sakaja"), "2027-08-10");
  eq("on polling day there are no weeks left", p.weeksLeft, 0);
  ok("and nothing is projected beyond today's count", p.projected === p.found);
}

// ---- the verdict
{
  const v = verdict(getScenario("mathira"), TODAY);
  ok("Mathira: behind pace", v.headline.startsWith("Behind pace"), v.headline);
  ok(
    "Mathira: says what we reach and how far short",
    /reach [\d,]+ by polling day, [\d,]+ short/.test(v.detail),
    v.detail,
  );
  ok("Mathira: names the biggest gap", /is the biggest gap/.test(v.detail), v.detail);
}
{
  const v = verdict(getScenario("sakaja"), TODAY);
  ok("Nairobi: on pace", v.headline.startsWith("On pace"), v.headline);
  ok(
    "Nairobi: says how many wards are behind",
    /\d+ of 85 wards are behind/.test(v.detail),
    v.detail,
  );
}
{
  const v = verdict(getScenario("kalonzo"), TODAY);
  ok("President: short of 50%+1", v.headline.startsWith("Short of 50%+1"), v.headline);
  ok(
    "President: counts counties at 25%",
    /25% or more in \d+ counties \(24 needed\)/.test(v.detail),
    v.detail,
  );
}
for (const s of SCENARIOS) {
  const v = verdict(s, TODAY);
  ok(`${s.key}: no NaN or Infinity in the verdict`, !/NaN|Infinity/.test(v.headline + v.detail));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
