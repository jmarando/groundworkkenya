// Checks for the Outlook 2027 engine: the baseline plan returns 2022 exactly,
// each move changes what it should and nothing else, a plan pushed past its
// ends never gives a negative or NaN vote, a tie at the top is nobody's lead,
// and the sliders' rules (which candidate gives votes up, which gets them back)
// hold. The Nairobi figures were worked out apart from the module, from the
// definitions, on the same rows (scratchpad outlook/ref.py). Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/outlook.test.ts

import {
  addCandidate,
  allocate,
  baselinePlan,
  dropCandidate,
  fitSplit,
  isBaseline,
  likeBefore,
  shiftSplit,
  simulate,
  splitPool,
  validatePlan,
  withBack,
  withGoes,
  type Outlook,
  type Plan,
} from "@/lib/outlook";
import { seatFromAtlas, type Seat, type SeatBucket } from "@/lib/seat";

import { atlasFromCsv } from "./atlas-csv";

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

/** Within `eps` of `want`: votes are fractions once a plan has scaled them. */
function near(name: string, got: number, want: number, eps = 1e-6) {
  if (Math.abs(got - want) <= eps) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${got}\n  want ${want} (±${eps})`);
  }
}
function nears(name: string, got: number[], want: number[], eps = 1e-6) {
  eq(`${name}: how many`, got.length, want.length);
  want.forEach((w, i) => near(`${name}[${i}]`, got[i] ?? NaN, w, eps));
}

/** A made-up seat: buckets as [key, yours, rival, registered]. */
function toy(
  buckets: [string, number, number, number][],
  extra: { others?: number; topOther?: number; together?: string } = {},
): Seat {
  const bs: SeatBucket[] = buckets.map(([key, yours, rival, registered]) => ({
    key,
    name: key.toUpperCase(),
    seats: key === extra.together ? 2 : 1,
    together: key === extra.together,
    yours,
    rival,
    registered,
  }));
  const y = bs.reduce((t, b) => t + b.yours, 0);
  const v = bs.reduce((t, b) => t + b.rival, 0);
  const others = extra.others ?? 0;
  return {
    county: "x",
    countyName: "Xland",
    election: "2022-governor",
    yours: { name: "Ann", bloc: "P" },
    rival: { name: "Ben", bloc: "Q" },
    defaulted: false,
    others,
    topOther: extra.topOther ?? others,
    total: { yours: y, rival: v, valid: y + v + others },
    buckets: bs,
    president: null,
    source: { constituencies: "c", county: "k", president: null },
  };
}
const outlook = (seat: Seat, fresh: Record<string, number> | null = null): Outlook => ({
  seat,
  youth: null,
  registration: null,
  fresh,
});

// A seat with round numbers: yours 1,100, rival 1,000, others 100, valid 2,200, register 3,100.
const small = toy(
  [
    ["a", 600, 400, 1500],
    ["b", 300, 500, 1200],
    ["c", 200, 100, 400],
  ],
  { others: 100, topOther: 60, together: "c" },
);
const O = outlook(small);
const P = baselinePlan(small);
const run = (plan: Plan, o: Outlook = O) => simulate(o, plan);
/** `plan` with one pool's take replaced. */
const takes = (
  plan: Plan,
  pool: "yours" | "rival" | "new",
  back: number,
  goes: number[],
): Plan => ({
  ...plan,
  takes: { ...plan.takes, [pool]: { back, goes } },
});

// ------------------------------------------------------------- the baseline plan

eq("the field", P.names, ["Your candidate", "Main rival"]);
eq("yours go home", P.takes.yours, { back: 100, goes: [100, 0, 0, 0] });
eq("the rival's go home", P.takes.rival, { back: 100, goes: [0, 100, 0, 0] });
eq("new registrations stay home", P.takes.new.back, 0);
nears("new registrations, if they vote, split as the county did", P.takes.new.goes, [
  50,
  100 * (1000 / 2200),
  0,
  0,
]);
eq("a name for the first slot", baselinePlan(small, ["Wanjiru"]).names, ["Wanjiru", "Main rival"]);
eq("blank names are the defaults", baselinePlan(small, [" ", ""]).names, [
  "Your candidate",
  "Main rival",
]);
eq("names are trimmed", baselinePlan(small, [" Ayo ", " Bea "]).names, ["Ayo", "Bea"]);
eq("a longer field", baselinePlan(small, ["A", "B", "C"]).names, ["A", "B", "C"]);
eq("never more than four", baselinePlan(small, ["A", "B", "C", "D", "E"]).names.length, 4);

// ------------------------------------------------------------- 2022 again

{
  const r = run(P);
  eq("votes", r.votes, [1100, 1000]);
  eq("everyone else", r.everyone, 100);
  eq("valid", r.valid, 2200);
  nears("shares", r.shares, [0.5, 1000 / 2200]);
  eq("the rival", r.rival, 1);
  eq("the margin", r.margin, 100);
  eq("leads", r.leads, true);
  eq("top", r.top, 0);
  eq("votes to turn it", r.toTurn, 51);
  eq("the register", r.registered, 3100);
  near("turnout", r.turnout, 2200 / 3100);
  eq("where the votes come from", r.from, { yours: [1100, 0], rival: [0, 1000], new: [0, 0] });
  eq(
    "the constituencies",
    r.buckets.map((b) => [
      b.key,
      b.together,
      b.seats,
      b.registered,
      b.fresh,
      b.votes,
      b.margin,
      b.leader,
    ]),
    [
      ["a", false, 1, 1500, 0, [600, 400], 200, 0],
      ["b", false, 1, 1200, 0, [300, 500], -200, 1],
      ["c", true, 2, 400, 0, [200, 100], 100, 0],
    ],
  );
  eq("it is the baseline", isBaseline(P, small), true);
}

// ------------------------------------------------------------- moves

{
  const r = run(withGoes(P, "yours", 1, 10));
  nears("a tenth of yours go to the rival", r.votes, [990, 1110]);
  near("the margin", r.margin, -120);
  eq("no longer leads", [r.leads, r.top, r.toTurn], [false, 1, 61]);
  nears("they come from yours", r.from.yours, [990, 110]);
}
{
  const r = run(withBack(P, "rival", 50));
  nears("half the rival's stay home", r.votes, [1100, 500]);
  eq("the valid votes fall with them", r.valid, 1700);
  eq("the margin", r.margin, 600);
}
{
  const p = splitPool(P, "rival");
  eq("splitting the rival's group adds a candidate", p.names, [
    "Your candidate",
    "Main rival",
    "Second rival",
  ]);
  eq("shared equally", p.takes.rival.goes, [0, 50, 50, 0]);
  eq("yours are untouched", p.takes.yours, P.takes.yours);
  const r = run(p);
  nears("votes", r.votes, [1100, 500, 500]);
  eq("the rival is the first of the equal", r.rival, 1);
  near("the margin", r.margin, 600);
  eq("again does nothing new", splitPool(p, "rival"), p);
  eq("it is not the baseline", isBaseline(p, small), false);
}
{
  const p = splitPool(P, "yours");
  eq("yours shared with the new candidate", p.takes.yours.goes, [50, 0, 50, 0]);
  const r = run(p);
  nears("votes", r.votes, [550, 1000, 550]);
  eq("the rival", r.rival, 1);
  near("the margin", r.margin, -450);
  eq("leads, top, to turn", [r.leads, r.top, r.toTurn], [false, 1, 226]);
}
{
  const four = baselinePlan(small, ["A", "B", "C", "D"]);
  const p = splitPool(four, "rival");
  eq("a full field is not grown", p.names.length, 4);
  eq("the third candidate shares", p.takes.rival.goes, [0, 50, 50, 0]);
}
{
  // The votes of a group that vote for nobody in the field are "everyone else".
  const r = run(takes(takes(P, "rival", 0, [0, 100, 0, 0]), "yours", 100, [10, 0, 0, 0]));
  nears("votes", r.votes, [110, 0]);
  near("everyone else", r.everyone, 1090);
  eq("a lead over the field is not a lead over everyone else", [r.margin, r.leads], [110, false]);
}

// ------------------------------------------------------------- new registrations

const fresh = { a: 100, b: 100, c: 100 };
{
  const o = outlook(small, fresh);
  const r0 = run(P, o);
  eq("not counted until they vote", r0.votes, [1100, 1000]);
  eq("the register has them", r0.registered, 3400);
  eq(
    "each place has its share",
    r0.buckets.map((b) => b.fresh),
    [100, 100, 100],
  );
  const p = withBack(P, "new", 100);
  const r = run(p, o);
  nears("they vote as the county did", r.votes, [1250, 1000 + 300 * (1000 / 2200)]);
  near("everyone else gets the rest", r.everyone, 100 + 300 * (100 / 2200));
  near("valid", r.valid, 2500);
  nears("they are where the votes come from", r.from.new, [150, 300 * (1000 / 2200)]);
  near("turnout is over the register with them", r.turnout, 2500 / 3400);
  const all = run(withGoes(p, "new", 0, 100), o);
  nears("all for the first", all.votes, [1400, 1000]);
  near("valid", all.valid, 2500);
  const half = run(withBack(withGoes(p, "new", 0, 100), "new", 50), o);
  nears("half of them vote", half.votes, [1250, 1000]);
  const some = run(p, outlook(small, { a: 100 }));
  near("a place without a figure has none", some.valid, 2200 + 100);
  const none = run(p, outlook(small, null));
  nears("no figure, no votes", none.votes, [1100, 1000]);
}

// ------------------------------------------------------------- a plan pushed past its ends

{
  const finite = (name: string, r: ReturnType<typeof run>) => {
    const all = [...r.votes, r.everyone, r.valid, r.margin, r.turnout, ...r.shares];
    eq(`${name}: finite`, all.every(Number.isFinite), true);
    eq(
      `${name}: no vote below nothing`,
      [...r.votes, r.everyone].every((v) => v >= 0),
      true,
    );
    near(
      `${name}: the valid votes are the votes`,
      r.valid,
      r.votes.reduce((t, v) => t + v, 0) + r.everyone,
    );
    for (const b of r.buckets)
      eq(
        `${name}: ${b.key} is not negative`,
        b.votes.every((v) => v >= 0),
        true,
      );
  };
  const a = run(takes(P, "yours", 150, [100, 0, 0, 0]));
  finite("back past 100", a);
  eq("is as if 100", a.votes[0], 1100);
  const b = run(takes(P, "rival", -10, [0, 100, 0, 0]));
  finite("back below nothing", b);
  eq("is as if nothing", [b.votes[1], b.valid], [0, 1200]);
  const c = run(takes(P, "yours", 100, [120, 0, 0, 0]));
  finite("a share past 100", c);
  eq("is as if 100", c.votes[0], 1100);
  const d = run(takes(P, "yours", 100, [80, 80, 0, 0]));
  finite("shares adding to 160", d);
  nears("are scaled to 100", d.votes, [550, 1550]);
  near("so nobody is counted twice", d.valid, 2200);
  const e = run(takes(P, "yours", 100, [50, 0, 50, 0]));
  finite("a share for a candidate not in the field", e);
  nears("goes to everyone else", [e.votes[0]!, e.everyone], [550, 650]);
  const f = run(takes(P, "yours", Number.NaN, [100, 0, 0, 0]));
  finite("back that is not a number", f);
  eq("is as if nothing", f.votes[0], 0);
  const g = run(takes(P, "yours", 100, [Number.NaN, 0, 0, 0]));
  finite("a share that is not a number", g);
  eq("is as if nothing", g.votes[0], 0);
  const h = run(takes(P, "new", Number.POSITIVE_INFINITY, [100, 0, 0, 0]), outlook(small, fresh));
  finite("back at infinity", h);
  nears("is as if 100", h.votes, [1400, 1000]);
}

// ------------------------------------------------------------- level at the top

{
  const tied = toy(
    [
      ["a", 500, 500, 1200],
      ["b", 500, 500, 1200],
    ],
    { others: 0 },
  );
  const r = simulate(outlook(tied), baselinePlan(tied));
  eq("a tie", [r.margin, r.leads, r.top, r.toTurn, r.rival], [0, false, null, 1, 1]);
  eq(
    "a tie in a place",
    r.buckets.map((b) => b.leader),
    [null, null],
  );
  const p = splitPool(baselinePlan(tied), "rival");
  const s = simulate(outlook(tied), p);
  eq("ahead of two who share the rest", [s.margin, s.leads, s.top], [500, true, 0]);
  // Three in the field, the top two level and the third behind.
  const three = baselinePlan(tied, ["A", "B", "C"]);
  const level = simulate(
    outlook(tied, { a: 150, b: 150 }),
    takes(three, "new", 100, [0, 0, 100, 0]),
  );
  nears("two level at the top", level.votes, [1000, 1000, 300]);
  eq("nobody is on top", [level.top, level.rival, level.leads], [null, 1, false]);
  const ahead = simulate(
    outlook(tied, { a: 150, b: 150 }),
    takes(takes(three, "new", 100, [0, 0, 100, 0]), "rival", 90, [0, 100, 0, 0]),
  );
  eq("one vote more is the top", [ahead.top, ahead.leads, ahead.margin], [0, true, 100]);
}

// the rival is the strongest of the others, the first on a tie
{
  const p = takes(baselinePlan(small, ["A", "B", "C"]), "rival", 100, [0, 40, 60, 0]);
  const r = run(p);
  eq("the strongest other", [r.rival, r.margin], [2, 1100 - 600]);
  const q = takes(p, "rival", 100, [0, 50, 50, 0]);
  eq("the first on a tie", run(q).rival, 1);
}

// ------------------------------------------------------------- the sliders' rules

nears("fitSplit: within the room", fitSplit([50, 0, 0, 0], 1, 30), [50, 30, 0, 0]);
nears(
  "fitSplit: past the room, the others give way",
  fitSplit([55, 45, 0, 0], 0, 60),
  [60, 40, 0, 0],
);
nears("fitSplit: in proportion", fitSplit([50, 30, 20, 0], 0, 70), [70, 18, 12, 0]);
nears(
  "fitSplit: to 100 leaves the rest nothing",
  fitSplit([50, 30, 20, 0], 2, 100),
  [0, 0, 100, 0],
);
nears(
  "fitSplit: lowering leaves the rest to everyone else",
  fitSplit([60, 40, 0, 0], 0, 30),
  [30, 40, 0, 0],
);
nears(
  "fitSplit: what everyone else holds is used first",
  fitSplit([20, 30, 0, 0], 2, 40),
  [20, 30, 40, 0],
);
nears("fitSplit: a value past 100", fitSplit([60, 40, 0, 0], 0, 150), [100, 0, 0, 0]);
nears("fitSplit: a value below nothing", fitSplit([60, 40, 0, 0], 0, -5), [0, 40, 0, 0]);
nears(
  "fitSplit: a value that is not a number",
  fitSplit([60, 40, 0, 0], 0, Number.NaN),
  [0, 40, 0, 0],
);
{
  const g = [60, 40, 0, 0];
  eq(
    "fitSplit: a slot that is not there changes nothing",
    [fitSplit(g, 4, 10), fitSplit(g, -1, 10), fitSplit(g, 1.5, 10)],
    [g, g, g],
  );
  fitSplit(g, 0, 10);
  eq("fitSplit: the input is left alone", g, [60, 40, 0, 0]);
}

nears(
  "shiftSplit: votes leave the home candidate",
  shiftSplit([100, 0, 0, 0], 0, 1, 10),
  [90, 10, 0, 0],
);
nears("shiftSplit: a second", shiftSplit([90, 10, 0, 0], 0, 2, 5), [85, 10, 5, 0]);
nears(
  "shiftSplit: lowering sends them home again",
  shiftSplit([85, 10, 5, 0], 0, 1, 0),
  [95, 0, 5, 0],
);
nears("shiftSplit: home is exhausted, the others give way", shiftSplit([10, 50, 40, 0], 0, 3, 30), [
  0,
  50 - 20 * (50 / 90),
  40 - 20 * (40 / 90),
  30,
]);
nears(
  "shiftSplit: everyone else is used before the others",
  shiftSplit([20, 30, 0, 0], 0, 2, 60),
  [0, 30, 60, 0],
);
nears(
  "shiftSplit: the home slot is the plain rule",
  shiftSplit([60, 40, 0, 0], 0, 0, 30),
  [30, 40, 0, 0],
);
nears(
  "shiftSplit: no home is the plain rule",
  shiftSplit([52, 43, 0, 0], -1, 1, 30),
  [52, 30, 0, 0],
);
nears("shiftSplit: past 100", shiftSplit([100, 0, 0, 0], 0, 1, 150), [0, 100, 0, 0]);
nears("shiftSplit: below nothing", shiftSplit([90, 10, 0, 0], 0, 1, -5), [100, 0, 0, 0]);
{
  const g = [100, 0, 0, 0];
  shiftSplit(g, 0, 1, 10);
  eq("shiftSplit: the input is left alone", g, [100, 0, 0, 0]);
}
{
  // The group's own candidate gives votes up and gets them back: yours is slot 0, the rival's slot 1, new has none.
  const a = withGoes(P, "yours", 1, 10);
  eq("withGoes: yours start at home", a.takes.yours.goes, [90, 10, 0, 0]);
  eq("withGoes: and come back", isBaseline(withGoes(a, "yours", 1, 0), small), true);
  const b = withGoes(P, "rival", 0, 20);
  nears("withGoes: the rival's group starts at slot 1", b.takes.rival.goes, [20, 80, 0, 0]);
  const c = withGoes(P, "new", 1, 70);
  nears("withGoes: new registrations have no home", c.takes.new.goes, [30, 70, 0, 0]);
  eq("withGoes: a slot outside the field changes nothing", withGoes(P, "yours", 2, 10), P);
  eq("withGoes: nor a slot that is not there", withGoes(P, "yours", 7, 10), P);
  eq("withBack", withBack(P, "rival", 85).takes.rival.back, 85);
  eq(
    "withBack: clamped",
    [withBack(P, "rival", 140).takes.rival.back, withBack(P, "rival", -3).takes.rival.back],
    [100, 0],
  );
  eq("withBack: not a number", withBack(P, "rival", Number.NaN).takes.rival.back, 0);
}

// ------------------------------------------------------------- the field

{
  const p = addCandidate(P);
  eq("a candidate is added", p.names, ["Your candidate", "Main rival", "Second rival"]);
  eq("with a name", addCandidate(P, "  Karauri ").names[2], "Karauri");
  eq("a blank name is the default", addCandidate(P, "  ").names[2], "Second rival");
  eq("the takes are left alone", p.takes, P.takes);
  const four = addCandidate(p);
  eq("to four", four.names, ["Your candidate", "Main rival", "Second rival", "Third rival"]);
  eq("and no more", addCandidate(four), four);
  const full: Plan = {
    names: ["a", "b", "c", "d"],
    takes: {
      yours: { back: 100, goes: [10, 20, 30, 40] },
      rival: { back: 100, goes: [40, 30, 20, 10] },
      new: { back: 50, goes: [25, 25, 25, 25] },
    },
  };
  const d = dropCandidate(full, 2);
  eq("dropping moves the later ones up", d.names, ["a", "b", "d"]);
  eq(
    "and their shares",
    [d.takes.yours.goes, d.takes.rival.goes, d.takes.new.goes],
    [
      [10, 20, 40, 0],
      [40, 30, 10, 0],
      [25, 25, 25, 0],
    ],
  );
  eq("the last", dropCandidate(full, 3).names, ["a", "b", "c"]);
  eq("the first two cannot go", [dropCandidate(full, 0), dropCandidate(full, 1)], [full, full]);
  eq("nor one who is not there", dropCandidate(addCandidate(P), 3), addCandidate(P));
  eq("the plan given is left alone", full.names, ["a", "b", "c", "d"]);
}

// ------------------------------------------------------------- new voters like 2022's

{
  const p = likeBefore(P, small);
  near("they vote at the rate of the 2022 register", p.takes.new.back, 100 * (2200 / 3100));
  nears("and split as the county did", p.takes.new.goes, [50, 100 * (1000 / 2200), 0, 0]);
  eq(
    "the rest is untouched",
    [p.takes.yours, p.takes.rival, p.names],
    [P.takes.yours, P.takes.rival, P.names],
  );
  const r = run(p, outlook(small, fresh));
  near("they add the votes of the register's rate", r.valid, 2200 + 300 * (2200 / 3100), 1e-9);
  near("so turnout over the register with them is what it was", r.turnout, 2200 / 3100, 1e-9);
}

// ------------------------------------------------------------- a plan that is not valid

eq("the baseline is valid", validatePlan(P), []);
eq(
  "so is a plan the sliders made",
  validatePlan(withGoes(splitPool(P, "rival"), "yours", 1, 10)),
  [],
);
eq("a field of one", validatePlan({ ...P, names: ["a"] }), ["The field needs 2 to 4 candidates"]);
eq("a field of five", validatePlan({ ...P, names: ["a", "b", "c", "d", "e"] }), [
  "The field needs 2 to 4 candidates",
]);
eq("a name that is blank", validatePlan({ ...P, names: ["a", " "] }), ["Candidate 2 has no name"]);
eq("back past 100", validatePlan(takes(P, "yours", 101, [100, 0, 0, 0])), [
  "yours: back is not between 0 and 100",
]);
eq("back that is not a number", validatePlan(takes(P, "new", Number.NaN, [100, 0, 0, 0])), [
  "new: back is not between 0 and 100",
]);
eq("a share below nothing", validatePlan(takes(P, "rival", 100, [0, 100, -1, 0])), [
  "rival: the share for candidate 3 is not between 0 and 100",
]);
eq("shares past 100 together", validatePlan(takes(P, "rival", 100, [60, 60, 0, 0])), [
  "rival: the shares add to more than 100",
]);
eq("not four shares", validatePlan(takes(P, "rival", 100, [0, 100])), ["rival: needs 4 shares"]);
eq("votes for a candidate who is not there", validatePlan(takes(P, "yours", 100, [90, 0, 10, 0])), [
  "yours: votes go to candidate 3, who is not in the field",
]);
eq(
  "every problem is named",
  validatePlan({ ...takes(P, "yours", 200, [100, 0, 0, 0]), names: ["a", ""] }),
  ["Candidate 2 has no name", "yours: back is not between 0 and 100"],
);

// ------------------------------------------------------------- is it 2022 again

eq("a name is not a change", isBaseline({ ...P, names: ["Ayo", "Bea"] }, small), true);
eq("a candidate added is", isBaseline(addCandidate(P), small), false);
eq("new voters turned on is", isBaseline(withBack(P, "new", 10), small), false);
eq("a back of 99 is", isBaseline(withBack(P, "yours", 99), small), false);
eq(
  "a share moved and moved back is not",
  isBaseline(withGoes(withGoes(P, "rival", 0, 10), "rival", 0, 0), small),
  true,
);
eq(
  "the other seat's baseline is not this one's",
  isBaseline(baselinePlan(toy([["a", 1, 3, 10]])), small),
  false,
);

// ------------------------------------------------------------- placing a total

eq("one key gets all", allocate(10, { a: 3 }), { a: 10 });
eq("in proportion, adding to the total", allocate(100, { a: 1, b: 1, c: 2 }), {
  a: 25,
  b: 25,
  c: 50,
});
eq("largest remainders", allocate(10, { a: 1, b: 1, c: 1 }), { a: 4, b: 3, c: 3 });
eq("ties go by key", allocate(1, { b: 1, a: 1 }), { b: 0, a: 1 });
eq("the biggest remainder first", allocate(5, { a: 0.5, b: 0.3, c: 0.2 }), { a: 3, b: 1, c: 1 });
eq("a zero weight gets nothing", allocate(7, { a: 0, b: 5 }), { a: 0, b: 7 });
eq("a negative weight is as zero", allocate(7, { a: -4, b: 5 }), { a: 0, b: 7 });
eq("nothing to place", allocate(0, { a: 1, b: 2 }), { a: 0, b: 0 });
eq("every weight zero", allocate(10, { a: 0, b: 0 }), null);
eq("no keys", allocate(10, {}), null);
eq("a total that is not whole", allocate(10.5, { a: 1 }), null);
eq("a total below nothing", allocate(-1, { a: 1 }), null);
eq("a weight that is not a number", allocate(10, { a: Number.NaN, b: 1 }), { a: 0, b: 10 });
{
  const w = { a: 3, b: 7, c: 11, d: 13, e: 17 };
  const r = allocate(1001, w)!;
  eq(
    "whole numbers that add up",
    [Object.values(r).every(Number.isInteger), Object.values(r).reduce((t, v) => t + v, 0)],
    [true, 1001],
  );
}

// ------------------------------------------------------------- the edges the mutation check found

{
  // Level with everyone else is not a lead over them.
  const tied = toy(
    [
      ["a", 500, 500, 1200],
      ["b", 500, 500, 1200],
    ],
    { others: 0 },
  );
  const level = simulate(
    outlook(tied),
    takes(takes(baselinePlan(tied), "rival", 0, [0, 100, 0, 0]), "yours", 100, [50, 0, 0, 0]),
  );
  eq(
    "level with everyone else",
    [level.votes[0], level.everyone, level.margin, level.leads],
    [500, 500, 500, false],
  );
  // Within half a vote is level.
  const half = simulate(outlook(tied), withBack(baselinePlan(tied), "rival", 99.96));
  near("a margin of 0.4 of a vote", half.margin, 0.4, 1e-9);
  eq("is level", [half.leads, half.top, half.toTurn], [false, null, 1]);
  const one = simulate(outlook(tied), withBack(baselinePlan(tied), "rival", 99.9));
  eq("a whole vote is a lead", [one.leads, one.top], [true, 0]);
  // A seat with no votes and no register.
  const empty = toy([["a", 0, 0, 0]], { others: 0 });
  eq("an empty seat: no NaN", baselinePlan(empty).takes.new.goes, [0, 0, 0, 0]);
  eq(
    "an empty seat: the register's rate is nothing",
    likeBefore(baselinePlan(empty), empty).takes.new.back,
    0,
  );
  const nothing = simulate(outlook(empty), baselinePlan(empty));
  eq(
    "an empty seat: nothing to count",
    [nothing.valid, nothing.turnout, nothing.leads, nothing.top, nothing.shares],
    [0, 0, false, null, [0, 0]],
  );
}
{
  // A figure that is below nothing or not a number is none.
  const o = (f: Record<string, number>) => simulate(outlook(small, f), withBack(P, "new", 100));
  near("below nothing", o({ a: -50, b: 100, c: 100 }).valid, 2200 + 200);
  near("not a number", o({ a: Number.NaN, b: 100, c: 100 }).valid, 2200 + 200);
  near("infinite", o({ a: Number.POSITIVE_INFINITY, b: 100, c: 100 }).valid, 2200 + 200);
  eq("and the register counts none of them", o({ a: -50, b: 100, c: 100 }).registered, 3100 + 200);
}
{
  // The rival is the strongest of three others, and a bucket's margin is against the strongest there.
  const four = baselinePlan(small, ["A", "B", "C", "D"]);
  eq("the strongest of three", run(takes(four, "rival", 100, [0, 10, 20, 70])).rival, 3);
  const three = takes(baselinePlan(small, ["A", "B", "C"]), "rival", 100, [0, 20, 80, 0]);
  eq(
    "a bucket's margin is against its strongest",
    run(three).buckets.map((b) => b.margin),
    [600 - 320, 300 - 400, 200 - 80],
  );
}
{
  // Messages for the ends of a range.
  eq("back below nothing", validatePlan(takes(P, "yours", -1, [100, 0, 0, 0])), [
    "yours: back is not between 0 and 100",
  ]);
  eq("a share past 100", validatePlan(takes(P, "yours", 100, [101, 0, 0, 0])), [
    "yours: the share for candidate 1 is not between 0 and 100",
    "yours: the shares add to more than 100",
  ]);
  eq("a share that is not a number", validatePlan(takes(P, "yours", 100, [Number.NaN, 0, 0, 0])), [
    "yours: the share for candidate 1 is not between 0 and 100",
  ]);
}
nears(
  "fitSplit: the others are held to 0 to 100 first",
  fitSplit([120, 60, 0, 0], 2, 10),
  [56.25, 33.75, 10, 0],
);
nears(
  "withGoes: new registrations have no home, whichever slot",
  withGoes(P, "new", 0, 70).takes.new.goes,
  [70, 30, 0, 0],
);
eq(
  "a slot that is not there is not dropped",
  dropCandidate(
    { ...addCandidate(P), takes: { ...P.takes, yours: { back: 100, goes: [100, 0, 0, 5] } } },
    3,
  ).takes.yours.goes,
  [100, 0, 0, 5],
);
eq("an infinite weight is none", allocate(10, { a: Number.POSITIVE_INFINITY, b: 1 }), {
  a: 0,
  b: 10,
});

// ------------------------------------------------------------- Nairobi, worked out apart

const r0 = seatFromAtlas(atlasFromCsv(), "nairobi", null);
if (!r0.ok) throw new Error(r0.why);
const nairobi = r0.seat;
const FRESH: Record<string, number> = {
  "nairobi/dagoretti-north": 15803,
  "nairobi/dagoretti-south": 13406,
  "nairobi/embakasi-west": 15180,
  "nairobi/kamukunji": 19993,
  "nairobi/kasarani": 6996,
  "nairobi/kibra": 38730,
  "nairobi/langata": 0,
  "nairobi/makadara": 9106,
  "nairobi/mathare": 11367,
  "nairobi/roysambu": 13142,
  "nairobi/ruaraka": 43240,
  "nairobi/starehe": 0,
  "nairobi/westlands": 20247,
  "nairobi#together": 69676,
};
const N = outlook(nairobi, FRESH);
const NP = baselinePlan(nairobi);
{
  const r = simulate(N, NP);
  eq(
    "2022: votes, everyone else, valid",
    [...r.votes, r.everyone, r.valid],
    [699392, 573516, 51501, 1324409],
  );
  eq(
    "2022: the margin, the votes to turn it",
    [r.margin, r.toTurn, r.leads, r.top],
    [125876, 62939, true, 0],
  );
  eq("2022: the register, with the new registrations", r.registered, 2415310 + 276886);
  for (const b of nairobi.buckets) {
    const o = r.buckets.find((x) => x.key === b.key)!;
    eq(
      `2022: ${b.name} as the atlas has it`,
      [o.votes, o.registered, o.together],
      [[b.yours, b.rival], b.registered, b.together],
    );
  }
  eq(
    "2022: the fresh registrations add up",
    r.buckets.reduce((t, b) => t + b.fresh, 0),
    276886,
  );
}
{
  const r = simulate(N, splitPool(NP, "rival"));
  eq(
    "the rival's 2022 voters shared by two",
    [...r.votes, r.everyone, r.valid],
    [699392, 286758, 286758, 51501, 1324409],
  );
  eq(
    "so the leader is far ahead of either",
    [r.rival, r.margin, r.toTurn, r.leads],
    [1, 412634, 206318, true],
  );
  nears("their shares", r.shares, [699392 / 1324409, 286758 / 1324409, 286758 / 1324409], 1e-12);
}
{
  const r = simulate(N, splitPool(NP, "yours"));
  eq(
    "the winner's 2022 voters shared by two",
    [...r.votes, r.valid],
    [349696, 573516, 349696, 1324409],
  );
  eq(
    "so the other side is ahead",
    [r.rival, r.margin, r.toTurn, r.leads, r.top],
    [1, -223820, 111911, false, 1],
  );
}
{
  const r = simulate(N, withGoes(NP, "yours", 1, 10));
  nears("a tenth of the winner's 2022 voters go to the rival", r.votes, [629452.8, 643455.2]);
  near("the margin", r.margin, -14002.4);
  const s = simulate(N, withBack(NP, "rival", 85));
  nears(
    "a seventh of the rival's stay home",
    [s.votes[0]!, s.votes[1]!, s.everyone, s.valid],
    [699392, 487488.6, 51501, 1238381.6],
  );
}
{
  const r = simulate(N, withGoes(withBack(NP, "new", 100), "new", 0, 100));
  eq(
    "every new registration for the first",
    [r.votes[0], r.votes[1], r.valid, r.margin],
    [976278, 573516, 1601295, 402762],
  );
}
{
  const p = likeBefore(NP, nairobi);
  near("new registrations vote at 2022's rate", p.takes.new.back, 100 * (1324409 / 2415310), 1e-9);
  const r = simulate(N, p);
  nears("votes", r.votes, [779568.810973, 639262.654126], 1e-4);
  near("everyone else", r.everyone, 57404.965075, 1e-4);
  near("valid", r.valid, 1476236.430174, 1e-4);
  near("the margin", r.margin, 140306.156848, 1e-4);
  nears("from the new registrations", r.from.new, [80176.810973, 65746.654126], 1e-4);
  near("turnout is what it was", r.turnout, 0.54833914, 1e-8);
  const at = (key: string) => r.buckets.find((b) => b.key === key)!;
  nears("Dagoretti North", at("nairobi/dagoretti-north").votes, [44332.013752, 42779.426541], 1e-4);
  nears("Kibra", at("nairobi/kibra").votes, [41665.896705, 49688.448771], 1e-4);
  eq("Kibra's other side leads", at("nairobi/kibra").leader, 1);
  nears(
    "the four Embakasi seats together",
    at("nairobi#together").votes,
    [185976.810555, 157031.584677],
    1e-4,
  );
  nears("Langata has no new registrations", at("nairobi/langata").votes, [38064, 37336]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
