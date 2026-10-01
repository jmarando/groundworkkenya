// The campaign's diary: where the candidate will be, planned a week at a time,
// and things to keep an eye on. Pure; the database checks the same rules.

export const DIARY_KINDS = [
  "visit",
  "market",
  "church",
  "funeral",
  "meeting",
  "media",
  "rally",
  "watch",
] as const;
export type DiaryKind = (typeof DIARY_KINDS)[number];

export const KIND_NAMES: Record<DiaryKind, string> = {
  visit: "Visit",
  market: "Market",
  church: "Church",
  funeral: "Funeral",
  meeting: "Meeting",
  media: "Media",
  rally: "Rally",
  watch: "To watch",
};

export type DiaryEntry = {
  id: string;
  /** YYYY-MM-DD, Nairobi's. */
  day: string;
  /** HH:MM; null for all day. */
  startsAt: string | null;
  title: string;
  kind: DiaryKind;
  wardId: string | null;
  wardName: string | null;
  note: string | null;
};

export type DiaryRow = {
  id: string;
  day: string;
  starts_at: string | null;
  title: string;
  kind: string;
  ward_id: string | null;
  note: string | null;
  wards?: { name: string } | null;
};

export type DiaryInput = {
  id?: string | null;
  day?: unknown;
  startsAt?: unknown;
  title?: unknown;
  kind?: unknown;
  wardId?: unknown;
  note?: unknown;
};

export type CleanEntry = Omit<DiaryEntry, "id" | "wardName"> & { id: string | null };

const isKind = (v: string): v is DiaryKind => (DIARY_KINDS as readonly string[]).includes(v);

export function entryFromRow(r: DiaryRow): DiaryEntry {
  return {
    id: r.id,
    day: r.day,
    startsAt: r.starts_at ? r.starts_at.slice(0, 5) : null,
    title: r.title,
    kind: isKind(r.kind) ? r.kind : "visit",
    wardId: r.ward_id,
    wardName: r.wards?.name ?? null,
    note: r.note,
  };
}

/** A day that exists, as YYYY-MM-DD. */
const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** What the diary keeps, or the sentence that says what is wrong. */
export function cleanEntry(input: DiaryInput): CleanEntry {
  const day = String(input.day ?? "").trim();
  if (!isDay(day)) throw new Error("Pick the day.");
  const rawTime = String(input.startsAt ?? "").trim();
  const t = /^(\d{1,2}):(\d{2})$/.exec(rawTime);
  if (rawTime && (!t || Number(t[1]) > 23 || Number(t[2]) > 59))
    throw new Error("Give the time as 10:30, or leave it blank for all day.");
  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 2) throw new Error("Say where, or what it is.");
  if (title.length > 120) throw new Error("Keep the title under 120 characters.");
  const kind = String(input.kind ?? "visit");
  if (!isKind(kind)) throw new Error("Pick what kind of entry it is.");
  const note = String(input.note ?? "").trim();
  if (note.length > 300) throw new Error("Keep the note under 300 characters.");
  const wardId = String(input.wardId ?? "").trim();
  return {
    id: input.id ? String(input.id) : null,
    day,
    startsAt: t ? `${t[1]!.padStart(2, "0")}:${t[2]}` : null,
    title,
    kind,
    wardId: wardId || null,
    note: note || null,
  };
}

export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Monday to Sunday of the week that holds `day`. */
export function weekOf(day: string): string[] {
  const monday = addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** All-day entries first, then by time, then by title. */
export const byTime = (a: DiaryEntry, b: DiaryEntry): number =>
  (a.startsAt ?? "").localeCompare(b.startsAt ?? "") || a.title.localeCompare(b.title);

/** Where to be on `day`: its entries other than things to watch. */
export const dayPlan = (entries: DiaryEntry[], day: string): DiaryEntry[] =>
  entries.filter((e) => e.day === day && e.kind !== "watch").sort(byTime);

/** Things to watch from `day` through the following `days - 1` days. */
export function watchList(entries: DiaryEntry[], day: string, days = 3): DiaryEntry[] {
  const last = addDays(day, days - 1);
  return entries
    .filter((e) => e.kind === "watch" && e.day >= day && e.day <= last)
    .sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b));
}

/** The next timed stop on `day` at or after `time` (HH:MM). */
export const nextStop = (entries: DiaryEntry[], day: string, time: string): DiaryEntry | null =>
  dayPlan(entries, day).find((e) => e.startsAt !== null && e.startsAt >= time) ?? null;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 5 Oct". */
export function dayName(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const timeName = (e: Pick<DiaryEntry, "startsAt">): string => e.startsAt ?? "All day";

/** Nairobi's time of day, "HH:MM". */
export const nairobiTime = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
