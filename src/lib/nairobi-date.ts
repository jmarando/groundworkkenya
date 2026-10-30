// Calendar days as Nairobi counts them (UTC+3, no daylight saving), written yyyy-mm-dd.

/** Today's date in Nairobi. */
export function nairobiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A yyyy-mm-dd day moved by whole days. */
export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The Nairobi day an instant falls on. */
export const nairobiDay = (when: string | number | Date): string => nairobiToday(new Date(when));

/**
 * The instants that bound Nairobi days `from` to `to`, both included: midnight in Nairobi at the
 * start of `from` up to (not including) midnight at the end of `to`. Nairobi is UTC+3 all year.
 */
export function dayRange(from: string, to: string): { gte: string; lt: string } {
  const midnight = (day: string) =>
    new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 3_600_000).toISOString();
  return { gte: midnight(from), lt: midnight(addDays(to, 1)) };
}
