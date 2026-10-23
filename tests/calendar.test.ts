// Checks for the diary's calendar file: timed and all-day entries in Nairobi time, escaping,
// folding long lines, and the subscribe links. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/calendar.test.ts

import { diaryCalendar, feedLinks, fold, icsText } from "@/lib/calendar";

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
  "escapes",
  icsText("Tea; hall, Ngewa\nbring flyers\\"),
  "Tea\\; hall\\, Ngewa\\nbring flyers\\\\",
);
const long = "DESCRIPTION:" + "a".repeat(200);
eq(
  "folds at 75 octets",
  fold(long)
    .split("\r\n")
    .every((l) => new TextEncoder().encode(l).length <= 75),
  true,
);
eq("unfolds back", fold(long).replace(/\r\n /g, ""), long);

const cal = diaryCalendar(
  "Gathoni Wamuchomba",
  [
    {
      id: "e1",
      day: "2026-10-22",
      startsAt: "23:30:00",
      title: "Kameme FM, late show",
      kind: "media",
      note: null,
      wardName: null,
      updatedAt: "2026-10-20T08:00:00Z",
    },
    {
      id: "e2",
      day: "2026-10-23",
      startsAt: null,
      title: "Market day",
      kind: "market",
      note: "Githunguri town",
      wardName: "Githunguri",
      updatedAt: null,
    },
  ],
  new Date("2026-10-20T08:00:00Z"),
);
const lines = cal.split("\r\n");
eq("a calendar", [lines[0], lines.at(-2)], ["BEGIN:VCALENDAR", "END:VCALENDAR"]);
eq("named for the campaign", lines.includes("X-WR-CALNAME:Gathoni Wamuchomba · diary"), true);
eq(
  "a timed entry starts in Nairobi time",
  lines.includes("DTSTART;TZID=Africa/Nairobi:20261022T233000"),
  true,
);
eq(
  "and runs an hour, past midnight",
  lines.includes("DTEND;TZID=Africa/Nairobi:20261023T003000"),
  true,
);
eq(
  "an entry with no time is all day",
  [lines.includes("DTSTART;VALUE=DATE:20261023"), lines.includes("DTEND;VALUE=DATE:20261024")],
  [true, true],
);
eq("its ward is the location", lines.includes("LOCATION:Githunguri"), true);
eq("two events", lines.filter((l) => l === "BEGIN:VEVENT").length, 2);
eq("stable ids", lines.includes("UID:e1@groundwork.ke"), true);

const links = feedLinks("https://githunguri.groundwork.ke/", "ab".repeat(32));
eq(
  "https feed",
  links.https,
  `https://githunguri.groundwork.ke/api/public/calendar/${"ab".repeat(32)}.ics`,
);
eq(
  "webcal for Apple",
  links.webcal.startsWith("webcal://githunguri.groundwork.ke/api/public/calendar/"),
  true,
);
eq(
  "Google adds by URL",
  links.google.startsWith("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F"),
  true,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
