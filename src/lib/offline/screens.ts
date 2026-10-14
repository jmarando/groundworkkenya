// What the screens do with no signal: which pages open, what the sign-in gate
// shows, and how the offline bar words the last load. Pure.

/** The pages that open with no signal; public/sw.js keeps copies of the same. */
export const OFFLINE_PAGES = ["/home", "/field", "/diary", "/voters", "/elections", "/strategy"];

/** What each offline page can't open without: the first part of its main query's key. */
const PAGE_DATA: Record<string, string> = {
  "/home": "home",
  "/diary": "diary",
  "/voters": "voters",
  "/field": "voters",
  "/elections": "atlas",
  "/strategy": "atlas",
};

/**
 * With no signal, whether a page has to say it needs signal: it's off the list,
 * or nothing it shows was saved (`hasData` says whether any query whose key
 * starts with the given name has data).
 */
export function needsSignal(pathname: string, hasData: (key: string) => boolean): boolean {
  const page = OFFLINE_PAGES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const key = page ? PAGE_DATA[page] : undefined;
  return !key || !hasData(key);
}

export type GateState = "checking" | "in" | "failed" | "first-visit";

/**
 * The signed-in area's gate: saved access lets a person in whatever the
 * connection; with no signal and nothing saved, they're asked to open
 * Groundwork once with signal; with signal, the check runs as before.
 */
export function gateState(s: {
  /** Saved data has been put back (or there was none to put back). */
  ready: boolean;
  loading: boolean;
  failed: boolean;
  hasAccess: boolean;
  online: boolean;
}): GateState {
  if (s.hasAccess) return "in";
  if (!s.ready) return "checking";
  if (!s.online) return "first-visit";
  if (s.loading) return "checking";
  return s.failed ? "failed" : "in";
}

const hhmm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Nairobi",
});
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Nairobi",
});
const nairobiDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(ms);

/** "at 08:40" today, "on 12 Oct at 08:40" before; null when nothing has loaded. */
export function lastLoadedText(ms: number, now: number): string | null {
  if (!ms) return null;
  return nairobiDay(ms) === nairobiDay(now)
    ? `at ${hhmm.format(ms)}`
    : `on ${dayMonth.format(ms)} at ${hhmm.format(ms)}`;
}
