// Checks for the Path to State House readings: the sentences that say where
// the path stands, with every number in them one of the line's figures. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/path-lines.test.ts

import { readFileSync } from "node:fs";

import { unaccounted } from "@/lib/findings/core";
import { parseKenya, type County, type Kenya } from "@/lib/kenya";
import { pathLines, sharePercent } from "@/lib/path-lines";
import type { Scenario, Side } from "@/lib/path";

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

const k = parseKenya(
  readFileSync("data/kenya/regions.csv", "utf8"),
  readFileSync("data/kenya/counties.csv", "utf8"),
);
const everywhere = (share: number): Scenario =>
  Object.fromEntries(k.regions.map((g) => [g.id, { share, turnout: 0 }]));

/** Made-up counties in one region: 2000 registered, 1000 valid unless said. */
function toy(counties: Partial<County>[]): Kenya {
  return {
    regions: [{ id: "a", name: "A", note: "" }],
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
    outside: { registered: 0, valid: 0, rejected: 0, raila: 0, ruto: 0 },
  };
}

const line = (kk: Kenya, side: Side, sc: Scenario, id: string) =>
  pathLines(kk, side, sc).find((l) => l.id === id)?.line;

// ------------------------------------------------------------- how a share is printed

eq("one decimal", [0.504895, 6942930 / 14213137, 0.25, 0].map(sharePercent), [
  "50.5%",
  "48.8%",
  "25.0%",
  "0.0%",
]);
eq("exactly half is 50.0%", sharePercent(0.5), "50.0%");
eq("a share just under half never prints as 50.0%", [0.49996, 0.4997, 0.4951].map(sharePercent), [
  "49.996%",
  "49.97%",
  "49.5%",
]);
eq("and one just over half does not either", [0.50004, 0.5003, 0.5051].map(sharePercent), [
  "50.004%",
  "50.03%",
  "50.5%",
]);

// ------------------------------------------------------------- where the path stands

eq(
  "Kenya Kwanza on 2022's map",
  line(k, "ruto", {}, "standing"),
  "On 2022's map your side has 50.5% of valid votes and 25% or more in 39 of 47 counties. Both bars are cleared.",
);
eq(
  "Azimio on 2022's map",
  line(k, "raila", {}, "standing"),
  "On 2022's map your side has 48.8% of valid votes and 25% or more in 34 of 47 counties. It is 163,639 votes short of more than half.",
);
eq(
  "a move of zero is still 2022's map",
  line(k, "raila", everywhere(0), "standing")?.startsWith("On 2022's map"),
  true,
);
eq(
  "after a change, short of half",
  line(k, "raila", { western: { share: 10, turnout: 0 } }, "standing"),
  "With your changes your side has 49.8% of valid votes and 25% or more in 34 of 47 counties. It is 26,646 votes short of more than half.",
);
eq(
  "after a change, both bars cleared",
  line(k, "ruto", { western: { share: 10, turnout: 0 } }, "standing"),
  "With your changes your side has 51.5% of valid votes and 25% or more in 40 of 47 counties. Both bars are cleared.",
);
eq(
  "short of half and of counties",
  line(k, "raila", everywhere(-28), "standing"),
  "With your changes your side has 24.7% of valid votes and 25% or more in 23 of 47 counties. It is 3,593,151 votes short of more than half and needs 1 more county at 25%.",
);
{
  // Half the votes, but only 20 counties at 25%: 4 short.
  const t = toy([
    ...Array.from({ length: 20 }, () => ({ valid: 1000, ruto: 999 })),
    ...Array.from({ length: 10 }, () => ({ valid: 1000, ruto: 0 })),
  ]);
  eq(
    "half cleared, counties not",
    line(t, "ruto", {}, "standing"),
    "On 2022's map your side has 66.6% of valid votes and 25% or more in 20 of 47 counties. It needs 4 more counties at 25%.",
  );
  const one = toy([{ valid: 2001, ruto: 1000 }]);
  eq(
    "one vote short, many counties short",
    line(one, "ruto", {}, "standing"),
    "On 2022's map your side has 49.98% of valid votes and 25% or more in 1 of 47 counties. It is 1 vote short of more than half and needs 23 more counties at 25%.",
  );
}

// ------------------------------------------------------------- the biggest region

for (const side of ["ruto", "raila"] as const)
  eq(
    `the biggest region (${side})`,
    line(k, side, {}, "biggest"),
    "Mt Kenya West is the biggest region, 16% of valid votes. Five points of your side's share there is worth about 112,000 votes, 0.8 points nationally.",
  );
eq(
  "it is worked out on 2022's map, whatever has been changed",
  line(k, "ruto", { "mt-kenya-west": { share: 15, turnout: 0 } }, "biggest"),
  line(k, "ruto", {}, "biggest"),
);

// ------------------------------------------------------------- the turnout lever

eq(
  "Azimio's turnout lever",
  line(k, "raila", {}, "turnout"),
  "Coast turned out at 51% in 2022 against 65% nationally. Lifting it to the national level would add about 261,000 votes, about 81,000 net for your side.",
);
eq("Kenya Kwanza has no turnout line", line(k, "ruto", {}, "turnout"), undefined);

// ------------------------------------------------------------- the county bar

eq(
  "the nearest counties under the 25% line, when the county bar is missed",
  line(k, "raila", everywhere(-28), "counties"),
  "The nearest counties under the 25% line for your side: Trans Nzoia, Lamu, Narok and Kajiado.",
);
eq(
  "no county line when the bar is cleared",
  [line(k, "ruto", {}, "counties"), line(k, "raila", {}, "counties")],
  [undefined, undefined],
);
{
  // Missed, but nothing within five points of the line.
  const t = toy([
    ...Array.from({ length: 5 }, () => ({ valid: 1000, ruto: 900 })),
    ...Array.from({ length: 5 }, () => ({ valid: 1000, ruto: 100 })),
  ]);
  eq("no county line when no county is near", line(t, "ruto", {}, "counties"), undefined);
}

{
  const near = (...ruto: number[]) =>
    line(toy(ruto.map((r) => ({ valid: 1000, ruto: r }))), "ruto", {}, "counties");
  eq(
    "one county, two counties, three counties named",
    [near(240), near(240, 230), near(240, 230, 220)],
    [
      "The nearest counties under the 25% line for your side: C1.",
      "The nearest counties under the 25% line for your side: C1 and C2.",
      "The nearest counties under the 25% line for your side: C1, C2 and C3.",
    ],
  );
}

// ------------------------------------------------------------- which lines, in which order

eq(
  "the lines, in order",
  [
    pathLines(k, "ruto").map((l) => l.id),
    pathLines(k, "raila").map((l) => l.id),
    pathLines(k, "raila", everywhere(-28)).map((l) => l.id),
  ],
  [
    ["standing", "biggest"],
    ["standing", "biggest", "turnout"],
    ["standing", "biggest", "turnout", "counties"],
  ],
);

// ------------------------------------------------------------- every number is a figure

{
  const all = [
    ...pathLines(k, "ruto"),
    ...pathLines(k, "raila"),
    ...pathLines(k, "ruto", { western: { share: 10, turnout: 0 } }),
    ...pathLines(k, "raila", { western: { share: 10, turnout: 0 } }),
    ...pathLines(k, "raila", everywhere(-28)),
    ...pathLines(k, "ruto", { nairobi: { share: -5, turnout: 6 } }),
    ...pathLines(toy([{ valid: 2001, ruto: 1000 }]), "ruto"),
    ...pathLines(
      toy([
        { valid: 1000, ruto: 999 },
        { valid: 1000, ruto: 0 },
      ]),
      "ruto",
    ),
  ];
  eq("there are lines to check", all.length > 15, true);
  eq(
    "every number in every line is a figure",
    all.map((l) => unaccounted(l)).filter((u) => u.length),
    [],
  );
  eq(
    "every figure appears in its line",
    all.flatMap((l) =>
      l.figures.filter((f) => !l.line.includes(f.text)).map((f) => `${l.id}: ${f.text}`),
    ),
    [],
  );
  eq(
    "every figure says what it is, where it came from and when",
    all.flatMap((l) =>
      l.figures
        .filter(
          (f) =>
            !f.label ||
            !f.source ||
            !f.period ||
            typeof f.value !== "number" ||
            !Number.isFinite(f.value),
        )
        .map((f) => `${l.id}: ${f.text}`),
    ),
    [],
  );
  eq(
    "figures from the declared result cite IEBC; those from the user's changes say so",
    [
      pathLines(k, "ruto")[0]!.figures.find((f) => f.text === "50.5%")?.source,
      pathLines(k, "ruto", { western: { share: 10, turnout: 0 } })[0]!.figures.find(
        (f) => f.text === "51.5%",
      )?.source,
      pathLines(k, "ruto")[0]!.figures.find((f) => f.text === "47")?.source,
      pathLines(k, "ruto")[0]!.figures.find((f) => f.text === "25%")?.source,
    ],
    [
      "IEBC Form 34C, 2022 president, county rows",
      "Your changes on the 2022 map",
      "Constitution, First Schedule",
      "Constitution, Article 138",
    ],
  );
  eq(
    "the year is a figure only where the line says it",
    [
      pathLines(k, "ruto")[0]!.figures.some((f) => f.text === "2022"),
      pathLines(k, "ruto", { western: { share: 10, turnout: 0 } })[0]!.figures.some(
        (f) => f.text === "2022",
      ),
      pathLines(k, "raila")[2]!.figures.some((f) => f.text === "2022"),
    ],
    [true, false, true],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
