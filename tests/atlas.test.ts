// Checks for the election atlas's arithmetic: turnout, shares, margins, swing,
// the register, what to do and why, and the votes within reach. Pure. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas.test.ts

import {
  blocShares,
  figureTag,
  margin,
  notRegistered,
  ourShare,
  registerFlag,
  registerGrowth,
  swing,
  topQuarter,
  turnout,
  validVotes,
  votesWithinReach,
  whatToDo,
  type AreaCount,
} from "@/lib/atlas";

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

/** Every number in a value rounded to four places, so float noise can't fail a check. */
const r4 = (v: unknown): unknown =>
  typeof v === "number"
    ? Math.round(v * 1e4) / 1e4
    : Array.isArray(v)
      ? v.map(r4)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r4(x)]))
        : v;
const near = (name: string, got: unknown, want: unknown) => eq(name, r4(got), r4(want));

const count = (cands: [string, number][], o: Partial<AreaCount> = {}): AreaCount => ({
  year: 2022,
  candidates: cands.map(([bloc, votes]) => ({
    name: `${bloc} candidate`,
    party: null,
    bloc,
    votes,
  })),
  registered: 100_000,
  cast: 50_000,
  rejected: 0,
  valid: null,
  ...o,
});
const KK = "Kenya Kwanza";
const AZ = "Azimio";
const IND = "Independent: Jane Wambui";
const C = count([
  [KK, 30_000],
  [AZ, 18_000],
  [IND, 2_000],
]);

near("turnout", turnout(C), 0.5);
eq("no turnout without a register", turnout(count([[KK, 1]], { registered: null })), null);
eq("valid votes add up when the document doesn't give them", validVotes(C), 50_000);
near("each bloc's share, largest first", blocShares(C), [
  { bloc: KK, votes: 30_000, share: 0.6 },
  { bloc: AZ, votes: 18_000, share: 0.36 },
  { bloc: IND, votes: 2_000, share: 0.04 },
]);
near(
  "a partial list uses the document's valid votes",
  ourShare(
    count(
      [
        [KK, 30_000],
        [AZ, 18_000],
      ],
      { valid: 60_000 },
    ),
    KK,
  ),
  0.5,
);
eq("no side, no share", ourShare(C, null), null);
eq("a side with nobody standing here has nothing", ourShare(C, "Jubilee"), 0);
near("margin over the strongest other bloc", margin(C, KK), 0.24);
near("a negative margin when behind", margin(C, AZ), -0.24);
near(
  "swing between elections, each with its own side",
  swing(
    C,
    KK,
    count([
      ["Jubilee", 25_000],
      ["NASA", 25_000],
    ]),
    "Jubilee",
  ),
  0.1,
);
eq("no swing without the election before", swing(C, KK, null, "Jubilee"), null);
near("register growth", registerGrowth(120_000, 100_000), { change: 20_000, rate: 0.2 });
eq("no growth without both", registerGrowth(120_000, null), null);
near(
  "adults not registered, and how young they are",
  notRegistered({ adults: 1_000, young_adults: 400 }, 700),
  {
    adults: 300,
    youngShare: 0.4,
  },
);
eq("never below zero", notRegistered({ adults: 1_000, young_adults: 400 }, 1_200)?.adults, 0);
eq(
  "the register flag at a quarter",
  [registerFlag({ adults: 300 }, 1_000), registerFlag({ adults: 200 }, 1_000)],
  [true, false],
);
eq(
  "the top quarter of turnouts, by nearest rank",
  [topQuarter([0.7, 0.4, 0.6, 0.5]), topQuarter([0.5])],
  [0.6, 0.5],
);
eq("no turnouts, no top quarter", topQuarter([]), null);
eq(
  "votes within reach: a turnout push and a 5-point swing",
  votesWithinReach(C, KK, [0.4, 0.5, 0.6, 0.7]),
  {
    turnout: 6_000,
    persuasion: 2_500,
    total: 8_500,
    partial: false,
  },
);
eq(
  "with fewer than four places' turnouts, the turnout part is missing and the total partial",
  votesWithinReach(C, KK, [0.5, 0.6, 0.7]),
  { turnout: null, persuasion: 2_500, total: 2_500, partial: true },
);
eq(
  "no turnout votes when already in the top quarter",
  votesWithinReach(C, KK, [0.3, 0.35, 0.4, 0.45])?.turnout,
  0,
);
eq("no reach without a side", votesWithinReach(C, null, [0.5]), null);

const todo = (
  cands: [string, number][],
  parentTurnout: number | null = 0.5,
  before: AreaCount | null = null,
) =>
  whatToDo({
    year: 2022,
    count: count(cands),
    side: KK,
    parentTurnout,
    parentName: "Nairobi",
    before: before ? { year: 2017, count: before, side: "Jubilee" } : null,
  });

eq(
  "mobilise: ours, but turnout well below the county's",
  todo(
    [
      [KK, 30_000],
      [AZ, 20_000],
    ],
    0.6,
  ),
  {
    todo: "mobilise",
    reason: "We took 60.0% here in 2022, but turnout was 50%, 10 points below Nairobi.",
  },
);
eq(
  "hold: 60% or more",
  todo(
    [
      [KK, 30_000],
      [AZ, 20_000],
    ],
    0.52,
  ),
  {
    todo: "hold",
    reason: "We took 60.0% here in 2022.",
  },
);
eq(
  "cut the gap: behind by more than 10 points",
  todo([
    [KK, 15_000],
    [AZ, 33_000],
    [IND, 2_000],
  ]),
  {
    todo: "cut",
    reason: "We trail Azimio by 36 points here in 2022: 30.0% to 66.0%.",
  },
);
eq(
  "persuade: a close one",
  todo([
    [KK, 24_000],
    [AZ, 22_500],
    [IND, 3_500],
  ]),
  {
    todo: "persuade",
    reason: "2022 was close: 48.0% to us against 45.0% for Azimio.",
  },
);
eq(
  "persuade: a big swing",
  todo(
    [
      [KK, 27_500],
      [AZ, 17_500],
      [IND, 5_000],
    ],
    0.5,
    count([
      ["Jubilee", 21_000],
      ["NASA", 29_000],
    ]),
  ),
  { todo: "persuade", reason: "Our share moved 13 points up between 2017 and 2022." },
);
eq(
  "lean ours",
  todo([
    [KK, 27_500],
    [AZ, 17_500],
    [IND, 5_000],
  ]),
  {
    todo: "lean-ours",
    reason: "We took 55.0% here in 2022, a 20-point lead.",
  },
);
eq(
  "behind by 14 points is cutting the gap, not a lean",
  todo([
    [KK, 21_000],
    [AZ, 28_000],
    [IND, 1_000],
  ]),
  {
    todo: "cut",
    reason: "We trail Azimio by 14 points here in 2022: 42.0% to 56.0%.",
  },
);
eq(
  "a crowded race we lead by 15 leans ours on 45%",
  todo([
    [KK, 22_500],
    [AZ, 15_000],
    [IND, 12_500],
  ]),
  {
    todo: "lean-ours",
    reason: "We took 45.0% here in 2022, a 15-point lead.",
  },
);
eq(
  "a narrow lead on a small share is persuade",
  todo([
    [KK, 19_000],
    [AZ, 15_000],
    ["Independent: A", 8_000],
    ["Independent: B", 8_000],
  ]),
  {
    todo: "persuade",
    reason: "2022 was close: 38.0% to us against 30.0% for Azimio.",
  },
);
eq(
  "a lead of exactly 10 points is still close",
  todo([
    [KK, 27_500],
    [AZ, 22_500],
  ])?.todo,
  "persuade",
);
eq(
  "exactly half the vote with a turnout gap of exactly 3 points isn't mobilise; more than 3 is",
  [
    todo(
      [
        [KK, 25_000],
        [AZ, 25_000],
      ],
      0.53,
    )?.todo,
    todo(
      [
        [KK, 25_000],
        [AZ, 25_000],
      ],
      0.54,
    )?.todo,
  ],
  ["persuade", "mobilise"],
);
eq(
  "no side yet",
  whatToDo({
    year: 2022,
    count: C,
    side: null,
    parentTurnout: 0.5,
    parentName: "Nairobi",
    before: null,
  }),
  { todo: "no-side", reason: "Set your side in 2022 first." },
);
eq(
  "the tag on every figure",
  [figureTag("IEBC", "constituency", 2022), figureTag("WorldPop", "ward", 2020, true)],
  ["IEBC · constituency total · 2022", "WorldPop estimate · 2020"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
