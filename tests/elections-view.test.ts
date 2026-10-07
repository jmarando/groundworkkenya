// Checks for the Elections section's rules: the address, the campaign's home
// area, the breadcrumb, and cleaning what the candidate or manager saves.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/elections-view.test.ts

import {
  cleanHome,
  cleanNote,
  cleanSide,
  countyOf,
  crumbsTo,
  defaultRace,
  homeAreaFor,
  nextElectionsSearch,
  validateElectionsSearch,
  type AreaRef,
} from "@/lib/elections-view";

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

function throws(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const AREAS: AreaRef[] = [
  { key: "kenya", level: "country", name: "Kenya", parent: null },
  { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
  { key: "nairobi/westlands", level: "constituency", name: "Westlands", parent: "nairobi" },
  { key: "nairobi/westlands/kangemi", level: "ward", name: "Kangemi", parent: "nairobi/westlands" },
  { key: "nyeri", level: "county", name: "Nyeri", parent: "kenya" },
  { key: "nyeri/mathira", level: "constituency", name: "Mathira", parent: "nyeri" },
];

eq(
  "an address, cleaned",
  validateElectionsSearch({
    area: "nairobi/westlands",
    race: "mp",
    year: "2017",
    shade: "swing",
    other: 1,
  }),
  { area: "nairobi/westlands", race: "mp", year: 2017, shade: "swing" },
);
eq(
  "unknown values are dropped",
  validateElectionsSearch({ area: "Nairobi!", race: "senate", year: "2019", shade: "x" }),
  {},
);
eq(
  "an unknown area is kept for the not-loaded page",
  validateElectionsSearch({ area: "mombasa" }),
  { area: "mombasa" },
);
eq(
  "a change to the address; undefined removes",
  nextElectionsSearch(
    { area: "nairobi", race: "mp", year: 2017 },
    { area: "nairobi/westlands", year: undefined },
  ),
  { area: "nairobi/westlands", race: "mp" },
);
eq(
  "each campaign's own race first",
  [defaultRace("mp"), defaultRace("president"), defaultRace("governor"), defaultRace(undefined)],
  ["mp", "president", "governor", "governor"],
);
eq(
  "the home area the campaign set",
  homeAreaFor({ level: "governor", seat: "Governor · Nairobi" }, "nairobi/westlands", AREAS),
  "nairobi/westlands",
);
eq(
  "a set home the atlas lacks falls back to the seat",
  homeAreaFor({ level: "governor", seat: "Governor · Nairobi" }, "mombasa", AREAS),
  "nairobi",
);
eq(
  "an MP's constituency from the seat",
  homeAreaFor({ level: "mp", seat: "MP · Mathira" }, null, AREAS),
  "nyeri/mathira",
);
eq(
  "a presidential campaign's is Kenya",
  homeAreaFor({ level: "president", seat: "President · Kenya" }, null, AREAS),
  "kenya",
);
eq("an unknown seat", homeAreaFor({ level: "mp", seat: "MP · Lamu East" }, null, AREAS), "kenya");
eq(
  "the breadcrumb",
  crumbsTo(AREAS, "nairobi/westlands/kangemi").map((a) => a.name),
  ["Kenya", "Nairobi", "Westlands", "Kangemi"],
);
eq(
  "the county an area sits in",
  [countyOf("nairobi/westlands/kangemi"), countyOf("nyeri"), countyOf("kenya")],
  ["nairobi", "nyeri", null],
);
eq(
  "a note, trimmed",
  cleanNote({ area: "nairobi/westlands", body: "  Matatu saccos meet on Fridays.  " }),
  {
    area: "nairobi/westlands",
    body: "Matatu saccos meet on Fridays.",
  },
);
throws("an empty note", () => cleanNote({ area: "nairobi", body: "   " }), "Write the note first.");
throws(
  "a long note",
  () => cleanNote({ area: "nairobi", body: "a".repeat(2001) }),
  "Keep a note to 2,000 characters.",
);
throws("a note for no place", () => cleanNote({ area: "Nairobi!", body: "x" }), "Which place?");
eq("clearing a side", cleanSide({ election: "2022-governor", bloc: "  " }), {
  election: "2022-governor",
  bloc: null,
});
throws(
  "a side for an election that never was",
  () => cleanSide({ election: "2019-governor", bloc: "X" }),
  "Which election?",
);
eq("a home area", cleanHome({ area: "nyeri/mathira" }), { area: "nyeri/mathira" });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
