// Checks for the Path to State House engine: 2022's county rows come back as
// IEBC declared them, a move in a region changes only that region, the two
// bars of Article 138 are exact, and the diaspora never moves. The expected
// figures were worked out apart from the module, from the definitions, on the
// same rows. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/path.test.ts

import { readFileSync } from "node:fs";

import { parseKenya, type County, type Kenya, type Outside } from "@/lib/kenya";
import {
  isBaseline,
  nearLine,
  RULE,
  runPath,
  SIDES,
  turnoutLever,
  worth,
  type Scenario,
  type Side,
} from "@/lib/path";

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

/** Within `eps` of `want`: votes are fractions once a move has scaled them. */
function near(name: string, got: number, want: number, eps: number) {
  if (Math.abs(got - want) <= eps) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${got}\n  want ${want} (±${eps})`);
  }
}

const k = parseKenya(
  readFileSync("data/kenya/regions.csv", "utf8"),
  readFileSync("data/kenya/counties.csv", "utf8"),
);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r3 = (x: number) => Math.round(x * 1e3) / 1e3;
const SIDE_LIST: Side[] = ["ruto", "raila"];
const everywhere = (share: number, turnout = 0): Scenario =>
  Object.fromEntries(k.regions.map((g) => [g.id, { share, turnout }]));

/** A few made-up counties, all in region "a" unless said, 2000 registered and 1000 valid unless said. */
function toy(counties: Partial<County>[], outside: Partial<Outside> = {}): Kenya {
  return {
    regions: [
      { id: "a", name: "A", note: "" },
      { id: "b", name: "B", note: "" },
    ],
    counties: counties.map((c, i) => ({
      code: String(i + 1).padStart(3, "0"),
      name: `C${i + 1}`,
      region: "a",
      registered: 2000,
      valid: 1000,
      rejected: 0,
      raila: 0,
      ruto: 0,
      uhuru2017: 0,
      raila2017: 0,
      valid2017: 1,
      ...c,
    })),
    outside: { registered: 0, valid: 0, rejected: 0, raila: 0, ruto: 0, ...outside },
  };
}

// ------------------------------------------------------------- the rule

eq("Article 138", RULE, { counties: 47, countiesNeeded: 24, countyShare: 0.25, runoffDays: 30 });
eq(
  "the two sides",
  [SIDES.ruto, SIDES.raila],
  [
    { bloc: "Kenya Kwanza", candidate: "William Ruto", rival: "raila" },
    { bloc: "Azimio", candidate: "Raila Odinga", rival: "ruto" },
  ],
);

// ------------------------------------------------------------- 2022 as declared

{
  const p = runPath(k, "ruto");
  const t = p.totals;
  eq(
    "Kenya Kwanza 2022: votes",
    [t.valid, t.yours, t.rival, t.others],
    [14213137, 7176141, 6942930, 94066],
  );
  eq(
    "Kenya Kwanza 2022: the margin and the bars",
    [t.margin, t.toHalf, t.counties],
    [233211, 0, 39],
  );
  eq(
    "Kenya Kwanza 2022: both bars cleared",
    [t.clearsHalf, t.clearsCounties, t.won],
    [true, true, true],
  );
  near("Kenya Kwanza 2022: 50.49% of valid votes", t.share, 7176141 / 14213137, 1e-12);
  near("national turnout 64.77%", t.turnout, 14326751 / 22120458, 1e-9);
}
{
  const p = runPath(k, "raila");
  const t = p.totals;
  eq(
    "Azimio 2022: votes",
    [t.valid, t.yours, t.rival, t.others],
    [14213137, 6942930, 7176141, 94066],
  );
  eq(
    "Azimio 2022: the margin and the bars",
    [t.margin, t.toHalf, t.counties],
    [-233211, 163639, 34],
  );
  eq(
    "Azimio 2022: county bar cleared, votes not",
    [t.clearsHalf, t.clearsCounties, t.won],
    [false, true, false],
  );
  near("Azimio 2022: 48.85% of valid votes", t.share, 6942930 / 14213137, 1e-12);
}

// Each region, worked out from the county rows: [id, counties, valid votes,
// weight, turnout, Ruto's share, Raila's share, Ruto's 2017 side (Uhuru), Raila 2017].
{
  const table: [string, number, number, number, number, number, number, number, number][] = [
    ["nairobi", 1, 1339367, 0.0942, 0.5596, 0.4194, 0.573, 0.4849, 0.51],
    ["mt-kenya-west", 6, 2243014, 0.1578, 0.6684, 0.7811, 0.2105, 0.9561, 0.0408],
    ["mt-kenya-east", 3, 889102, 0.0626, 0.6696, 0.8233, 0.1687, 0.9051, 0.0865],
    ["ukambani", 3, 1030130, 0.0725, 0.6112, 0.2428, 0.7469, 0.1506, 0.8337],
    ["coast", 6, 996875, 0.0701, 0.5133, 0.3375, 0.652, 0.2615, 0.7258],
    ["north-eastern", 3, 378916, 0.0267, 0.6089, 0.2785, 0.7156, 0.6208, 0.3401],
    ["northern", 4, 387762, 0.0273, 0.6557, 0.4284, 0.5673, 0.5832, 0.3828],
    ["rift-kalenjin", 7, 1847580, 0.13, 0.7638, 0.8677, 0.1297, 0.8465, 0.1468],
    ["rift-cosmopolitan", 2, 936683, 0.0659, 0.6494, 0.6113, 0.3827, 0.7482, 0.2457],
    ["maa-lands", 2, 617056, 0.0434, 0.7194, 0.4809, 0.5154, 0.5527, 0.4415],
    ["nyanza-luo", 4, 1559244, 0.1097, 0.7252, 0.0451, 0.9524, 0.0375, 0.9596],
    ["gusii", 2, 611487, 0.043, 0.6434, 0.3494, 0.6445, 0.4619, 0.5241],
    ["western", 4, 1369933, 0.0964, 0.6248, 0.3748, 0.616, 0.1677, 0.82],
  ];
  const ruto = runPath(k, "ruto").regions;
  const raila = runPath(k, "raila").regions;
  eq(
    "the regions, in the file's order, with their counties, votes, weight and turnout",
    ruto.map((g) => [g.id, g.counties, g.valid, r4(g.weight), r4(g.turnout)]),
    table.map(([id, n, v, w, t]) => [id, n, v, w, t]),
  );
  eq(
    "each region's share of the vote for Kenya Kwanza and Azimio",
    [ruto.map((g) => r4(g.share)), raila.map((g) => r4(g.share))],
    [table.map((r) => r[5]), table.map((r) => r[6])],
  );
  eq(
    "2017 to 2022: Uhuru's side to Ruto, and Raila to Raila",
    [
      ruto.map((g) => [r4(g.swing.from), r4(g.swing.to)]),
      raila.map((g) => [r4(g.swing.from), r4(g.swing.to)]),
    ],
    [table.map((r) => [r[7], r[5]]), table.map((r) => [r[8], r[6]])],
  );
  near(
    "weights add up to everything but the diaspora's votes",
    ruto.reduce((t, g) => t + g.weight, 0),
    1 - 5988 / 14213137,
    1e-12,
  );
  eq(
    "with no move each region is as it was",
    ruto.map((g) => [g.now.valid === g.valid, g.votesAdded, g.now.turnout === g.turnout]),
    ruto.map(() => [true, 0, true]),
  );
}

// ------------------------------------------------------------- a move of zero

for (const side of SIDE_LIST)
  eq(`a move of zero changes nothing (${side})`, runPath(k, side, everywhere(0)), runPath(k, side));
eq("isBaseline: nothing, zeros", [isBaseline({}), isBaseline(everywhere(0))], [true, true]);
eq(
  "isBaseline: a share or a turnout move is not",
  [
    isBaseline({ coast: { share: 1, turnout: 0 } }),
    isBaseline({ coast: { share: 0, turnout: -1 } }),
    isBaseline({ coast: { share: 0, turnout: 0 }, western: { share: 0.5, turnout: 0 } }),
  ],
  [false, false, false],
);

// ------------------------------------------------------------- a move in one region

{
  // Azimio +10 in Western: 10% of Western's valid votes more, nothing elsewhere.
  const base = runPath(k, "raila");
  const p = runPath(k, "raila", { western: { share: 10, turnout: 0 } });
  const t = p.totals;
  near("Western +10: Azimio's votes", t.yours, 6942930 + 136993.3, 0.05);
  near("Western +10: the share", t.share, (6942930 + 0.1 * 1369933) / 14213137, 1e-9);
  near("Western +10: ahead by about 36,980", t.margin, 36979.7, 0.5);
  eq("Western +10: still 26,646 short of more than half", t.toHalf, 26646);
  eq("Western +10: counties unchanged, not won", [t.counties, t.won], [34, false]);
  const western = p.regions.find((g) => g.id === "western")!;
  near("Western +10: its votes added", western.votesAdded, 136993.3, 0.05);
  near("Western +10: its share now", western.now.share, 0.616 + 0.1, 0.0005);
  near("Western +10: its 2022 share is as declared", western.share, 0.616, 0.0005);
  near("Western +10: and so is the 2022 end of its swing", western.swing.to, western.share, 1e-12);
  eq(
    "Western +10: its valid votes and turnout are as they were",
    [western.now.valid, western.now.turnout],
    [western.valid, western.turnout],
  );
  eq(
    "Western +10: no other region moves",
    p.regions.filter((g) => g.id !== "western").map((g) => g.votesAdded),
    p.regions.filter((g) => g.id !== "western").map(() => 0),
  );
  eq(
    "Western +10: other regions' counties are as they were",
    p.counties.filter((c) => c.region !== "western"),
    base.counties.filter((c) => c.region !== "western"),
  );
  const ruto = runPath(k, "ruto", { western: { share: 10, turnout: 0 } }).totals;
  near(
    "Western +10 for Kenya Kwanza: the share",
    ruto.share,
    (7176141 + 0.1 * 1369933) / 14213137,
    1e-9,
  );
  eq("Western +10 for Kenya Kwanza: one more county at 25%", ruto.counties, 40);
}

{
  // Counties of a toy region: the rival and the others give way in proportion.
  const t = toy([{ valid: 1000, ruto: 500, raila: 300 }]);
  const c = runPath(t, "ruto", { a: { share: 10, turnout: 0 } }).counties[0]!;
  eq(
    "+10: yours 600, the rest 240 and 160 (300:200)",
    [c.yours, c.rival, c.others, c.valid],
    [600, 240, 160, 1000],
  );
  const d = runPath(t, "ruto", { a: { share: -10, turnout: 0 } }).counties[0]!;
  near("−10: yours 400", d.yours, 400, 1e-9);
  near("−10: the rival 360", d.rival, 360, 1e-9);
  near("−10: the others 240", d.others, 240, 1e-9);
  const e = runPath(t, "raila", { a: { share: 10, turnout: 0 } }).counties[0]!;
  near("for the other side: Raila 400", e.yours, 400, 1e-9);
  near("for the other side: Ruto 428.6 (500:200 of 600)", e.rival, 600 * (500 / 700), 1e-9);
  near("for the other side: the others 171.4", e.others, 600 * (200 / 700), 1e-9);
}

{
  // The ends: shares stop at 0 and 100, with nothing negative and no NaN.
  const t = toy([{ valid: 1000, ruto: 500, raila: 300 }]);
  const up = runPath(t, "ruto", { a: { share: 100, turnout: 0 } }).counties[0]!;
  eq("+100: everything to yours", [up.yours, up.rival, up.others, up.share], [1000, 0, 0, 1]);
  const down = runPath(t, "ruto", { a: { share: -100, turnout: 0 } }).counties[0]!;
  eq(
    "−100: nothing for yours, the rest as 300:200",
    [down.yours, down.rival, down.others, down.share],
    [0, 600, 400, 0],
  );
  const only = toy([{ valid: 1000, ruto: 1000 }]);
  const gone = runPath(only, "ruto", { a: { share: -40, turnout: 0 } }).counties[0]!;
  eq(
    "−40 with no rival and no others: the 40% goes to the rival",
    [gone.yours, gone.rival, gone.others],
    [600, 400, 0],
  );
  const all = runPath(k, "raila", everywhere(100)).counties;
  eq(
    "+100 in every region: every county is all yours",
    all.every((c) => c.share === 1 && c.rival === 0 && c.others === 0),
    true,
  );
  const none = runPath(k, "raila", everywhere(-100)).counties;
  eq(
    "−100 in every region: no county has anything",
    none.every((c) => c.yours === 0 && Math.abs(c.rival + c.others - c.valid) < 1e-6),
    true,
  );
  eq(
    "no NaN or negative vote anywhere at the ends",
    [
      everywhere(100),
      everywhere(-100),
      everywhere(0, 100),
      everywhere(0, -100),
      everywhere(100, 100),
    ].every((sc) =>
      SIDE_LIST.every((side) =>
        runPath(k, side, sc).counties.every((c) =>
          [c.valid, c.yours, c.rival, c.others, c.share].every((x) => Number.isFinite(x) && x >= 0),
        ),
      ),
    ),
    true,
  );
}

// ------------------------------------------------------------- turnout

{
  // 2000 registered, 990 valid + 10 rejected: turnout 50%.
  const t = toy([{ registered: 2000, valid: 990, rejected: 10, ruto: 500, raila: 300 }]);
  const base = runPath(t, "ruto").regions[0]!;
  near("toy turnout is 50%", base.turnout, 0.5, 1e-12);
  const p = runPath(t, "ruto", { a: { share: 0, turnout: 10 } });
  const c = p.counties[0]!;
  near("+10 points of turnout: valid ×1.2 (1,188)", c.valid, 1188, 1e-9);
  near("+10: yours ×1.2, the split as it was", c.yours / c.valid, 500 / 990, 1e-12);
  near("+10: rival ×1.2", c.rival, 360, 1e-9);
  near("+10: the others ×1.2 (190 to 228)", c.others, 228, 1e-9);
  near("+10: the region's turnout is 60%", p.regions[0]!.now.turnout, 0.6, 1e-12);
  near("+10: the votes added are yours ×0.2", p.regions[0]!.votesAdded, 100, 1e-9);
  const full = runPath(t, "ruto", { a: { share: 0, turnout: 100 } });
  near(
    "+100 stops at everyone registered voting: valid 1,980",
    full.counties[0]!.valid,
    1980,
    1e-9,
  );
  near("+100: turnout 100%", full.regions[0]!.now.turnout, 1, 1e-12);
  const low = runPath(t, "ruto", { a: { share: 0, turnout: -100 } });
  eq("−100: nobody votes", [low.counties[0]!.valid, low.counties[0]!.yours], [0, 0]);
  eq(
    "a county nobody voted in has no share and is not at 25%",
    [low.counties[0]!.share, low.regions[0]!.now.share, low.totals.counties],
    [0, 0, 0],
  );
}
{
  // Nairobi +4 points: its votes scale by (t+0.04)/t; the national total follows.
  const base = runPath(k, "raila");
  const p = runPath(k, "raila", { nairobi: { share: 0, turnout: 4 } });
  near(
    "Nairobi +4 turnout: 95,742 more valid votes",
    p.totals.valid - base.totals.valid,
    95742.12,
    0.5,
  );
  near(
    "Nairobi +4 turnout: 54,856 of them Azimio's",
    p.totals.yours - base.totals.yours,
    54855.78,
    0.5,
  );
  near(
    "Nairobi +4 turnout: Azimio's margin grows by 14,698",
    p.totals.margin - base.totals.margin,
    14698.36,
    0.5,
  );
  const nairobi = p.regions.find((g) => g.id === "nairobi")!;
  near("Nairobi +4 turnout: 4 points higher", nairobi.now.turnout - nairobi.turnout, 0.04, 1e-12);
  near("Nairobi +4 turnout: its share is as it was", nairobi.now.share, nairobi.share, 1e-12);
  const rest = p.totals.turnout - base.totals.turnout;
  near(
    "Nairobi +4 turnout: the national turnout moves by its registered share",
    rest,
    (0.04 * 2416551) / 22120458,
    1e-9,
  );
}

// ------------------------------------------------------------- the diaspora

for (const side of SIDE_LIST) {
  const sc: Scenario = everywhere(7, 5);
  const p = runPath(k, side, sc);
  const rival = SIDES[side].rival;
  eq(
    `the diaspora stays put (${side}): its 5,988 valid votes are the part of the total outside the counties`,
    Math.round(p.totals.valid - p.counties.reduce((t, c) => t + c.valid, 0)),
    5988,
  );
  eq(
    `the diaspora stays put (${side}): its votes for each side`,
    [
      Math.round(p.totals.yours - p.counties.reduce((t, c) => t + c.yours, 0)),
      Math.round(p.totals.rival - p.counties.reduce((t, c) => t + c.rival, 0)),
    ],
    [k.outside[side], k.outside[rival]],
  );
  eq(`only the 47 counties are counted for the bar (${side})`, p.counties.length, 47);
}

// ------------------------------------------------------------- the bars are exact

{
  // Exactly 25% counts; 249 of 1,000 does not.
  const t = toy([
    { valid: 1000, ruto: 250 },
    { valid: 1000, ruto: 249 },
    { valid: 1000, ruto: 251 },
    { valid: 1000, ruto: 0 },
  ]);
  const p = runPath(t, "ruto");
  eq("25.0% counts, 24.9% does not", p.totals.counties, 2);
  eq("never enough counties in a toy country", p.totals.clearsCounties, false);
  eq(
    "24 counties at 25% clear the county bar and 23 do not",
    [24, 23].map(
      (n) =>
        runPath(
          toy(Array.from({ length: 30 }, (_, i) => ({ valid: 1000, ruto: i < n ? 250 : 249 }))),
          "ruto",
        ).totals.clearsCounties,
    ),
    [true, false],
  );
}
{
  // Exactly half of the valid votes is not more than half.
  const tie = runPath(toy([{ valid: 2000, ruto: 1000, raila: 1000 }]), "ruto").totals;
  eq("exactly half: not enough, one vote short", [tie.clearsHalf, tie.toHalf], [false, 1]);
  const over = runPath(toy([{ valid: 2000, ruto: 1001, raila: 999 }]), "ruto").totals;
  eq("one vote over half clears", [over.clearsHalf, over.toHalf], [true, 0]);
  const odd = (yours: number) =>
    runPath(toy([{ valid: 2001, ruto: yours, raila: 2001 - yours }]), "ruto").totals;
  eq(
    "an odd total: 1,000 is short by one, 1,001 clears",
    [odd(1000).toHalf, odd(1001).toHalf],
    [1, 0],
  );
  const rival = runPath(toy([{ valid: 2000, ruto: 600, raila: 1100 }]), "ruto").totals;
  eq("short by more", [rival.toHalf, rival.margin], [401, -500]);
  const counted = (outside: Partial<Outside>) =>
    runPath(toy([{ valid: 1000, ruto: 500, raila: 500 }], outside), "ruto").totals;
  eq(
    "the diaspora's votes count in the total: 501 of 1,002 is exactly half, 502 is not",
    [counted({ valid: 2, ruto: 1, raila: 1 }), counted({ valid: 2, ruto: 2 })].map((t) => [
      t.valid,
      t.yours,
      t.clearsHalf,
    ]),
    [
      [1002, 501, false],
      [1002, 502, true],
    ],
  );
  const won = runPath(
    toy(Array.from({ length: 30 }, () => ({ valid: 1000, ruto: 600 }))),
    "ruto",
  ).totals;
  eq("both bars make a win", [won.clearsHalf, won.clearsCounties, won.won], [true, true, true]);
  const half = runPath(
    toy(Array.from({ length: 30 }, () => ({ valid: 1000, ruto: 500, raila: 500 }))),
    "ruto",
  ).totals;
  eq(
    "the county bar without the half is not a win",
    [half.clearsHalf, half.clearsCounties, half.won],
    [false, true, false],
  );
}

// ------------------------------------------------------------- what five points are worth

for (const [side, region, votes, points] of [
  ["ruto", "mt-kenya-west", 112151, 0.789],
  ["raila", "mt-kenya-west", 112151, 0.789],
  ["raila", "nyanza-luo", 37987, 0.267],
  ["ruto", "nyanza-luo", 77962, 0.549],
  ["ruto", "nairobi", 66968, 0.471],
] as const)
  eq(
    `five points in ${region} for ${side}`,
    [Math.round(worth(k, side, region).votes), r3(worth(k, side, region).points)],
    [votes, points],
  );
eq(
  "ten points is twice five where nothing stops at 100",
  Math.round(worth(k, "ruto", "mt-kenya-west", 10).votes),
  224301,
);

// ------------------------------------------------------------- the turnout lever

{
  const l = turnoutLever(k, "raila")!;
  eq("Azimio's lever is Coast", [l.region, l.name], ["coast", "Coast"]);
  near("Coast's turnout", l.turnout, 1008191 / 1964224, 1e-9);
  near("the national turnout", l.national, 14326751 / 22120458, 1e-9);
  near("Coast brought up to it adds about 260,978 valid votes", l.extra, 260977.5, 0.5);
  near("about 81,439 of them net for Azimio", l.net, 81439.4, 0.5);
  eq(
    "Kenya Kwanza has none: no region below the national turnout leans its way",
    turnoutLever(k, "ruto"),
    null,
  );
  eq(
    "a toy country where the low-turnout county leans to the side",
    turnoutLever(
      toy([
        { registered: 2000, valid: 400, ruto: 300, raila: 100 },
        { region: "b", registered: 1000, valid: 900, ruto: 400, raila: 500 },
      ]),
      "ruto",
    )?.region,
    "a",
  );
}

// ------------------------------------------------------------- near the line

eq(
  "on 2022's map, under 25% by no more than five points, closest first",
  [nearLine(k, "ruto").map((c) => c.name), nearLine(k, "raila").map((c) => c.name)],
  [
    ["Machakos", "Mandera", "Makueni"],
    ["Uasin Gishu", "Meru", "Nyandarua"],
  ],
);
eq(
  "a narrower band",
  [nearLine(k, "ruto", {}, 0.01).map((c) => c.name), nearLine(k, "raila", {}, 0.01).length],
  [["Machakos"], 0],
);
eq(
  "with Azimio down 28 points everywhere",
  nearLine(k, "raila", everywhere(-28)).map((c) => c.name),
  ["Trans Nzoia", "Lamu", "Narok", "Kajiado", "Marsabit"],
);
eq(
  "counties already at or over the line are not listed",
  nearLine(k, "raila").some((c) => c.share >= 0.25),
  false,
);
{
  const t = toy([
    { name: "Zeta", valid: 1000, ruto: 200 },
    { name: "Alpha", valid: 1000, ruto: 200 },
    { name: "Exact", valid: 1000, ruto: 250 },
    { name: "Close", valid: 1000, ruto: 240 },
    { name: "Far", valid: 1000, ruto: 190 },
  ]);
  eq(
    "closest first; a tie by name; exactly 25% and 19% are left out",
    nearLine(t, "ruto").map((c) => c.name),
    ["Close", "Alpha", "Zeta"],
  );
  eq(
    "a six-point band takes in the county exactly six points under, last",
    nearLine(t, "ruto", {}, 0.06).map((c) => c.name),
    ["Close", "Alpha", "Zeta", "Far"],
  );
}
{
  // 25% stays 25% once a turnout move has scaled the votes.
  const t = toy([{ registered: 2000, valid: 1000, ruto: 250 }]);
  eq(
    "25.0% is still at the line after turnout moves",
    [10, 20, 30, 70, -10, -20].map(
      (e) => runPath(t, "ruto", { a: { share: 0, turnout: e } }).totals.counties,
    ),
    [1, 1, 1, 1, 1, 1],
  );
}
{
  const p = runPath(k, "raila", everywhere(-28)).totals;
  eq("and Azimio is one county short of 24", [p.counties, p.clearsCounties], [23, false]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
