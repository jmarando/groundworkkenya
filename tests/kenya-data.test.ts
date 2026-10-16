// Checks for the 2022 county data behind Path to State House: the rows add up
// to IEBC's declared totals, every county is in one region, and a bad file is
// refused with every problem named. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/kenya-data.test.ts

import { readFileSync } from "node:fs";

import { parseCSV } from "@/lib/csv";
import { parseKenya } from "@/lib/kenya";

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

const regionsCsv = readFileSync("data/kenya/regions.csv", "utf8");
const countiesCsv = readFileSync("data/kenya/counties.csv", "utf8");
const k = parseKenya(regionsCsv, countiesCsv);
const sum = (f: (c: (typeof k.counties)[number]) => number) =>
  k.counties.reduce((t, c) => t + f(c), 0);

/** What parsing `counties` (default: the real file) says, or "" when it is accepted. */
function refusal(counties: string, regions = regionsCsv): string {
  try {
    parseKenya(regions, counties);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

// ------------------------------------------------------------- the shape

eq(
  "47 counties, in IEBC's order",
  k.counties.map((c) => c.code),
  [...Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(3, "0"))],
);
eq(
  "13 regions, in the research pack's order",
  k.regions.map((r) => r.id),
  [
    "nairobi",
    "mt-kenya-west",
    "mt-kenya-east",
    "ukambani",
    "coast",
    "north-eastern",
    "northern",
    "rift-kalenjin",
    "rift-cosmopolitan",
    "maa-lands",
    "nyanza-luo",
    "gusii",
    "western",
  ],
);
eq(
  "how many counties each region holds",
  Object.fromEntries(
    k.regions.map((r) => [r.id, k.counties.filter((c) => c.region === r.id).length]),
  ),
  {
    nairobi: 1,
    "mt-kenya-west": 6,
    "mt-kenya-east": 3,
    ukambani: 3,
    coast: 6,
    "north-eastern": 3,
    northern: 4,
    "rift-kalenjin": 7,
    "rift-cosmopolitan": 2,
    "maa-lands": 2,
    "nyanza-luo": 4,
    gusii: 2,
    western: 4,
  },
);
eq(
  "the counties of a few regions",
  ["mt-kenya-west", "ukambani", "gusii"].map((id) =>
    k.counties.filter((c) => c.region === id).map((c) => c.name),
  ),
  [
    ["Nyandarua", "Nyeri", "Kirinyaga", "Murang'a", "Kiambu", "Laikipia"],
    ["Kitui", "Machakos", "Makueni"],
    ["Kisii", "Nyamira"],
  ],
);

// ------------------------------------------------------------- the numbers

eq("the diaspora is kept apart from the counties", k.outside, {
  registered: 10443,
  valid: 5988,
  rejected: 44,
  raila: 3727,
  ruto: 2190,
});
eq(
  "the rows add up to IEBC's declared 2022 totals",
  {
    valid: sum((c) => c.valid) + k.outside.valid,
    raila: sum((c) => c.raila) + k.outside.raila,
    ruto: sum((c) => c.ruto) + k.outside.ruto,
    registered: sum((c) => c.registered) + k.outside.registered,
    rejected: sum((c) => c.rejected) + k.outside.rejected,
  },
  {
    valid: 14213137,
    raila: 6942930,
    ruto: 7176141,
    registered: 22120458,
    rejected: 113614,
  },
);

// The repository's own national figures (data/atlas/kenya) say the same.
{
  const rows = (file: string) => {
    const [head = [], ...body] = parseCSV(readFileSync(file, "utf8"));
    return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  };
  const votes = (candidate: string) =>
    Number(
      rows("data/atlas/kenya/results.csv").find(
        (r) => r["election"] === "2022-president" && r["candidate"] === candidate,
      )?.["votes"],
    );
  const t = rows("data/atlas/kenya/turnout.csv").find((r) => r["election"] === "2022-president");
  eq(
    "the atlas's national 2022 figures agree",
    {
      raila: votes("Raila Odinga"),
      ruto: votes("William Ruto"),
      registered: Number(t?.["registered"]),
      cast: Number(t?.["cast_votes"]),
      rejected: Number(t?.["rejected"]),
      valid: Number(t?.["valid"]),
    },
    {
      raila: sum((c) => c.raila) + k.outside.raila,
      ruto: sum((c) => c.ruto) + k.outside.ruto,
      registered: sum((c) => c.registered) + k.outside.registered,
      cast: sum((c) => c.valid + c.rejected) + k.outside.valid + k.outside.rejected,
      rejected: sum((c) => c.rejected) + k.outside.rejected,
      valid: sum((c) => c.valid) + k.outside.valid,
    },
  );
}

eq(
  "Ruto is at 25% or more in 39 counties and Raila in 34",
  [
    k.counties.filter((c) => c.ruto * 4 >= c.valid).length,
    k.counties.filter((c) => c.raila * 4 >= c.valid).length,
  ],
  [39, 34],
);
eq(
  "no county has more candidate votes than valid, or more cast than registered",
  k.counties
    .filter(
      (c) =>
        c.raila + c.ruto > c.valid ||
        c.valid + c.rejected > c.registered ||
        c.uhuru2017 + c.raila2017 > c.valid2017,
    )
    .map((c) => c.name),
  [],
);

// ------------------------------------------------------------- the names

{
  const names = k.counties.map((c) => c.name);
  eq(
    "one spelling for each county",
    [
      "Tharaka-Nithi",
      "Murang'a",
      "Elgeyo-Marakwet",
      "Nairobi",
      "Taita Taveta",
      "Trans Nzoia",
      "Homa Bay",
    ].map((n) => names.includes(n)),
    [true, true, true, true, true, true, true],
  );
  eq(
    "the other spellings are gone",
    ["Nairobi City", "Tharaka - Nithi", "Murang'A", "Elgeyo/Marakwet"].map((n) =>
      names.includes(n),
    ),
    [false, false, false, false],
  );
}

// ------------------------------------------------------------- a bad file

{
  const lines = countiesCsv.trimEnd().split("\n");
  const without = (name: string) => lines.filter((l) => !l.includes(`,${name},`)).join("\n");

  eq("the real file is accepted", refusal(countiesCsv), "");
  eq("46 counties is refused", refusal(without("Lamu")).includes("47 counties, found 46"), true);
  eq(
    "a county in a region that does not exist is named with the region",
    refusal(countiesCsv.replace(",coast,", ",seaside,")).includes(
      `Mombasa: region "seaside" is not in regions.csv`,
    ),
    true,
  );
  eq(
    "a number that is not whole is named with the county and column",
    refusal(countiesCsv.replace(",277301,", ",-5,")).includes(
      "Mombasa: valid is not a whole number (-5)",
    ),
    true,
  );
  eq(
    "a missing column is named",
    refusal(countiesCsv.replace("ruto,", "")).includes(`has no column "ruto"`),
    true,
  );
  eq(
    "a region with no counties is named",
    refusal(countiesCsv.replaceAll(",gusii,", ",western,")).includes(
      `region "Gusii" has no counties`,
    ),
    true,
  );
  const both = refusal(countiesCsv.replace(",coast,", ",seaside,").replace(",277301,", ",-5,"));
  eq(
    "every problem is named, not only the first",
    [both.includes("seaside"), both.includes("not a whole number")],
    [true, true],
  );
  eq(
    "Raila and Ruto may not have more votes than were valid",
    refusal(countiesCsv.replace(",277301,3812,161015,", ",277301,3812,261015,")).includes(
      "Mombasa: Raila and Ruto have more votes than were valid",
    ),
    true,
  );
  eq(
    "but they may have all of them",
    refusal(countiesCsv.replace(",161015,113700,", ",163601,113700,")),
    "",
  );
  eq(
    "more cast than registered is refused",
    refusal(countiesCsv.replace(",642362,277301,", ",200000,277301,")).includes(
      "Mombasa: more votes were cast than people registered",
    ),
    true,
  );
  eq(
    "but everyone registered may have voted",
    refusal(countiesCsv.replace(",642362,277301,3812,", ",642362,277301,365061,")),
    "",
  );
  eq(
    "2017: more than were valid is refused",
    refusal(countiesCsv.replace(",99508,238943,342026", ",199508,238943,342026")).includes(
      "Mombasa: Uhuru and Raila have more votes than were valid in 2017",
    ),
    true,
  );
  eq(
    "2017: Uhuru and Raila may have all of the valid votes",
    refusal(countiesCsv.replace(",99508,238943,342026", ",99508,238943,338451")),
    "",
  );
  eq(
    "a number with a decimal point is refused",
    refusal(countiesCsv.replace(",277301,", ",277301.5,")).includes(
      "Mombasa: valid is not a whole number (277301.5)",
    ),
    true,
  );
  eq(
    "stray spaces around a cell are ignored",
    refusal(countiesCsv.replace(",277301,", ", 277301 ,").replace(",coast,", ", coast ,")),
    "",
  );
  eq(
    "48 counties is refused",
    refusal(`${countiesCsv.trimEnd()}\n048,Extra,coast,1,1,0,0,0,0,0,1\n`).includes(
      "47 counties, found 48",
    ),
    true,
  );
  eq(
    "no diaspora row is refused",
    refusal(lines.filter((l) => !l.startsWith("DIA,")).join("\n")).includes(
      "expected one diaspora row (a blank region), found 0",
    ),
    true,
  );
  eq(
    "two diaspora rows are refused",
    refusal(`${countiesCsv.trimEnd()}\nDIA,Diaspora,,1,1,0,0,0,,,\n`).includes("found 2"),
    true,
  );
  eq(
    "a region listed twice is refused",
    refusal(countiesCsv, `${regionsCsv.trimEnd()}\ncoast,Coast again,\n`).includes(
      `regions.csv: "coast" is listed twice`,
    ),
    true,
  );
  eq(
    "a diaspora number that is not whole is named",
    refusal(countiesCsv.replace("DIA,Diaspora,,10443,", "DIA,Diaspora,,ten,")).includes(
      "Diaspora: registered is not a whole number (ten)",
    ),
    true,
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
