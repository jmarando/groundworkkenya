// Checks for Nairobi's calendar days: which day an instant falls on, and the instants that bound a
// run of days. Nairobi is UTC+3 all year.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/nairobi-date.test.ts

import { addDays, dayRange, nairobiDay, nairobiToday } from "@/lib/nairobi-date";

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

eq("23:59 in Nairobi is still the 28th", nairobiDay("2026-10-28T20:59:59Z"), "2026-10-28");
eq("00:00 in Nairobi is the 29th", nairobiDay("2026-10-28T21:00:00Z"), "2026-10-29");
eq("00:30 in Nairobi is the 29th", nairobiDay("2026-10-28T21:30:00Z"), "2026-10-29");
eq("a number of milliseconds works", nairobiDay(Date.parse("2026-10-28T21:00:00Z")), "2026-10-29");
eq("a Date works, across a year end", nairobiDay(new Date("2026-12-31T21:00:00Z")), "2027-01-01");
eq(
  "it agrees with nairobiToday",
  nairobiDay("2026-10-28T21:30:00Z"),
  nairobiToday(new Date("2026-10-28T21:30:00Z")),
);

eq("one day", dayRange("2026-10-29", "2026-10-29"), {
  gte: "2026-10-28T21:00:00.000Z",
  lt: "2026-10-29T21:00:00.000Z",
});
eq("a week, Monday to Sunday", dayRange("2026-10-26", "2026-11-01"), {
  gte: "2026-10-25T21:00:00.000Z",
  lt: "2026-11-01T21:00:00.000Z",
});
eq("a month end", dayRange("2026-10-31", "2026-10-31"), {
  gte: "2026-10-30T21:00:00.000Z",
  lt: "2026-10-31T21:00:00.000Z",
});
eq("a year end", dayRange("2026-12-31", "2026-12-31"), {
  gte: "2026-12-30T21:00:00.000Z",
  lt: "2026-12-31T21:00:00.000Z",
});
eq(
  "the day before is not in the range",
  dayRange("2026-10-29", "2026-10-29").gte > "2026-10-28T20:59:59Z",
  true,
);
eq("addDays carries into the next month", addDays("2026-10-31", 1), "2026-11-01");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
