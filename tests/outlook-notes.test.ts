// Checks for the facts behind Outlook 2027: the dated, sourced context notes
// and the 2026 registration drive by county. The shipped files must parse, say
// where they come from and name no community; a bad file is refused with every
// problem named. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/outlook-notes.test.ts

import { readFileSync } from "node:fs";

import { parseKenya } from "@/lib/kenya";
import { parseNotes, parseRegistered, registeredFor } from "@/lib/outlook-notes";

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

const notesCsv = readFileSync("data/kenya/outlook-notes.csv", "utf8");
const registeredCsv = readFileSync("data/kenya/registered-2026.csv", "utf8");
const k = parseKenya(
  readFileSync("data/kenya/regions.csv", "utf8"),
  readFileSync("data/kenya/counties.csv", "utf8"),
);
const counties = k.counties.map((c) => ({ code: c.code, name: c.name }));

/** A day (YYYY-MM-DD) or a month (YYYY-MM) that exists. */
function isRealDate(d: string): boolean {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1];
  const t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da;
}
eq("a real day", isRealDate("2026-02-28"), true);
eq("a day that is not", isRealDate("2026-02-30"), false);
eq("a real month", isRealDate("2026-02"), true);
eq("a month that is not", isRealDate("2026-13"), false);

/** What a parser says about `fn()`, or "" when it accepts. */
function refusal(fn: () => unknown): string {
  try {
    fn();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

// ------------------------------------------------------------------ the notes

const notes = parseNotes(notesCsv);
eq("there are notes", notes.length > 10, true);
eq("the topics", [...new Set(notes.map((n) => n.topic))].sort(), [
  "nairobi",
  "parties",
  "register",
  "world",
  "youth",
]);
eq("ids are unique", new Set(notes.map((n) => n.id)).size, notes.length);
for (const n of notes) {
  eq(`${n.id}: a date`, /^\d{4}-\d{2}(-\d{2})?$/.test(n.date), true);
  eq(`${n.id}: the date is a real one`, isRealDate(n.date), true);
  eq(`${n.id}: a https link`, n.url.startsWith("https://"), true);
  eq(`${n.id}: a source`, n.source.trim().length > 0, true);
  eq(`${n.id}: a title and a text`, n.title.trim().length > 0 && n.text.trim().length > 0, true);
  eq(
    `${n.id}: a known kind`,
    ["official", "reported", "survey", "statement"].includes(n.kind),
    true,
  );
  eq(`${n.id}: nothing dated after the day this was written`, n.date <= "2026-10-18", true);
}
eq(
  "the notes that are about Nairobi say so; the rest are for everywhere",
  notes.filter((n) => n.topic === "nairobi").every((n) => n.place === "Nairobi") &&
    notes.filter((n) => n.topic !== "nairobi").every((n) => n.place === ""),
  true,
);

// Places, not people: no note names a community.
const COMMUNITY =
  /\b(luo|kikuyu|gikuyu|kalenjin|luhya|kamba|mijikenda|maasai|tribe|tribes|tribal|ethnic|ethnicity)\b/i;
for (const n of notes)
  eq(`${n.id}: names no community`, COMMUNITY.test(`${n.title} ${n.text} ${n.caveat}`), false);
eq("the guard itself catches one", COMMUNITY.test("the Luo vote"), true);

// The notes the Nairobi analysis rests on are there, with the dates the sources give.
const byId = (id: string) => notes.find((n) => n.id === id);
eq("Winnie Odinga's announcement", byId("winnie-senate")?.date, "2026-10-15");
eq("Babu Owino's statement", byId("babu-governor")?.date, "2026-09-15");
eq("ODM's July statement", byId("odm-ruto-2026")?.date, "2026-07-12");
eq(
  "the registration figures sit beside the notes about them",
  byId("registration-county")?.text.includes("276,886") &&
    byId("registration-total")?.text.includes("2,612,725"),
  true,
);

// ---------------------------------------------------- what a bad notes file does

const HEAD = "id,topic,place,date,title,text,kind,source,url,caveat";
const row = (o: Partial<Record<string, string>> = {}) => {
  const r: Record<string, string> = {
    id: "a",
    topic: "youth",
    place: "",
    date: "2026-05-05",
    title: "A title",
    text: "A text.",
    kind: "reported",
    source: "A paper, 5 May 2026",
    url: "https://example.org/a",
    caveat: "",
    ...o,
  };
  return HEAD.split(",")
    .map((c) => `"${(r[c] ?? "").replace(/"/g, '""')}"`)
    .join(",");
};
const file = (...rows: string[]) => [HEAD, ...rows].join("\n");

eq(
  "a good file is accepted",
  refusal(() => parseNotes(file(row(), row({ id: "b" })))),
  "",
);
eq("a month is a date", parseNotes(file(row({ date: "2026-02" })))[0]?.date, "2026-02");
eq(
  "a missing column",
  refusal(() => parseNotes(HEAD.replace(",kind", "") + "\n")),
  'outlook-notes.csv has no column "kind"',
);
eq(
  "a duplicate id",
  refusal(() => parseNotes(file(row(), row()))),
  'outlook-notes.csv: "a" is listed twice',
);
eq(
  "not a real day",
  refusal(() => parseNotes(file(row({ date: "2026-02-30" })))),
  "a: the date 2026-02-30 is not a day",
);
eq(
  "not a date at all",
  refusal(() => parseNotes(file(row({ date: "5 May 2026" })))),
  "a: the date 5 May 2026 is not a day",
);
eq(
  "a kind not known",
  refusal(() => parseNotes(file(row({ kind: "rumour" })))),
  'a: the kind "rumour" is not one of official, reported, survey, statement',
);
eq(
  "a link that is not https",
  refusal(() => parseNotes(file(row({ url: "http://example.org/a" })))),
  "a: the link must start with https://",
);
eq(
  "an empty text",
  refusal(() => parseNotes(file(row({ text: "  " })))),
  "a: the text is empty",
);
eq(
  "an empty source",
  refusal(() => parseNotes(file(row({ source: "" })))),
  "a: the source is empty",
);
eq(
  "an empty title",
  refusal(() => parseNotes(file(row({ title: "" })))),
  "a: the title is empty",
);
eq(
  "an empty topic",
  refusal(() => parseNotes(file(row({ topic: " " })))),
  "a: the topic is empty",
);
eq(
  "a note with no id",
  refusal(() => parseNotes(file(row({ id: "" })))),
  "outlook-notes.csv: a note has no id",
);
eq(
  "every problem is named, one to a line",
  refusal(() =>
    parseNotes(file(row({ kind: "x", url: "ftp://y" }), row({ id: "b", text: "" }))),
  ).split("\n").length,
  3,
);

// --------------------------------------------------------------- the registrations

const reg = parseRegistered(registeredCsv, counties);
eq("17 counties", reg.length, 17);
eq(
  "they add up to the 17 counties' total as the paper printed it",
  reg.reduce((t, r) => t + r.newRegistrations, 0),
  1_107_452,
);
eq("Nairobi", registeredFor(reg, "Nairobi")?.newRegistrations, 276_886);
eq("Nairobi's code", registeredFor(reg, "Nairobi")?.code, "047");
eq("the period", registeredFor(reg, "Nairobi")?.period, "2026-03-30 to 2026-04-28");
eq("case does not matter", registeredFor(reg, "NAIROBI")?.county, "Nairobi");
eq("punctuation does not matter", registeredFor(reg, "Muranga")?.newRegistrations, 49_791);
eq("the curly apostrophe either", registeredFor(reg, "Murang’a")?.county, "Murang'a");
eq("a county not listed", registeredFor(reg, "Nyeri City"), null);
eq("a county with no row", registeredFor(reg, "Kitui"), null);
eq(
  "the drive's three biggest",
  reg.slice(0, 3).map((r) => r.county),
  ["Nairobi", "Kiambu", "Nakuru"],
);
for (const r of reg) {
  eq(`${r.county}: a https link`, r.url.startsWith("https://"), true);
  eq(`${r.county}: a source`, r.source.length > 0, true);
}

const RHEAD = "code,county,new_registrations,period,source,url";
const rrow = (o: Partial<Record<string, string>> = {}) => {
  const r: Record<string, string> = {
    code: "047",
    county: "Nairobi",
    new_registrations: "276886",
    period: "2026-03-30 to 2026-04-28",
    source: "A paper, 1 May 2026",
    url: "https://example.org/r",
    ...o,
  };
  return RHEAD.split(",")
    .map((c) => `"${(r[c] ?? "").replace(/"/g, '""')}"`)
    .join(",");
};
const rfile = (...rows: string[]) => [RHEAD, ...rows].join("\n");
eq(
  "a good file",
  refusal(() => parseRegistered(rfile(rrow()), counties)),
  "",
);
eq(
  "a code not in counties.csv",
  refusal(() => parseRegistered(rfile(rrow({ code: "099" })), counties)),
  "Nairobi: code 099 is not a county",
);
eq(
  "a name that does not match its code",
  refusal(() => parseRegistered(rfile(rrow({ county: "Kiambu" })), counties)),
  "Kiambu: code 047 is Nairobi",
);
eq(
  "a count that is not whole",
  refusal(() => parseRegistered(rfile(rrow({ new_registrations: "27.5" })), counties)),
  "Nairobi: new_registrations is not a whole number (27.5)",
);
eq(
  "no count at all",
  refusal(() => parseRegistered(rfile(rrow({ new_registrations: "" })), counties)),
  "Nairobi: new_registrations is not a whole number ()",
);
eq(
  "no period",
  refusal(() => parseRegistered(rfile(rrow({ period: "" })), counties)),
  "Nairobi: the period is empty",
);
eq(
  "a count of nothing",
  refusal(() => parseRegistered(rfile(rrow({ new_registrations: "0" })), counties)),
  "Nairobi: new_registrations is nothing",
);
eq(
  "a county twice",
  refusal(() => parseRegistered(rfile(rrow(), rrow()), counties)),
  "Nairobi is listed twice",
);
eq(
  "a link that is not https",
  refusal(() => parseRegistered(rfile(rrow({ url: "http://example.org/r" })), counties)),
  "Nairobi: the link must start with https://",
);
eq(
  "no source",
  refusal(() => parseRegistered(rfile(rrow({ source: "" })), counties)),
  "Nairobi: the source is empty",
);
eq(
  "a missing column",
  refusal(() => parseRegistered("code,county\n047,Nairobi", counties)),
  'registered-2026.csv has no column "new_registrations"\nregistered-2026.csv has no column "period"\nregistered-2026.csv has no column "source"\nregistered-2026.csv has no column "url"',
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
