// Checks for the field checks in words: reasons, the at-the-door line, hours and verdict, and the
// database's rows read with care. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/field-check.test.ts

import { atDoorLine, fieldDays, hoursLine, reasonWords, verdict } from "@/lib/field-check";

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

eq(
  "reasons in words, from an array or the stipend's note",
  [reasonWords(["far", "quick"]), reasonWords("late"), reasonWords("nonsense"), reasonWords(null)],
  [
    "a quarter or more of the doors were recorded far from the house; over half the doors were recorded within 20 seconds of the one before",
    "over half the doors reached Groundwork more than 12 hours after they were said to happen",
    "",
    "",
  ],
);
eq(
  "at the door, out of the doors that could be checked",
  [
    atDoorLine({ doors: 12, atDoor: 9, unchecked: 0 }),
    atDoorLine({ doors: 5, atDoor: 2, unchecked: 1 }),
    atDoorLine({ doors: 3, atDoor: 0, unchecked: 3 }),
  ],
  [
    "9 of 12 at the door (75%)",
    "2 of 4 at the door (50%)",
    "Not checked: these houses have no position on file",
  ],
);
eq(
  "hours in Nairobi time",
  [
    hoursLine({ firstAt: "2026-10-22T05:40:00Z", lastAt: "2026-10-22T10:05:00Z" }),
    hoursLine({ firstAt: "2026-10-22T05:40:00Z", lastAt: "2026-10-22T05:40:00Z" }),
    hoursLine({ firstAt: null, lastAt: null }),
  ],
  ["08:40–13:05", "08:40", "—"],
);
eq(
  "verdicts",
  [verdict({ held: false, reasons: [] }), verdict({ held: true, reasons: ["no_gps"] })],
  [
    { tone: "ok", text: "Looks right." },
    { tone: "check", text: "Check: a quarter or more of the doors had no position." },
  ],
);
eq(
  "rows read with care",
  fieldDays([
    {
      user_id: "u1",
      name: "Wanjiru",
      work_date: "2026-10-22",
      doors: 4,
      at_door: "2",
      near: 0,
      far: 1,
      no_gps: 1,
      unchecked: 0,
      quick: 1,
      late: 0,
      first_at: "2026-10-22T05:40:00Z",
      last_at: null,
      ward: "Kileleshwa",
      held: true,
      reasons: ["far_or_no_gps"],
    },
    { name: "no id" },
    null,
  ]).map((d) => [d.name, d.atDoor, d.held, d.reasons]),
  [["Wanjiru", 2, true, ["far_or_no_gps"]]],
);
eq("not a list", fieldDays({}), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
