// Checks for the diary as a calendar: blocks for entries and crowd suggestions, how long
// each runs, the hours shown, what a drop means, Nairobi's clock, and the days read.
// Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/diary-calendar.test.ts

import type { CrowdEvent } from "@/lib/crowd-events";
import type { DiaryEntry } from "@/lib/diary";
import {
  cleanRange,
  crowdEvents,
  dropTarget,
  entryEvents,
  nairobiNow,
  shownDays,
  slotBounds,
  startView,
  stepNames,
  whenName,
} from "@/lib/diary-calendar";

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

const entry = (
  id: string,
  day: string,
  startsAt: string | null,
  kind: DiaryEntry["kind"],
  wardName: string | null = null,
): DiaryEntry => ({
  id,
  day,
  startsAt,
  title: id,
  kind,
  wardId: wardName ? `w-${wardName}` : null,
  wardName,
  note: null,
});

const crowd = (
  id: string,
  day: string,
  startsAt: string | null,
  status: CrowdEvent["status"] = "new",
): CrowdEvent => ({
  id,
  kind: "community",
  title: `Event ${id}`,
  day,
  startsAt,
  place: "Moffel Hotel",
  wardId: null,
  wardName: null,
  crowd: null,
  why: null,
  url: "https://example.org/e",
  sourceName: null,
  status,
  diaryEntryId: null,
});

// Blocks for entries.
{
  const blocks = entryEvents(
    [
      entry("chama", "2026-11-21", "10:00", "meeting", "Municipality"),
      entry("market", "2026-11-21", "15:00", "market", "Municipality"),
      entry("church", "2026-11-22", "10:00", "church", "Nkuene"),
      entry("review", "2026-11-22", "11:00", "meeting"),
      entry("watch", "2026-11-23", null, "watch"),
    ],
    true,
  );
  eq(
    "a timed entry runs for its kind's length; an untimed one is all day",
    blocks.map((b) => [b.id, b.start, b.end ?? null, b.allDay]),
    [
      ["chama", "2026-11-21T10:00:00", "2026-11-21T11:00:00", false],
      ["market", "2026-11-21T15:00:00", "2026-11-21T17:00:00", false],
      ["church", "2026-11-22T10:00:00", "2026-11-22T11:00:00", false],
      ["review", "2026-11-22T11:00:00", "2026-11-22T12:00:00", false],
      ["watch", "2026-11-23", null, true],
    ],
  );
  eq("each block says what it is, so the panel can open it", blocks[0]!.extendedProps, {
    type: "entry",
    id: "chama",
    kind: "meeting",
    ward: "Municipality",
  });
  eq("coloured by kind", blocks[1]!.classNames, ["cal-ev", "cal-ev--market"]);
  eq(
    "only those who can change the diary can drag",
    [
      blocks[0]!.startEditable,
      entryEvents([entry("x", "2026-11-21", "10:00", "visit")], false)[0]!.startEditable,
    ],
    [true, false],
  );
}
{
  const [first, second] = entryEvents(
    [entry("a", "2026-11-24", "08:00", "funeral"), entry("b", "2026-11-24", "08:10", "visit")],
    true,
  );
  eq("never shorter than half an hour", first!.end, "2026-11-24T08:30:00");
  eq("the last of the day keeps its full length", second!.end, "2026-11-24T09:40:00");
  const [late] = entryEvents([entry("late", "2026-11-24", "23:00", "rally")], true);
  eq("past midnight runs into the next day", late!.end, "2026-11-25T01:00:00");
  const same = entryEvents(
    [entry("p", "2026-11-24", "09:00", "meeting"), entry("q", "2026-11-24", "09:00", "media")],
    true,
  );
  eq(
    "two at the same time both keep their length, side by side",
    same.map((b) => b.end),
    ["2026-11-24T10:00:00", "2026-11-24T10:00:00"],
  );
}

// Crowd suggestions.
{
  const blocks = crowdEvents([
    crowd("c1", "2026-11-21", "12:00"),
    crowd("c2", "2026-11-25", null),
    crowd("c3", "2026-11-26", "09:00", "added"),
    crowd("c4", "2026-11-27", "09:00", "dismissed"),
  ]);
  eq(
    "only events nobody has decided on, timed ones for two hours",
    blocks.map((b) => [b.id, b.start, b.end ?? null, b.allDay]),
    [
      ["crowd:c1", "2026-11-21T12:00:00", "2026-11-21T14:00:00", false],
      ["crowd:c2", "2026-11-25", null, true],
    ],
  );
  eq(
    "a suggestion is dashed, cannot be dragged, and knows its event",
    [blocks[0]!.classNames, blocks[0]!.startEditable, blocks[0]!.extendedProps],
    [
      ["cal-ev", "cal-ev--crowd"],
      false,
      { type: "crowd", id: "c1", kind: "community", place: "Moffel Hotel" },
    ],
  );
}

// The hours shown.
{
  eq("06:00 to 21:00 by default", slotBounds([]), { min: "06:00:00", max: "21:00:00" });
  eq(
    "widened to the hour around an early start and a late end",
    slotBounds(
      entryEvents(
        [
          entry("early", "2026-11-24", "05:30", "market"),
          entry("late", "2026-11-24", "21:00", "meeting"),
        ],
        true,
      ),
    ),
    { min: "05:00:00", max: "22:00:00" },
  );
  eq(
    "a block past midnight shows the day to its end",
    slotBounds(entryEvents([entry("late", "2026-11-24", "23:00", "rally")], true)),
    { min: "06:00:00", max: "24:00:00" },
  );
  eq(
    "all-day entries change nothing",
    slotBounds(entryEvents([entry("w", "2026-11-24", null, "watch")], true)),
    { min: "06:00:00", max: "21:00:00" },
  );
}

// Drops, Nairobi's clock and the days on screen.
{
  const landed = new Date("2026-11-21T12:00:00Z");
  eq("dropped on a time: that day and time", dropTarget(landed, false), {
    day: "2026-11-21",
    startsAt: "12:00",
  });
  eq("dropped in the all-day row: no time", dropTarget(landed, true), {
    day: "2026-11-21",
    startsAt: null,
  });
  eq(
    "now on Nairobi's clock, whatever the viewer's",
    nairobiNow(Date.parse("2026-11-20T21:30:00Z")),
    "2026-11-21T00:30:00",
  );
  eq(
    "FullCalendar's end is the day after the last day shown",
    shownDays(new Date("2026-11-16T00:00:00Z"), new Date("2026-11-23T00:00:00Z")),
    { from: "2026-11-16", to: "2026-11-22" },
  );
}

// The days read.
{
  const today = "2026-11-20";
  eq("a real range is kept", cleanRange({ from: "2026-10-26", to: "2026-12-06" }, today), {
    from: "2026-10-26",
    to: "2026-12-06",
  });
  eq("cut to six weeks", cleanRange({ from: "2026-11-01", to: "2027-01-31" }, today), {
    from: "2026-11-01",
    to: "2026-12-12",
  });
  eq("out of order: this week", cleanRange({ from: "2026-11-22", to: "2026-11-16" }, today), {
    from: "2026-11-16",
    to: "2026-11-22",
  });
  eq("not a real day: this week", cleanRange({ from: "2026-02-30", to: "2026-03-02" }, today), {
    from: "2026-11-16",
    to: "2026-11-22",
  });
  eq("nothing asked: this week", cleanRange(undefined, today), {
    from: "2026-11-16",
    to: "2026-11-22",
  });
}

// Names and views.
{
  eq("when, with a time", whenName("2026-11-21", "12:00"), "Sat 21 Nov, 12:00");
  eq("when, all day", whenName("2026-11-21", null), "Sat 21 Nov, all day");
  eq(
    "a phone opens on Schedule, a computer on Week, a remembered choice wins",
    [
      startView(null, true),
      startView(null, false),
      startView("dayGridMonth", true),
      startView("bogus", false),
    ],
    ["listWeek", "timeGridWeek", "dayGridMonth", "timeGridWeek"],
  );
  eq(
    "back and forward say what they move by",
    [stepNames("dayGridMonth"), stepNames("timeGridDay")],
    [
      { back: "Last month", next: "Next month" },
      { back: "The day before", next: "The day after" },
    ],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
