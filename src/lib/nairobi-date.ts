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
