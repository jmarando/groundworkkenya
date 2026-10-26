// Checks for the field plan: the fortnight's days, how a list's day reads, today's lists first,
// the board's cells and each ward's need. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/field-plan.test.ts

import {
  addDays,
  cell,
  dayLabel,
  dayParts,
  forToday,
  fortnight,
  mondayOf,
  nairobiToday,
  overdue,
  unscheduled,
  wardNeeds,
  type PlanList,
  type PlanWard,
} from "@/lib/field-plan";

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
  "a column head's day in two parts, the weekday over the date",
  [dayParts("2026-10-19"), dayParts("2026-11-01")],
  [
    { weekday: "Mon", date: "19 Oct" },
    { weekday: "Sun", date: "1 Nov" },
  ],
);
eq("Monday of a Wednesday", mondayOf("2026-10-21"), "2026-10-19");
eq("Monday of a Sunday", mondayOf("2026-10-25"), "2026-10-19");
eq("a Monday is its own", mondayOf("2026-10-19"), "2026-10-19");
eq(
  "fourteen days",
  [fortnight("2026-10-19").length, fortnight("2026-10-19")[13]],
  [14, "2026-11-01"],
);
eq("across a month", addDays("2026-10-31", 1), "2026-11-01");
eq(
  "Nairobi's today runs three hours ahead",
  nairobiToday(new Date("2026-10-20T22:30:00Z")),
  "2026-10-21",
);

const today = "2026-10-21";
eq("today, morning", dayLabel("2026-10-21", "morning", today), "Today morning");
eq("tomorrow", dayLabel("2026-10-22", "day", today), "Tomorrow");
eq("past", dayLabel("2026-10-19", "day", today), "Was due Mon 19 Oct");
eq("later", dayLabel("2026-10-24", "afternoon", today), "Sat 24 Oct afternoon");
eq("no day", dayLabel(null, null, today), null);

const l = (
  name: string,
  dueOn: string | null,
  shift: PlanList["shift"],
  extra: Partial<PlanList> = {},
): PlanList => ({
  id: name,
  name,
  status: "out",
  wardId: "w",
  wardName: "Ngewa",
  centreName: null,
  givenTo: "a1",
  givenToName: "Wanjiru",
  dueOn,
  shift,
  doors: 50,
  done: 0,
  ...extra,
});
const lists = [
  l("later", "2026-10-24", "day"),
  l("unplanned", null, null),
  l("today pm", today, "afternoon"),
  l("late", "2026-10-19", "day"),
  l("today am", today, "morning"),
];
eq(
  "today first, morning before afternoon, then late, then by day, unplanned last",
  forToday(lists, today).map((x) => x.name),
  ["today am", "today pm", "late", "later", "unplanned"],
);
eq(
  "a cell holds that person's lists that day",
  cell(lists, "a1", today).map((x) => x.name),
  ["today pm", "today am"],
);
eq(
  "not given yet is its own row",
  cell([l("x", today, "day", { givenTo: null })], null, today).length,
  1,
);
eq(
  "unscheduled",
  unscheduled(lists).map((x) => x.name),
  ["unplanned"],
);
eq(
  "overdue with doors left",
  overdue([...lists, l("late but done", "2026-10-19", "day", { done: 50 })], today).map(
    (x) => x.name,
  ),
  ["late"],
);

const w = (name: string, targetVotes: number, doorsPlanned: number): PlanWard => ({
  wardId: name,
  slug: name.toLowerCase(),
  name,
  targetVotes,
  doorsPlanned,
  doorsKnocked: 0,
  spoke: 0,
  supporters: 0,
});
const needs = wardNeeds([w("Githunguri", 10554, 0), w("Ikinu", 6674, 600), w("Nowhere", 0, 0)], {
  people: 5,
  days: 10,
  doorsPerDay: 100,
});
eq(
  "5,000 doors shared by target, less what's planned, in lists of 50",
  needs.map((x) => [x.name, x.goal, x.lists]),
  [
    ["Githunguri", 3063, 62],
    ["Ikinu", 1937, 27],
    ["Nowhere", 0, 0],
  ],
);
eq(
  "no people, no need",
  wardNeeds([w("A", 100, 0)], { people: 0, days: 10, doorsPerDay: 100 })[0]!.lists,
  0,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
