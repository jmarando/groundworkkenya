// Checks for the dates behind /guides/2027-election-dates: every date is a real day whose weekday is
// the one IEBC printed beside it, the list runs in order, the dates that follow from the law (six months
// before polling, 48 hours before, sixty days before) land where IEBC put them, and each entry says where
// it is printed. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/election-dates.test.ts

import {
  DATES,
  DIFFERENCES,
  POLLING_DAY,
  SEATS,
  dayOf,
  formatDay,
  weekdayOf,
} from "@/lib/election-dates";

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

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const real = (iso: string) =>
  ISO.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);

// Polling day is the second Tuesday of August, the day Article 101(1) of the Constitution names.
const polling = new Date(`${POLLING_DAY}T00:00:00Z`);
eq("polling day is a Tuesday", weekdayOf(POLLING_DAY), "Tuesday");
eq(
  "polling day is the second Tuesday in August",
  [polling.getUTCMonth() + 1, Math.ceil(polling.getUTCDate() / 7)],
  [8, 2],
);

// Every entry: a real day, the printed weekday (where IEBC printed one), a source and a place in it.
let last = "";
for (const d of DATES) {
  const label = `${d.on} ${d.what.slice(0, 40)}`;
  eq(`${label}: a real day`, real(d.on), true);
  if (d.printed !== null) eq(`${label}: IEBC's weekday`, weekdayOf(d.on), d.printed);
  eq(`${label}: in order`, d.on >= last, true);
  last = d.on;
  eq(
    `${label}: names where it is printed`,
    d.ref.length > 0 && (d.from.url ?? "").startsWith("https://"),
    true,
  );
}

// The same day is never listed twice for the same people and the same thing.
const keys = DATES.map((d) => `${d.on}|${d.who}|${d.what}`);
eq("no entry twice", new Set(keys).size, keys.length);

// What follows from the law, against what IEBC printed.
const on = (iso: string, text: RegExp) => DATES.find((d) => d.on === iso && text.test(d.what));
eq(
  "public officers resign six months before polling",
  dayOf(POLLING_DAY, { months: -6 }),
  "2027-02-10",
);
eq("the entry for it", Boolean(on("2027-02-10", /resign/i)), true);
eq(
  "the campaign period ends 48 hours before polling",
  dayOf(POLLING_DAY, { days: -3 }),
  "2027-08-07",
);
eq("the entry for it", Boolean(on("2027-08-07", /campaign period ends/i)), true);
eq("registration stops sixty days before polling", dayOf(POLLING_DAY, { days: -60 }), "2027-06-11");
eq("the entry for it", Boolean(on("2027-06-11", /registered|register/i)), true);
eq(
  "the harambee date is the day before eight months before polling",
  dayOf(POLLING_DAY, { months: -8, days: -1 }),
  "2026-12-09",
);
eq("the entry for it", Boolean(on("2026-12-09", /harambee/i)), true);
eq("polling day is listed", Boolean(on(POLLING_DAY, /polling day/i)), true);

// The seats: IEBC's six notices, one row each.
eq(
  "the six seats",
  SEATS.map((s) => s.seat),
  [
    "President",
    "National Assembly",
    "Senate",
    "County Governor",
    "County Woman Representative",
    "County Assembly Ward",
  ],
);
for (const s of SEATS) {
  eq(`${s.seat}: nomination days run forwards`, s.nominationFrom <= s.nominationTo, true);
  eq(
    `${s.seat}: IEBC's weekdays`,
    [weekdayOf(s.nominationFrom), weekdayOf(s.nominationTo), weekdayOf(s.campaignFrom)],
    s.printed,
  );
  eq(`${s.seat}: the campaign starts when nominations open`, s.campaignFrom, s.nominationFrom);
  eq(
    `${s.seat}: nominations close before the disputes cut-off`,
    s.nominationTo <= "2027-06-12",
    true,
  );
}

// Where IEBC's own documents differ, both are kept and each has a source.
eq("differences are recorded", DIFFERENCES.length >= 2, true);
for (const d of DIFFERENCES) {
  eq(
    `${d.title}: two readings, each sourced`,
    d.readings.length >= 2 && d.readings.every((r) => (r.from.url ?? "").startsWith("https://")),
    true,
  );
}

// The way a day is written on the page.
eq("a day in words", formatDay("2027-08-10"), "Tuesday 10 August 2027");
eq("a day in words, single digit", formatDay("2026-10-15"), "Thursday 15 October 2026");
eq("a day without its weekday", formatDay("2027-02-10", false), "10 February 2027");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
