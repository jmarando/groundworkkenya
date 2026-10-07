// Checks for reading the atlas's data files and the checks every figure must
// pass: whole numbers, areas and their parents, seats, blocs, sources, sums
// that add up, and the report. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-files.test.ts

import {
  atlasReport,
  candidateId,
  checkAtlas,
  emptyFiles,
  readTable,
  slugify,
  type TableName,
} from "@/lib/atlas-files";

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

const BASE: Partial<Record<TableName, string>> = {
  sources:
    "id,title,publisher,url,note\niebc-test,Form 37C (test),IEBC,https://example.test/37c,\n",
  areas: [
    "key,level,name,parent,iebc_code",
    "kenya,country,Kenya,,",
    "nairobi,county,Nairobi,kenya,047",
    "nairobi/westlands,constituency,Westlands,nairobi,274",
    "nairobi/kibra,constituency,Kibra,nairobi,278",
    "nairobi/kibra/sarangombe,ward,Sarangombe,nairobi/kibra,",
  ].join("\n"),
  candidates: [
    "election,seat,name,party,bloc",
    "2022-governor,nairobi,Johnson Sakaja,UDA,Kenya Kwanza",
    "2022-governor,nairobi,Polycarp Igathe,Jubilee,Azimio",
  ].join("\n"),
  results: [
    "election,seat,candidate,area,votes,source",
    "2022-governor,nairobi,Johnson Sakaja,nairobi,300,iebc-test",
    "2022-governor,nairobi,Johnson Sakaja,nairobi/westlands,100,iebc-test",
    "2022-governor,nairobi,Johnson Sakaja,nairobi/kibra,200,iebc-test",
    "2022-governor,nairobi,Polycarp Igathe,nairobi/westlands,80,iebc-test",
  ].join("\n"),
  turnout: [
    "election,area,registered,cast_votes,rejected,valid,source",
    "2022-governor,nairobi/westlands,400,190,10,180,iebc-test",
  ].join("\n"),
};
const WARDS = { nairobi: ["sarangombe", "kileleshwa"] };

/** The base files with some tables replaced, read and checked. */
function check(over: Partial<Record<TableName, string>> = {}): string[] {
  const f = emptyFiles();
  const problems: string[] = [];
  for (const [table, text] of Object.entries({ ...BASE, ...over }) as [TableName, string][])
    problems.push(...readTable(table, text, table, f));
  return [...problems, ...checkAtlas(f, WARDS)];
}
const has = (problems: string[], part: string) => problems.some((p) => p.includes(part));
const swap = (table: TableName, from: string, to: string) => ({
  [table]: BASE[table]!.replace(from, to),
});
const DIFF = (n: number) => ({
  differences: `election,seat,candidate,area,difference,note\n2022-governor,nairobi,Johnson Sakaja,nairobi,${n},IEBC's 37C differs from its 37Bs\n`,
});

eq("a clean county passes", check(), []);
eq(
  "a number with a comma is refused",
  has(
    check(swap("results", "nairobi/kibra,200", 'nairobi/kibra,"1,200"')),
    'votes "1,200" is not a whole number',
  ),
  true,
);
eq(
  "a number with a space too",
  has(check(swap("turnout", ",400,", ",4 00,")), 'registered "4 00" is not a whole number'),
  true,
);
eq(
  "a wrong header",
  has(
    check({ sources: "id,title,publisher\nx,y,z" }),
    "the header must be id,title,publisher,url,note",
  ),
  true,
);
eq(
  "constituencies that don't add up to the county",
  has(
    check(swap("results", "nairobi,300", "nairobi,310")),
    "nairobi has 310 but its 2 parts add up to 300",
  ),
  true,
);
eq(
  "a recorded difference passes",
  check({ ...swap("results", "nairobi,300", "nairobi,310"), ...DIFF(10) }),
  [],
);
eq(
  "a different amount still fails",
  has(check({ ...swap("results", "nairobi,300", "nairobi,310"), ...DIFF(9) }), "add up to 300"),
  true,
);
eq(
  "more candidate votes than valid",
  has(
    check(swap("results", "westlands,80", "westlands,90")),
    "the candidates' votes (190) are more than the valid votes (180)",
  ),
  true,
);
eq(
  "cast must be valid plus rejected",
  has(check(swap("turnout", "400,190,10", "400,195,10")), "don't make cast (195)"),
  true,
);
eq(
  "more cast than registered",
  has(
    check(swap("turnout", ",400,190", ",150,190")),
    "more votes cast (190) than registered (150)",
  ),
  true,
);
eq(
  "a ward the map doesn't know",
  has(
    check(
      swap(
        "areas",
        "nairobi/kibra/sarangombe,ward,Sarangombe",
        "nairobi/kibra/laini-saba,ward,Laini Saba",
      ),
    ),
    `the ward "laini-saba" isn't in nairobi's ward map`,
  ),
  true,
);
eq(
  "an area under the wrong parent",
  has(
    check(
      swap(
        "areas",
        "nairobi/kibra,constituency,Kibra,nairobi",
        "nairobi/kibra,constituency,Kibra,kenya",
      ),
    ),
    `"nairobi/kibra" should have the parent "nairobi"`,
  ),
  true,
);
eq(
  "a bare Independent bloc is refused",
  has(
    check(swap("candidates", "Jubilee,Azimio", "Independent,Independent")),
    'as "Independent: Polycarp Igathe"',
  ),
  true,
);
eq(
  "a governor's seat must be a county",
  has(
    check({
      candidates: `${BASE.candidates}\n2022-governor,nairobi/westlands,Somebody Else,ODM,Azimio`,
    }),
    "a governor seat must be a county",
  ),
  true,
);
eq(
  "results outside the seat",
  has(
    check({
      candidates: `${BASE.candidates}\n2022-mp,nairobi/westlands,Tim Wanyonyi,ODM,Azimio`,
      results: `${BASE.results}\n2022-mp,nairobi/westlands,Tim Wanyonyi,nairobi/kibra,5,iebc-test`,
    }),
    'outside the seat "nairobi/westlands"',
  ),
  true,
);
eq(
  "an unknown source",
  has(
    check(swap("results", "kibra,200,iebc-test", "kibra,200,nope")),
    `source "nope" isn't listed`,
  ),
  true,
);
eq(
  "population inside its total",
  has(
    check({
      population:
        "area,year,total,adults,young_adults,source\nnairobi/kibra/sarangombe,2020,100,120,10,iebc-test",
    }),
    "adults must be within the total",
  ),
  true,
);
eq(
  "ids and slugs",
  [slugify("Ann Ng'ang'a"), candidateId("2022-governor", "nairobi", "Johnson Sakaja")],
  ["ann-ng-ang-a", "2022-governor:nairobi:johnson-sakaja"],
);

const files = emptyFiles();
for (const [table, text] of Object.entries(BASE) as [TableName, string][])
  readTable(table, text, table, files);
const report = atlasReport(files);
eq(
  "the report's rows",
  [
    report.includes("| 2022 governor | 2 of 2 | 1 of 2 | yes |"),
    report.includes("| 2013 mp | 0 of 2 | 0 of 2 | n/a |"),
    report.includes("Registered voters by ward: 2013: 0 of 1 · 2017: 0 of 1 · 2022: 0 of 1."),
    report.includes("- `iebc-test`: Form 37C (test), IEBC, https://example.test/37c"),
  ],
  [true, true, true, true],
);

const below = emptyFiles();
for (const [table, text] of Object.entries({
  ...BASE,
  register: "year,area,registered,source\n2022,nairobi/kibra/sarangombe,200,iebc-test",
  population:
    "area,year,total,adults,young_adults,source\nnairobi/kibra/sarangombe,2020,150,100,60,iebc-test",
}) as [TableName, string][])
  readTable(table, text, table, below);
eq(
  "the report names wards whose estimate is below the register",
  atlasReport(below).includes(
    "Population estimate below the 2022 register in 1 of 1 wards: Sarangombe.",
  ),
  true,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
