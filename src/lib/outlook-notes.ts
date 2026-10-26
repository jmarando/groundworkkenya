// The facts behind Outlook 2027, read from data/kenya (see its README): dated,
// sourced notes about what has changed since 2022, and the IEBC's 2026
// registration drive by county. Pure. A bad file is refused with one Error that
// names every problem, one to a line.
// docs/superpowers/plans/2026-10-18-outlook-2027.md.

import { rowsOf } from "@/lib/kenya";

export const KINDS = ["official", "reported", "survey", "statement"] as const;
export type Kind = (typeof KINDS)[number];

/** One thing that has changed since 2022, with where it comes from. */
export type Note = {
  id: string;
  /** What it is about: youth, register, world, parties or nairobi. */
  topic: string;
  /** The county it is about; blank means everywhere. */
  place: string;
  /** YYYY-MM-DD, or YYYY-MM where the source gives only a month. */
  date: string;
  title: string;
  text: string;
  kind: Kind;
  source: string;
  url: string;
  /** What to remember when reading it. */
  caveat: string;
};

/** New registrations in a county in the IEBC's 2026 mass drive. */
export type Registered = {
  code: string;
  county: string;
  newRegistrations: number;
  period: string;
  source: string;
  url: string;
};

const NOTE_COLUMNS = [
  "id",
  "topic",
  "place",
  "date",
  "title",
  "text",
  "kind",
  "source",
  "url",
  "caveat",
];
const REGISTERED_COLUMNS = ["code", "county", "new_registrations", "period", "source", "url"];

/** A day (YYYY-MM-DD) or a month (YYYY-MM) that exists. */
function realDate(d: string): boolean {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1];
  const t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
}

const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);
/** A county's name as it is compared: letters only, in lower case. */
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function parseNotes(csv: string): Note[] {
  const problems: string[] = [];
  const notes: Note[] = [];
  const seen = new Set<string>();
  for (const r of rowsOf("outlook-notes.csv", csv, NOTE_COLUMNS, problems)) {
    const id = r["id"] ?? "";
    if (!id) {
      problems.push("outlook-notes.csv: a note has no id");
      continue;
    }
    if (seen.has(id)) problems.push(`outlook-notes.csv: "${id}" is listed twice`);
    seen.add(id);
    const date = r["date"] ?? "";
    const kind = r["kind"] ?? "";
    const url = r["url"] ?? "";
    if (!realDate(date)) problems.push(`${id}: the date ${date} is not a day`);
    if (!isKind(kind)) problems.push(`${id}: the kind "${kind}" is not one of ${KINDS.join(", ")}`);
    if (!url.startsWith("https://")) problems.push(`${id}: the link must start with https://`);
    for (const c of ["topic", "title", "text", "source"] as const)
      if (!(r[c] ?? "").trim()) problems.push(`${id}: the ${c} is empty`);
    if (isKind(kind))
      notes.push({
        id,
        topic: r["topic"] ?? "",
        place: r["place"] ?? "",
        date,
        title: r["title"] ?? "",
        text: r["text"] ?? "",
        kind,
        source: r["source"] ?? "",
        url,
        caveat: r["caveat"] ?? "",
      });
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return notes;
}

export function parseRegistered(
  csv: string,
  counties: { code: string; name: string }[],
): Registered[] {
  const problems: string[] = [];
  const rows: Registered[] = [];
  const seen = new Set<string>();
  for (const r of rowsOf("registered-2026.csv", csv, REGISTERED_COLUMNS, problems)) {
    const who = r["county"] ?? "";
    const code = r["code"] ?? "";
    const known = counties.find((c) => c.code === code);
    if (!known) problems.push(`${who}: code ${code} is not a county`);
    else if (letters(known.name) !== letters(who))
      problems.push(`${who}: code ${code} is ${known.name}`);
    if (seen.has(code)) problems.push(`${who} is listed twice`);
    seen.add(code);
    const v = r["new_registrations"] ?? "";
    if (!/^\d+$/.test(v)) problems.push(`${who}: new_registrations is not a whole number (${v})`);
    else if (Number(v) === 0) problems.push(`${who}: new_registrations is nothing`);
    if (!(r["url"] ?? "").startsWith("https://"))
      problems.push(`${who}: the link must start with https://`);
    for (const c of ["period", "source"] as const)
      if (!(r[c] ?? "").trim()) problems.push(`${who}: the ${c} is empty`);
    rows.push({
      code,
      county: who,
      newRegistrations: /^\d+$/.test(v) ? Number(v) : 0,
      period: r["period"] ?? "",
      source: r["source"] ?? "",
      url: r["url"] ?? "",
    });
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return rows;
}

/** A county's row, found by its name whatever the case or punctuation; null when there is none. */
export function registeredFor(rows: Registered[], countyName: string): Registered | null {
  const want = letters(countyName);
  return rows.find((r) => letters(r.county) === want) ?? null;
}
