// The diary as a calendar (FullCalendar). Each entry, and each crowd event nobody has
// decided on yet, becomes a block on the grid. The diary keeps only a start time, so a
// block runs for its kind's usual length and ends early when the day's next entry
// starts. Times are Nairobi's wall clock: the calendar runs in UTC with times written
// without a zone, so 10:00 shows as 10:00 wherever the viewer is. Pure.

import type { CrowdEvent, CrowdKind } from "@/lib/crowd-events";
import { addDays, dayName, weekOf, type DiaryEntry, type DiaryKind } from "@/lib/diary";

/** How long each kind of entry usually takes, in minutes. */
export const KIND_MINUTES: Record<DiaryKind, number> = {
  visit: 90,
  market: 120,
  church: 120,
  funeral: 180,
  meeting: 60,
  media: 60,
  rally: 120,
  watch: 60,
};
/** A crowd event's block: two hours. */
export const CROWD_MINUTES = 120;
/** No block is shorter than half an hour, so its title can be read. */
export const MIN_MINUTES = 30;
/** The most days read at once: a month view's six weeks. */
export const MAX_RANGE_DAYS = 42;

/** What a block stands for. */
export type CalendarItem =
  | { type: "entry"; id: string; kind: DiaryKind; ward: string | null }
  | { type: "crowd"; id: string; kind: CrowdKind; place: string | null };

/** What FullCalendar is given for each block (its EventInput, narrowed). */
export type CalendarEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD for all day, else YYYY-MM-DDTHH:MM:00 with no zone: Nairobi's clock. */
  start: string;
  end?: string;
  allDay: boolean;
  classNames: string[];
  /** Only entries move, and only for those who can change the diary. */
  startEditable: boolean;
  extendedProps: CalendarItem;
};

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const two = (n: number) => String(n).padStart(2, "0");

/** `minutes` after midnight on `day`, written for the calendar; past midnight runs into the next day. */
const at = (day: string, minutes: number): string => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${addDays(day, Math.floor(minutes / 1440))}T${two(Math.floor(m / 60))}:${two(m % 60)}:00`;
};

/** The diary's entries as blocks: a timed one runs for its kind's length or until the day's next entry starts. */
export function entryEvents(entries: DiaryEntry[], canEdit: boolean): CalendarEvent[] {
  const starts = new Map<string, number[]>();
  for (const e of entries) {
    if (!e.startsAt) continue;
    starts.set(e.day, [...(starts.get(e.day) ?? []), toMinutes(e.startsAt)]);
  }
  for (const list of starts.values()) list.sort((a, b) => a - b);
  return entries.map((e): CalendarEvent => {
    const base = {
      id: e.id,
      title: e.title,
      classNames: ["cal-ev", `cal-ev--${e.kind}`],
      startEditable: canEdit,
      extendedProps: { type: "entry" as const, id: e.id, kind: e.kind, ward: e.wardName },
    };
    if (!e.startsAt) return { ...base, start: e.day, allDay: true };
    const start = toMinutes(e.startsAt);
    const next = (starts.get(e.day) ?? []).find((m) => m > start);
    const length = Math.max(
      MIN_MINUTES,
      Math.min(KIND_MINUTES[e.kind], next === undefined ? Infinity : next - start),
    );
    return { ...base, start: at(e.day, start), end: at(e.day, start + length), allDay: false };
  });
}

/** The crowd events nobody has decided on, as suggestions: added ones are entries already, set-aside ones are gone. */
export function crowdEvents(events: CrowdEvent[]): CalendarEvent[] {
  return events
    .filter((c) => c.status === "new")
    .map((c): CalendarEvent => {
      const base = {
        id: `crowd:${c.id}`,
        title: c.title,
        classNames: ["cal-ev", "cal-ev--crowd"],
        startEditable: false,
        extendedProps: { type: "crowd" as const, id: c.id, kind: c.kind, place: c.place },
      };
      if (!c.startsAt) return { ...base, start: c.day, allDay: true };
      const start = toMinutes(c.startsAt);
      return {
        ...base,
        start: at(c.day, start),
        end: at(c.day, start + CROWD_MINUTES),
        allDay: false,
      };
    });
}

/** The hours to show: 06:00 to 21:00, widened to the whole hour around any block outside them. */
export function slotBounds(events: CalendarEvent[]): { min: string; max: string } {
  let min = 6 * 60;
  let max = 21 * 60;
  for (const e of events) {
    if (e.allDay || !e.end) continue;
    const start = toMinutes(e.start.slice(11, 16));
    const end = e.end.slice(0, 10) > e.start.slice(0, 10) ? 1440 : toMinutes(e.end.slice(11, 16));
    min = Math.min(min, start);
    max = Math.max(max, end);
  }
  return {
    min: `${two(Math.floor(min / 60))}:00:00`,
    max: `${two(Math.min(24, Math.ceil(max / 60)))}:00:00`,
  };
}

/** Where a dragged entry landed: its day, and its time unless it was dropped in the all-day row. */
export function dropTarget(start: Date, allDay: boolean): { day: string; startsAt: string | null } {
  // The calendar runs in UTC, so the instant's UTC reading is Nairobi's clock.
  const iso = start.toISOString();
  return { day: iso.slice(0, 10), startsAt: allDay ? null : iso.slice(11, 16) };
}

/** Now on Nairobi's clock (UTC+3 all year), written without a zone for the calendar. */
export const nairobiNow = (now = Date.now()): string =>
  new Date(now + 3 * 3_600_000).toISOString().slice(0, 19);

/** The days on screen, from FullCalendar's start to its end (which it gives as the day after). */
export function shownDays(start: Date, end: Date): { from: string; to: string } {
  return {
    from: start.toISOString().slice(0, 10),
    to: addDays(end.toISOString().slice(0, 10), -1),
  };
}

const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** The days to read: as asked when both are real days in order, cut to six weeks; otherwise this week. */
export function cleanRange(
  input: { from?: unknown; to?: unknown } | undefined,
  today: string,
): { from: string; to: string } {
  const from = String(input?.from ?? "");
  const to = String(input?.to ?? "");
  if (isDay(from) && isDay(to) && from <= to) {
    const last = addDays(from, MAX_RANGE_DAYS - 1);
    return { from, to: to > last ? last : to };
  }
  const week = weekOf(today);
  return { from: week[0]!, to: week[6]! };
}

/** "Sat 21 Nov, 12:00", or "Sat 21 Nov, all day". */
export const whenName = (day: string, startsAt: string | null): string =>
  `${dayName(day)}, ${startsAt ?? "all day"}`;

export const CALENDAR_VIEWS = [
  { type: "timeGridDay", label: "Day", step: "day" },
  { type: "timeGridWeek", label: "Week", step: "week" },
  { type: "dayGridMonth", label: "Month", step: "month" },
  { type: "listWeek", label: "Schedule", step: "week" },
] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number]["type"];

export const isCalendarView = (v: unknown): v is CalendarView =>
  CALENDAR_VIEWS.some((x) => x.type === v);

/** Where the calendar opens: the viewer's last choice, else Schedule on a phone and Week elsewhere. */
export const startView = (saved: unknown, phone: boolean): CalendarView =>
  isCalendarView(saved) ? saved : phone ? "listWeek" : "timeGridWeek";

/** The back and forward buttons' names for a view: "Last week", "Next month", "The day before". */
export function stepNames(view: CalendarView): { back: string; next: string } {
  const step = CALENDAR_VIEWS.find((v) => v.type === view)?.step ?? "week";
  return step === "day"
    ? { back: "The day before", next: "The day after" }
    : { back: `Last ${step}`, next: `Next ${step}` };
}
