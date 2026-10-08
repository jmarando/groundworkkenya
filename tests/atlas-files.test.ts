// Checks for reading the atlas's data files and the checks every figure must
// pass: whole numbers, areas and their parents, seats, blocs and the coalition
// file, sources, sums that add up, the database's limits, and the report. Pure.
// Run from the repository root:
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
  blocs: [
    "year,party,bloc,source,source_url",
    '2022,UDA,Kenya Kwanza,"The Star, Kenya Kwanza parties sign coalition agreement",https://example.test/kk',
    '2022,Jubilee,Azimio,"Capital FM, 23 parties within Azimio",',
  ].join("\n"),
};
const WARDS = {
  nairobi: new Map([
    ["sarangombe", "kibra"],
    ["kileleshwa", "dagoretti-north"],
  ]),
};

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
    'the bloc should be "Independent: Polycarp Igathe", not "Independent"',
  ),
  true,
);
eq(
  "a candidate stands in the bloc the coalition file gives their party",
  has(
    check(swap("candidates", "Jubilee,Azimio", "Jubilee,Azimio la Umoja")),
    'the bloc should be "Azimio", not "Azimio la Umoja"',
  ),
  true,
);
eq(
  "a party the coalition file doesn't list stands as itself",
  has(
    check({ candidates: `${BASE.candidates}\n2022-governor,nairobi,Ann Other,Safina,Azimio` }),
    'the bloc should be "Safina", not "Azimio"',
  ),
  true,
);
eq(
  "an MP's bloc is the party: coalition partners stood against each other",
  has(
    check({ candidates: `${BASE.candidates}\n2022-mp,nairobi/westlands,Tim Wanyonyi,ODM,Azimio` }),
    'the bloc should be "ODM", not "Azimio"',
  ),
  true,
);
const BLOCS_HEAD = "year,party,bloc,source,source_url";
const blocProblems = check({
  blocs: [
    BLOCS_HEAD,
    '2019,UDA,Kenya Kwanza,"The Star, A report",',
    '2022,UDA,Kenya Kwanza,"The Star, A report",',
    '2022,UDA,Kenya Kwanza,"The Star, A report",',
    "2022,Jubilee,Azimio,A report with no publisher,",
    '2022,ODM,Azimio,"Capital FM, A list",ftp://example.test/list',
    '2022,KANU,,"Capital FM, A list",',
  ].join("\n"),
});
eq(
  "the coalition file's rows",
  [
    has(blocProblems, "blocs: UDA in 2019: the year must be 2013, 2017 or 2022"),
    has(blocProblems, "blocs: UDA in 2022: listed twice"),
    has(blocProblems, 'blocs: Jubilee in 2022: the source must read "Publisher, document title"'),
    has(blocProblems, "blocs: ODM in 2022: the source_url must be an https link"),
    has(blocProblems, "blocs: KANU in 2022: needs a bloc"),
  ],
  [true, true, true, true, true],
);
const LONG = "Abcdefghij Klmnopqrst Uvwxyzabcd Efghijklmn Opqrstuvwx";
eq(
  "the database's limits",
  [
    has(
      check({ areas: `${BASE.areas}\nnairobi/kasarani,constituency,${"K".repeat(81)},nairobi,` }),
      '"nairobi/kasarani": the name must be 2 to 80 characters long, not 81',
    ),
    has(
      check({
        candidates: `${BASE.candidates}\n2022-mp,nairobi/westlands,${LONG},Independent,Independent: ${LONG}`,
      }),
      "the bloc must be 1 to 60 characters long, not 67",
    ),
    has(
      check({ sources: `${BASE.sources}x-long,${"T".repeat(301)},IEBC,,` }),
      'sources: "x-long": the title must be 2 to 300 characters long, not 301',
    ),
    has(
      check(swap("results", "nairobi/kibra,200", "nairobi/kibra,2147483648")),
      'votes "2147483648" is more than the database holds',
    ),
    has(
      check({
        population:
          "area,year,total,adults,young_adults,source\nnairobi/kibra/sarangombe,1999,100,60,10,iebc-test",
      }),
      "the year must be 2000 to 2030",
    ),
    has(
      check({ candidates: `${BASE.candidates}\n2022-governor,nairobi,Ωμέγα,Safina,Safina` }),
      "the name has no letters an id can be made from",
    ),
  ],
  [true, true, true, true, true, true],
);
eq(
  "a recorded difference nothing needs any more",
  has(check(DIFF(10)), "the figures add up now, so remove this difference"),
  true,
);
eq(
  "a recorded difference says why",
  has(
    check({
      ...swap("results", "nairobi,300", "nairobi,310"),
      differences:
        "election,seat,candidate,area,difference,note\n2022-governor,nairobi,Johnson Sakaja,nairobi,10,typo\n",
    }),
    "the note must say why the figures differ",
  ),
  true,
);
eq(
  "a ward under a constituency its map doesn't put it in",
  has(
    check({ areas: `${BASE.areas}\nnairobi/kibra/kileleshwa,ward,Kileleshwa,nairobi/kibra,` }),
    'the ward map puts "kileleshwa" in dagoretti-north, not kibra',
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
    report.includes(
      "- 2022: UDA in Kenya Kwanza. The Star, Kenya Kwanza parties sign coalition agreement, https://example.test/kk",
    ),
    report.includes("- 2022: Jubilee in Azimio. Capital FM, 23 parties within Azimio"),
  ],
  [true, true, true, true, true, true],
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
