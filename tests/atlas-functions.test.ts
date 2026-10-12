// Checks for reading the election atlas and for the candidate's or manager's
// changes to the campaign's home area, sides and notes, against a stand-in
// database. Nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-functions.test.ts

import {
  ATLAS_DENIED,
  loadAtlas,
  removeNote,
  writeHome,
  writeNote,
  writeSide,
} from "@/lib/atlas.functions";

import { fakeSupabase } from "./fake-supabase";

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

async function refuses(name: string, fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const SEED = {
  atlas_areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
  ],
  atlas_candidates: [
    {
      id: "2022-governor:nairobi:sakaja",
      election_id: "2022-governor",
      seat: "nairobi",
      name: "Sakaja",
      party: "UDA",
      bloc: "Kenya Kwanza",
    },
  ],
  atlas_results: [
    {
      candidate_id: "2022-governor:nairobi:sakaja",
      area_key: "nairobi",
      votes: 699392,
      source_id: "star",
    },
  ],
  atlas_turnout: [
    {
      election_id: "2022-president",
      area_key: "nairobi",
      registered: 2416551,
      cast_votes: 1352236,
      rejected: 12869,
      valid: 1339367,
      source_id: "iebc",
    },
  ],
  atlas_register: [{ year: 2022, area_key: "nairobi", registered: 2415310, source_id: "ek" }],
  atlas_population: [
    {
      area_key: "nairobi",
      year: 2020,
      total: 4748124,
      adults: 3231692,
      young_adults: 2059932,
      source_id: "worldpop",
    },
  ],
  atlas_sources: [{ id: "star", title: "A tally", publisher: "The Star", url: null, note: null }],
  atlas_settings: [],
  atlas_sides: [],
  area_notes: [],
};
const as = (role: string) => fakeSupabase(structuredClone(SEED), { my_campaign_role: () => role });

const d = await loadAtlas(as("manager") as never);
eq(
  "the atlas, read into the screen's shape",
  [
    d.areas.length,
    d.candidates[0]?.election,
    d.turnout[0]?.cast,
    d.population[0]?.youngAdults,
    d.homeArea,
    d.sides,
    d.notes,
  ],
  [2, "2022-governor", 1352236, 2059932, null, {}, {}],
);

const sb = as("manager");
await writeHome(sb as never, "nairobi");
await writeSide(sb as never, "2022-governor", "Kenya Kwanza");
await writeNote(sb as never, "nairobi", "Matatu saccos meet on Fridays.");
const after = await loadAtlas(sb as never);
eq(
  "the manager's changes",
  [after.homeArea, after.sides, after.notes["nairobi"]?.body],
  ["nairobi", { "2022-governor": "Kenya Kwanza" }, "Matatu saccos meet on Fridays."],
);
await writeNote(sb as never, "nairobi", "Saccos meet on Thursdays now.");
eq(
  "a note is replaced, not doubled",
  [(await loadAtlas(sb as never)).notes["nairobi"]?.body, sb.tables["area_notes"]?.length],
  ["Saccos meet on Thursdays now.", 1],
);
await writeSide(sb as never, "2022-governor", null);
eq("a side cleared", (await loadAtlas(sb as never)).sides, {});
await removeNote(sb as never, "nairobi");
eq("a note removed", (await loadAtlas(sb as never)).notes, {});
await refuses(
  "an organiser can't pick a side",
  () => writeSide(as("organiser") as never, "2022-governor", "Azimio"),
  ATLAS_DENIED,
);
await refuses(
  "an agent can't write a note",
  () => writeNote(as("agent") as never, "nairobi", "x"),
  ATLAS_DENIED,
);
await refuses(
  "nor set the home area",
  () => writeHome(as("agent") as never, "nairobi"),
  ATLAS_DENIED,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
