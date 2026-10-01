// Checks for the diary's rules: cleaning an entry, the week, the day's plan,
// the watch list and the next stop. Pure; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/diary.test.ts

import { nairobiToday } from "@/lib/demo/insights";
import {
  cleanEntry,
  dayName,
  dayPlan,
  entryFromRow,
  nairobiTime,
  nextStop,
  timeName,
  watchList,
  weekOf,
  type DiaryEntry,
} from "@/lib/diary";

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

function refuses(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const good = {
  day: "2026-10-05",
  startsAt: "9:05",
  title: "  Kayole   water point ",
  kind: "visit",
};
eq("an entry, cleaned", cleanEntry({ ...good, wardId: "w1", note: " Bowsers at noon " }), {
  id: null,
  day: "2026-10-05",
  startsAt: "09:05",
  title: "Kayole water point",
  kind: "visit",
  wardId: "w1",
  note: "Bowsers at noon",
});
eq("no time: all day", cleanEntry({ ...good, startsAt: "" }).startsAt, null);
eq("no ward, no note", [cleanEntry(good).wardId, cleanEntry(good).note], [null, null]);
refuses(
  "a day that doesn't exist",
  () => cleanEntry({ ...good, day: "2026-02-30" }),
  "Pick the day.",
);
refuses(
  "a time that doesn't exist",
  () => cleanEntry({ ...good, startsAt: "24:00" }),
  "Give the time as 10:30, or leave it blank for all day.",
);
refuses(
  "a one-letter title",
  () => cleanEntry({ ...good, title: "K" }),
  "Say where, or what it is.",
);
refuses(
  "a long title",
  () => cleanEntry({ ...good, title: "x".repeat(121) }),
  "Keep the title under 120 characters.",
);
refuses(
  "an unknown kind",
  () => cleanEntry({ ...good, kind: "picnic" }),
  "Pick what kind of entry it is.",
);
refuses(
  "a long note",
  () => cleanEntry({ ...good, note: "x".repeat(301) }),
  "Keep the note under 300 characters.",
);

eq(
  "a Postgres row",
  entryFromRow({
    id: "d1",
    day: "2026-10-05",
    starts_at: "10:30:00",
    title: "Kayole water point",
    kind: "visit",
    ward_id: "w1",
    note: null,
    wards: { name: "Kayole North" },
  }),
  {
    id: "d1",
    day: "2026-10-05",
    startsAt: "10:30",
    title: "Kayole water point",
    kind: "visit",
    wardId: "w1",
    wardName: "Kayole North",
    note: null,
  },
);

eq("the week holding a Wednesday", weekOf("2026-09-30"), [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
]);
eq("a Sunday belongs to the week before it", weekOf("2026-10-04")[0], "2026-09-28");
eq(
  "the year's last week",
  [weekOf("2026-12-31")[0], weekOf("2026-12-31")[6]],
  ["2026-12-28", "2027-01-03"],
);

const entry = (id: string, day: string, startsAt: string | null, kind = "visit"): DiaryEntry => ({
  id,
  day,
  startsAt,
  title: id,
  kind: kind as DiaryEntry["kind"],
  wardId: null,
  wardName: null,
  note: null,
});
const DIARY = [
  entry("rally", "2026-10-05", "15:00", "rally"),
  entry("church", "2026-10-05", null, "church"),
  entry("market", "2026-10-05", "10:30", "market"),
  entry("watch-today", "2026-10-05", "12:00", "watch"),
  entry("watch-later", "2026-10-07", null, "watch"),
  entry("watch-too-far", "2026-10-08", null, "watch"),
  entry("tomorrow", "2026-10-06", "09:00"),
];
eq(
  "the day's plan: all-day first, then by time, nothing to watch",
  dayPlan(DIARY, "2026-10-05").map((e) => e.id),
  ["church", "market", "rally"],
);
eq(
  "the watch list: today and the next two days",
  watchList(DIARY, "2026-10-05").map((e) => e.id),
  ["watch-today", "watch-later"],
);
eq("the next stop", nextStop(DIARY, "2026-10-05", "11:00")?.id, "rally");
eq("nothing left today", nextStop(DIARY, "2026-10-05", "16:00"), null);

eq("a day's name", dayName("2026-10-05"), "Mon 5 Oct");
eq(
  "times",
  [timeName(entry("a", "2026-10-05", "10:30")), timeName(entry("b", "2026-10-05", null))],
  ["10:30", "All day"],
);
// After 21:00 UTC it is already tomorrow in Nairobi.
const late = new Date(Date.UTC(2026, 8, 29, 22, 30));
eq(
  "a late entry lands on Nairobi's day",
  [nairobiToday(late), nairobiTime(late)],
  ["2026-09-30", "01:30"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
