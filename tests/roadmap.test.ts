// Checks for the Road to election day page: the phases from today, the gaps the records show,
// the starting plan and a stored draft read without trust.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/roadmap.test.ts

import { daysUntil, keyDates, nextKeyDate } from "@/lib/election-calendar";
import { movesAhead } from "@/lib/brief";
import {
  baseRoadmap,
  currentPhase,
  gaps,
  mergeDraft,
  phasesFor,
  readImpact,
  readPhases,
  readRoadmap,
  type Figures,
} from "@/lib/roadmap";

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

const today = "2026-10-20";
const figures: Figures = {
  level: "mp",
  stations: 63,
  streams: 120,
  staffed: 0,
  registered: 104592,
  target: 40000,
  supporters: 300,
  reachable: 100,
  doors: 0,
  raised: 60600,
  spent: 381500,
  limit: 20560428,
  appearances30: 4,
};

eq("days to polling day", daysUntil(today, "2027-08-10"), 294);
eq(
  "phases from today",
  phasesFor("mp", today).map((p) => [p.key, p.from, p.to]),
  [
    ["build", "2026-10-20", "2027-02-10"],
    ["primaries", "2027-02-11", "2027-05-08"],
    ["ticket", "2027-05-09", "2027-05-28"],
    ["campaign", "2027-05-29", "2027-08-07"],
    ["polling", "2027-08-08", "2027-08-17"],
  ],
);
eq(
  "an MCA's campaign opens on 2 June",
  phasesFor("mca", today).find((p) => p.key === "campaign")?.from,
  "2027-06-02",
);
eq(
  "past phases drop away",
  phasesFor("mp", "2027-06-01").map((p) => p.key),
  ["campaign", "polling"],
);
eq(
  "key dates in order",
  keyDates("governor")
    .map((d) => d.on)
    .join() ===
    keyDates("governor")
      .map((d) => d.on)
      .sort()
      .join(),
  true,
);
eq(
  "governor nominates 3 to 6 June",
  keyDates("governor").find((d) => d.key === "nomination")?.until,
  "2027-06-06",
);

const g = gaps(figures, today);
eq("urgent gaps first", g[0]?.tone, "urgent");
eq(
  "agents counted by stream",
  g.find((x) => x.key === "agents")?.headline,
  "0 of 120 polling streams have an agent named",
);
eq(
  "spent more than raised",
  g.find((x) => x.key === "cash")?.headline,
  "KES 320,900 more spent than raised",
);
eq(
  "no limit on file says so",
  gaps({ ...figures, limit: null }, today).find((x) => x.key === "limit")?.headline,
  "The seat's spending limit is not on file",
);
eq(
  "an unread count says nothing",
  gaps({ ...figures, doors: null, supporters: null, reachable: null }, today).some((x) =>
    ["doors", "supporters", "reachable"].includes(x.key),
  ),
  false,
);

const base = baseRoadmap(figures, today);
eq("starting plan covers every phase", base.phases.length, 5);
const keys = base.phases.flatMap((p) => p.milestones.map((m) => m.key));
eq("milestone keys are unique", new Set(keys).size, keys.length);
eq(
  "milestone keys are safe",
  keys.every((k) => /^[a-z0-9-]{1,80}$/.test(k)),
  true,
);
eq("current phase", currentPhase(base, today)?.key, "build");

eq(
  "stored phases read without trust",
  readPhases([
    { key: "nope", from: "2026-10-20", to: "2027-01-01", milestones: [] },
    {
      key: "build",
      from: "2026-10-20",
      to: "2027-02-10",
      focus: "x",
      milestones: [
        { key: "Build Agents!", workstream: "agents", title: "Recruit", how: ["a", 3], by: "soon" },
        { key: "build-agents", workstream: "agents", title: "Duplicate" },
        { workstream: "tribes", title: "Bad stream" },
        { workstream: "money", title: "Raise it" },
      ],
    },
  ]).map((p) => [p.key, p.milestones.map((m) => [m.key, m.by, m.how])]),
  [
    [
      "build",
      [
        ["build-agents", null, ["a"]],
        ["build-money-raise-it", null, []],
      ],
    ],
  ],
);
eq("a roadmap with no phases is none", readRoadmap({ headline: "x", phases: [] }), null);
eq(
  "an impact with a plain link keeps no link",
  readImpact({
    id: "1",
    title: "Housing",
    reading: "It helps UDA.",
    scope: "national",
    stance: "threat",
    url: "http://x",
    moves: ["a", ""],
    created_at: "2026-10-20",
  })?.url,
  null,
);
eq(
  "an impact with an unknown stance is none",
  readImpact({ id: "1", title: "t", reading: "r", scope: "national", stance: "big" }),
  null,
);

eq("next key date", nextKeyDate("mp", "2026-10-20")?.key, "rules");
eq("a stretch counts until its last day", nextKeyDate("mp", "2027-03-15")?.key, "audit");
eq("none after polling day", nextKeyDate("mp", "2027-08-11"), null);
const mv = (from: number, to: number) => ({
  from,
  to,
  title: `m${from}`,
  why: "",
  how: [],
  where: [],
  measure: null,
  diary: null,
  sources: [],
});
eq(
  "moves running this week",
  movesAhead({ startsOn: "2026-10-21", moves: [mv(1, 2), mv(3, 14), mv(9, 9)] }, "2026-10-23").map(
    (m) => m.title,
  ),
  ["m3", "m9"],
);

// A draft written phase by phase: what the AI wrote where it could, the starting plan elsewhere.
{
  const shell = phasesFor("mp", today);
  const ms = (key: string, title: string) => ({
    key,
    workstream: "field",
    title,
    why: "w",
    how: ["h"],
    by: "",
    measure: "",
  });
  const out = mergeDraft(shell, base, [
    { focus: "Agents first.", milestones: [ms("build-field-walk", "Walk every ward")] },
    null,
    { focus: "", milestones: [] },
    { focus: "Out every day.", milestones: [ms("build-field-walk", "Walk it again")] },
    { focus: "Guard the count.", milestones: [ms("polling-agents", "Agents at every stream")] },
  ]);
  eq(
    "phases the AI wrote keep its focus; empty or missing ones keep the starting plan's",
    out.phases.map((p) => [p.key, p.focus === base.phases.find((b) => b.key === p.key)?.focus]),
    [
      ["build", false],
      ["primaries", true],
      ["ticket", true],
      ["campaign", false],
      ["polling", false],
    ],
  );
  eq(
    "kept phases are named, in order",
    out.kept,
    shell.filter((p) => p.key === "primaries" || p.key === "ticket").map((p) => p.title),
  );
  eq(
    "a kept phase has the starting plan's milestones",
    out.phases[1]!.milestones.map((m) => m.key),
    base.phases[1]!.milestones.map((m) => m.key),
  );
  eq(
    "an empty date or measure reads as none",
    [out.phases[0]!.milestones[0]!.by, out.phases[0]!.milestones[0]!.measure],
    [null, null],
  );
  eq(
    "a key an earlier phase used gets its phase in front, so progress isn't shared",
    out.phases[3]!.milestones.map((m) => m.key),
    ["campaign-build-field-walk"],
  );
  const all = out.phases.flatMap((p) => p.milestones.map((m) => m.key));
  eq("every key in the merged draft is unique", new Set(all).size, all.length);
  eq(
    "nothing written keeps every phase",
    mergeDraft(shell, base, [null, null, null, null, null]).kept.length,
    5,
  );
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
