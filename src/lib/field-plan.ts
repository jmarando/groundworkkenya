// The field plan: a fortnight of walk lists by day and person, and how many more lists each ward
// needs. Pure. The reads are src/lib/field-plan.functions.ts; the screen is /field-plan, and the
// field app uses dayLabel and forToday to put today's lists first.

export type Shift = "morning" | "afternoon" | "day";
export const SHIFTS: { key: Shift; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "day", label: "All day" },
];

/** A list on the plan. */
export type PlanList = {
  id: string;
  name: string;
  status: "draft" | "out" | "done";
  wardId: string | null;
  wardName: string | null;
  centreName: string | null;
  givenTo: string | null;
  givenToName: string | null;
  dueOn: string | null;
  shift: Shift | null;
  doors: number;
  done: number;
};

export type PlanWard = {
  wardId: string;
  slug: string;
  name: string;
  targetVotes: number;
  doorsPlanned: number;
  doorsKnocked: number;
  spoke: number;
  supporters: number;
};

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (day: string) => new Date(`${day}T00:00:00Z`);

/** Today in Nairobi, yyyy-mm-dd. */
export const nairobiToday = (now = new Date()) => iso(new Date(now.getTime() + 3 * 3_600_000));

export const addDays = (day: string, n: number) => iso(new Date(at(day).getTime() + n * DAY));

/** The Monday on or before `day`. */
export function mondayOf(day: string): string {
  const wd = at(day).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

/** The fourteen days from `start`. */
export const fortnight = (start: string) => Array.from({ length: 14 }, (_, i) => addDays(start, i));

/** "Mon 20 Oct". */
export const shortDay = (day: string) =>
  at(day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** How a list's day reads to the person walking it. */
export function dayLabel(dueOn: string | null, shift: Shift | null, today: string): string | null {
  if (!dueOn) return null;
  const s = shift === "morning" ? " morning" : shift === "afternoon" ? " afternoon" : "";
  if (dueOn === today) return `Today${s}`;
  if (dueOn === addDays(today, 1)) return `Tomorrow${s}`;
  if (dueOn < today) return `Was due ${shortDay(dueOn)}`;
  return `${shortDay(dueOn)}${s}`;
}

/** Today's first (morning before afternoon), then the ones that were due, then by day, unplanned last. */
export function forToday<T extends { dueOn: string | null; shift: Shift | null; name: string }>(
  lists: T[],
  today: string,
): T[] {
  const rank = (l: T) => (l.dueOn === today ? 0 : l.dueOn && l.dueOn < today ? 1 : l.dueOn ? 2 : 3);
  const shiftRank = (s: Shift | null) => (s === "morning" ? 0 : s === "afternoon" ? 2 : 1);
  return [...lists].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueOn ?? "").localeCompare(b.dueOn ?? "") ||
      shiftRank(a.shift) - shiftRank(b.shift) ||
      a.name.localeCompare(b.name),
  );
}

/** The board's cell for a person and a day: the lists due then. `null` person is "not given yet". */
export function cell(lists: PlanList[], person: string | null, day: string): PlanList[] {
  return lists.filter((l) => l.dueOn === day && (l.givenTo ?? null) === person);
}

/** Open lists with no day yet, biggest first. */
export const unscheduled = (lists: PlanList[]) =>
  lists
    .filter((l) => !l.dueOn && l.status !== "done")
    .sort((a, b) => b.doors - a.doors || a.name.localeCompare(b.name));

/** Lists whose day has passed with doors still to knock. */
export const overdue = (lists: PlanList[], today: string) =>
  lists.filter(
    (l) => l.status !== "done" && l.dueOn !== null && l.dueOn < today && l.done < l.doors,
  );

/** Doors a list size holds when planning by patch. */
export const LIST_DOORS = 50;

/**
 * How many more lists each ward needs over the window: the team's doors for the fortnight
 * (people × working days × doors a day) shared by each ward's vote target, less the doors already
 * planned there. Wards with no target share nothing; the biggest need first.
 */
export function wardNeeds(
  wards: PlanWard[],
  capacity: { people: number; days: number; doorsPerDay: number },
) {
  const doors =
    Math.max(0, capacity.people) * Math.max(0, capacity.days) * Math.max(0, capacity.doorsPerDay);
  const total = wards.reduce((t, w) => t + Math.max(0, w.targetVotes), 0);
  return wards
    .map((w) => {
      const goal = total > 0 ? Math.round((doors * Math.max(0, w.targetVotes)) / total) : 0;
      const short = Math.max(0, goal - w.doorsPlanned);
      return { ...w, goal, lists: Math.ceil(short / LIST_DOORS) };
    })
    .sort((a, b) => b.lists - a.lists || a.name.localeCompare(b.name));
}

/** The window's totals: doors planned and knocked, conversations and supporters met. */
export const planTotals = (wards: PlanWard[]) =>
  wards.reduce(
    (t, w) => ({
      planned: t.planned + w.doorsPlanned,
      knocked: t.knocked + w.doorsKnocked,
      spoke: t.spoke + w.spoke,
      supporters: t.supporters + w.supporters,
    }),
    { planned: 0, knocked: 0, spoke: 0, supporters: 0 },
  );
