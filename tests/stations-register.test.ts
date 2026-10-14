// Checks for reading IEBC's register by polling station (src/lib/stations/register.ts) from
// `pdftotext -tsv`: rows as the PDF lays them out, including the ones whose cells run into
// each other. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/stations-register.test.ts

import {
  checkRegistered,
  registerCentres,
  registerStreams,
  wardSlugFor,
} from "@/lib/stations/register";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}

const HEAD =
  "level\tpage_num\tpar_num\tblock_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

/** A row's words at one height on a page: [left, width, text] each, as pdftotext places them. */
function row(page: number, top: number, words: [number, number, string][]): string[] {
  return words.map(
    ([left, width, text]) =>
      `5\t${page}\t0\t0\t0\t0\t${left}\t${top}\t${width}\t6.78\t100\t${text}`,
  );
}

// The county, constituency and ward columns of a Nairobi row.
const KILELESHWA: [number, number, string][] = [
  [66, 11, "047"],
  [79, 22, "NAIROBI"],
  [104, 15, "CITY"],
  [159, 11, "275"],
  [171, 36, "DAGORETTI"],
  [210, 24, "NORTH"],
  [265, 15, "1374"],
  [279, 42, "KILELESHWA"],
];
const PUMWANI: [number, number, string][] = [
  [66, 11, "047"],
  [79, 22, "NAIROBI"],
  [104, 15, "CITY"],
  [159, 11, "288"],
  [171, 38, "KAMUKUNJI"],
  [265, 15, "1434"],
  [279, 33, "PUMWANI"],
];

const tsv = [
  HEAD,
  // A page's own lines: no stream code, so not a row.
  "1\t654\t0\t0\t0\t0\t0\t0\t792\t612\t-1\t###PAGE###",
  ...row(654, 40, [[200, 120, "REGISTERED"]]),
  // A plain row: the count is the word ending at the count column.
  ...row(654, 101.39, [
    ...KILELESHWA,
    [386, 11, "012"],
    [397, 42, "KILELESHWA"],
    [442, 33, "PRIMARY"],
    [478, 27, "SCHOOL"],
    [528, 46, "047275137401201"],
    [578, 42, "KILELESHWA"],
    [623, 33, "PRIMARY"],
    [659, 27, "SCHOOL"],
    [718.8, 9.69, "700"],
  ]),
  // A long name overflows past the code column; the stream's own name overflows past the count.
  ...row(660, 175.79, [
    ...KILELESHWA,
    [386, 11, "013"],
    [397, 17, "JOMO"],
    [416, 34, "KENYATTA"],
    [452, 40, "UNIVERSITY"],
    [494, 32, "NAIROBI"],
    [507, 22, "CAMPUS"],
    [529, 2, "-"],
    [531.58, 33.8, "KARBASIRAN"],
    [528.82, 45.94, "047275137401301"],
    [567.09, 21.97, "AVENUE"],
    [577.54, 17.07, "JOMO"],
    [597, 34, "KENYATTA"],
    [633, 40, "UNIVERSITY"],
    [675, 32, "NAIROBI"],
    [690, 22, "CAMPUS"],
    [714, 2, "-"],
    [718.8, 9.69, "645"],
    [711.97, 33.8, "KARBASIRAN"],
    [747.48, 21.97, "AVENUE"],
  ]),
  // The centre's last word runs into the code, and the stream's name into the count.
  ...row(701, 227.9, [
    ...PUMWANI,
    [386, 11, "018"],
    [397, 19, "QUARY"],
    [418, 16, "ROAD"],
    [436, 13, "NEW"],
    [451, 26, "GIKOMBA"],
    [479, 22, "MARKET"],
    [503, 72, "COMPLEX047288143401801"],
    [578, 19, "QUARY"],
    [599, 16, "ROAD"],
    [617, 13, "NEW"],
    [631, 26, "GIKOMBA"],
    [659, 22, "MARKET"],
    [683.7, 44.8, "COMPLEX466"],
  ]),
  // A second stream of the same centre.
  ...row(701, 235.34, [
    ...PUMWANI,
    [386, 11, "018"],
    [397, 19, "QUARY"],
    [418, 16, "ROAD"],
    [436, 13, "NEW"],
    [451, 26, "GIKOMBA"],
    [479, 22, "MARKET"],
    [503, 72, "COMPLEX047288143401802"],
    [578, 19, "QUARY"],
    [723, 5.5, "17"],
  ]),
  // A row with no count.
  ...row(701, 242.78, [
    ...PUMWANI,
    [386, 11, "019"],
    [397, 33, "PUMWANI"],
    [528, 46, "047288143401901"],
    [578, 33, "PUMWANI"],
  ]),
  // Another county's row.
  ...row(225, 60, [
    [66, 11, "019"],
    [79, 20, "NYERI"],
    [386, 11, "001"],
    [397, 26, "SAGANA"],
    [528, 46, "019096048600101"],
    [718.8, 9.69, "512"],
  ]),
].join("\n");

const streams = registerStreams(tsv, "047");
eq(
  "the county's streams, in code order",
  streams.map((s) => s.code),
  ["047275137401201", "047275137401301", "047288143401801", "047288143401802", "047288143401901"],
);
eq("a plain row", streams[0], {
  code: "047275137401201",
  registered: 700,
  ward: "KILELESHWA",
  centre: "KILELESHWA PRIMARY SCHOOL",
});
eq(
  "a long name read whole, its count found under the overflow",
  [streams[1]!.centre, streams[1]!.registered],
  ["JOMO KENYATTA UNIVERSITY NAIROBI CAMPUS - KARBASIRAN AVENUE", 645],
);
eq(
  "a code glued to the centre's last word, and a count glued to the stream's name",
  [streams[2]!.centre, streams[2]!.registered],
  ["QUARY ROAD NEW GIKOMBA MARKET COMPLEX", 466],
);
eq("a row with no count", streams[4]!.registered, null);
eq(
  "a constituency's prefix",
  registerStreams(tsv, "019096").map((s) => [s.code, s.registered, s.centre]),
  [["019096048600101", 512, "SAGANA"]],
);

const ours = new Set(["kileleshwa", "pumwani", "mugumo-ini"]);
eq("a ward by its slug", wardSlugFor("KILELESHWA", ours), "kileleshwa");
eq("IEBC's spelling of Mugumo-ini", wardSlugFor("MUGUMU-INI", ours), "mugumo-ini");
eq("a ward that isn't ours", wardSlugFor("ESISE", ours), null);

const { centres, problems } = registerCentres(streams, ours);
eq(
  "centres in IEBC's order, numbered PS-0001 upwards, their streams added up",
  centres.map((c) => [c.code, c.iebcCode, c.ward, c.streams, c.registered]),
  [
    ["PS-0001", "0472751374012", "kileleshwa", 1, 700],
    ["PS-0002", "0472751374013", "kileleshwa", 1, 645],
    ["PS-0003", "0472881434018", "pumwani", 2, 483],
    ["PS-0004", "0472881434019", "pumwani", 1, 0],
  ],
);
eq("the stream with no count is a problem", problems, ["stream 047288143401901 has no count"]);
eq(
  "a ward that isn't ours is a problem, and its centre is left out",
  registerCentres(streams, new Set(["kileleshwa"])).problems,
  [
    "stream 047288143401901 has no count",
    'centre 0472881434018 is in ward "PUMWANI", which isn\'t one of ours',
    'centre 0472881434019 is in ward "PUMWANI", which isn\'t one of ours',
  ],
);
eq(
  "a centre whose streams disagree on its name",
  registerCentres(
    [
      { code: "047275137401201", registered: 1, ward: "KILELESHWA", centre: "A" },
      { code: "047275137401202", registered: 1, ward: "KILELESHWA", centre: "B" },
    ],
    ours,
  ).problems,
  ["centre 0472751374012 has 2 names"],
);

eq(
  "the register's wards against the atlas",
  checkRegistered(
    centres,
    new Map([
      ["kileleshwa", 1345],
      ["pumwani", 500],
      ["mugumo-ini", 10],
    ]),
  ),
  ["ward mugumo-ini has no centres", "ward pumwani: the register has 483, the atlas 500"],
);
eq("wards that add up", checkRegistered(centres, new Map([["kileleshwa", 1345]])), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
