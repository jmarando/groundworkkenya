// Checks for a campaign's profile of a place as typed: tidied, its lists and
// limits held, an emptied box stored as nothing. Pure. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/area-profile.test.ts

import { cleanProfile, isEmptyProfile, languageNames, settlementName } from "@/lib/area-profile";

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
function refused(name: string, input: Record<string, unknown>, message: string) {
  try {
    cleanProfile(input);
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

eq(
  "a profile as typed, tidied: trimmed, a repeated language once, an emptied box as nothing",
  cleanProfile({
    area: "nairobi/dagoretti-north/kawangware",
    settlement: "informal",
    communities: "  Long-settled families.  ",
    languages: ["sw", "sheng", "sw"],
    institutions: "",
    issues: " Water. ",
  }),
  {
    area: "nairobi/dagoretti-north/kawangware",
    settlement: "informal",
    communities: "Long-settled families.",
    languages: ["sw", "sheng"],
    institutions: null,
    issues: "Water.",
  },
);
eq(
  "no settlement type and no languages",
  cleanProfile({ area: "nairobi", settlement: "", languages: [] }),
  {
    area: "nairobi",
    settlement: null,
    communities: null,
    languages: [],
    institutions: null,
    issues: null,
  },
);
eq(
  "exactly at the limit is fine",
  cleanProfile({ area: "nairobi", communities: "a".repeat(500) }).communities?.length,
  500,
);
refused("a place that isn't a key", { area: "Nairobi!" }, "Which place?");
refused(
  "an unknown settlement type",
  { area: "nairobi", settlement: "posh" },
  "Pick a settlement type from the list.",
);
refused(
  "an unknown language",
  { area: "nairobi", languages: ["klingon"] },
  "Pick languages from the list.",
);
refused(
  "communities over 500",
  { area: "nairobi", communities: "a".repeat(501) },
  "Keep communities to 500 characters.",
);
refused(
  "institutions over 1,000",
  { area: "nairobi", institutions: "a".repeat(1001) },
  "Keep institutions and influencers to 1,000 characters.",
);
refused(
  "issues over 500",
  { area: "nairobi", issues: "a".repeat(501) },
  "Keep local issues to 500 characters.",
);
eq(
  "names for the screen",
  [settlementName("peri-urban"), languageNames(["luo", "kisii"])],
  ["Peri-urban or rural", "Dholuo, Ekegusii"],
);
const blank = {
  area: "x",
  settlement: null,
  communities: null,
  languages: [],
  institutions: null,
  issues: null,
  updatedAt: null,
  updatedBy: null,
};
eq(
  "an empty profile",
  [
    isEmptyProfile(undefined),
    isEmptyProfile(blank),
    isEmptyProfile({ ...blank, languages: ["sw"] }),
  ],
  [true, true, false],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
