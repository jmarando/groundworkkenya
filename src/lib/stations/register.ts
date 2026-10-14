// IEBC's 2022 register by polling station (rov_per_polling_station.pdf), as
// `pdftotext -tsv` gives it, turned into polling centres. The PDF is an Excel
// export: every word of a table row sits at the same height on its page, and
// each column starts at the same x on every page, so a row is the words at one
// height and a column is a span of x. Long names overflow into the next column,
// and two cells can run into one word ("COMPLEX047288143401801",
// "COMPOUND650"): a stream's code is the 15 digits a word ends with, and its
// count the digits that end the word ending at the count column. Pure. See
// docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md.

import { slugify } from "@/lib/atlas-files";

/** One stream (a polling station) on the register. */
export type RegisterStream = {
  /** 15 digits: county 3, constituency 3, ward 4, centre 3, stream 2. */
  code: string;
  /** Voters registered to the stream; null when the row has no count. */
  registered: number | null;
  /** The ward (CAW) as IEBC names it. */
  ward: string;
  /** The centre as IEBC names it. */
  centre: string;
};

/** One polling centre: its streams added up, in one of our wards. */
export type RegisterCentre = {
  /** IEBC's 13 digits: county, constituency, ward and centre. */
  iebcCode: string;
  /** The short code agents key on USSD and write on a form's photo: PS-0001 upwards. */
  code: string;
  name: string;
  /** Our ward's slug (public/geo/*-wards.json). */
  ward: string;
  streams: number;
  registered: number;
};

/** Where the register's columns are, in points: the same on every page. */
const WARD_X = [275, 380] as const;
const CENTRE_X = [395, 576] as const;
const COUNT_RIGHT = 728.5;
const NEAR = 1.5;

type Word = { page: number; top: number; left: number; right: number; text: string };

function wordsOf(tsv: string): Word[] {
  const lines = tsv.split(/\r?\n/);
  const head = (lines[0] ?? "").split("\t");
  const at = (name: string) => head.indexOf(name);
  const [level, page, left, top, width, text] = [
    "level",
    "page_num",
    "left",
    "top",
    "width",
    "text",
  ].map(at) as [number, number, number, number, number, number];
  const out: Word[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split("\t");
    if (f[level] !== "5") continue;
    const x = Number(f[left]);
    out.push({
      page: Number(f[page]),
      top: Number(f[top]),
      left: x,
      right: x + Number(f[width]),
      text: f[text] ?? "",
    });
  }
  return out;
}

/** The streams whose code starts with `prefix` (a county's 3 digits, or a constituency's 6), in code order. */
export function registerStreams(tsv: string, prefix: string): RegisterStream[] {
  const rows = new Map<string, Word[]>();
  for (const w of wordsOf(tsv)) {
    const key = `${w.page}:${w.top}`;
    const row = rows.get(key);
    if (row) row.push(w);
    else rows.set(key, [w]);
  }
  const out: RegisterStream[] = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.left - b.left);
    let codeWord: Word | undefined;
    let code = "";
    let glued = "";
    for (const w of row) {
      const m = /^(.*?)(\d{15})$/.exec(w.text);
      if (m) {
        codeWord = w;
        glued = m[1]!;
        code = m[2]!;
        break;
      }
    }
    if (!codeWord || !code.startsWith(prefix)) continue;
    const countWord = row.find(
      (w) => w !== codeWord && Math.abs(w.right - COUNT_RIGHT) <= NEAR && /\d$/.test(w.text),
    );
    const count = countWord ? /(\d+)$/.exec(countWord.text)?.[1] : undefined;
    const centre = row
      .filter((w) => w !== codeWord && w.left >= CENTRE_X[0] && w.left < CENTRE_X[1])
      .map((w) => ({ left: w.left, text: w.text }));
    if (glued) centre.push({ left: codeWord.left, text: glued });
    centre.sort((a, b) => a.left - b.left);
    out.push({
      code,
      registered: count === undefined ? null : Number(count),
      ward: row
        .filter((w) => w.left >= WARD_X[0] && w.left < WARD_X[1])
        .map((w) => w.text)
        .join(" "),
      centre: centre.map((w) => w.text).join(" "),
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** IEBC's spellings of our wards, where slugging its name doesn't give our slug. */
export const WARD_ALIASES: Record<string, string> = { "mugumu-ini": "mugumo-ini" };

/** Our slug for IEBC's ward name, or null when it isn't one of `ours`. */
export function wardSlugFor(iebcName: string, ours: Set<string>): string | null {
  const s = slugify(iebcName);
  const slug = WARD_ALIASES[s] ?? s;
  return ours.has(slug) ? slug : null;
}

/**
 * The centres of a list of streams, in IEBC's order and numbered PS-0001 upwards, each in one
 * of `ours` (ward slugs). Problems: a stream with no count, a ward that isn't ours, and a
 * centre whose streams disagree on its name or ward.
 */
export function registerCentres(
  streams: RegisterStream[],
  ours: Set<string>,
): { centres: RegisterCentre[]; problems: string[] } {
  const problems: string[] = [];
  const byCode = new Map<string, RegisterStream[]>();
  for (const s of streams) {
    if (s.registered === null) problems.push(`stream ${s.code} has no count`);
    const key = s.code.slice(0, 13);
    byCode.set(key, [...(byCode.get(key) ?? []), s]);
  }
  const centres: RegisterCentre[] = [];
  for (const [iebcCode, own] of [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const names = new Set(own.map((s) => s.centre));
    const wardNames = new Set(own.map((s) => s.ward));
    if (names.size > 1) problems.push(`centre ${iebcCode} has ${names.size} names`);
    if (wardNames.size > 1) problems.push(`centre ${iebcCode} is in ${wardNames.size} wards`);
    const wardName = own[0]!.ward;
    const ward = wardSlugFor(wardName, ours);
    if (!ward) {
      problems.push(`centre ${iebcCode} is in ward "${wardName}", which isn't one of ours`);
      continue;
    }
    centres.push({
      iebcCode,
      code: `PS-${String(centres.length + 1).padStart(4, "0")}`,
      name: own[0]!.centre,
      ward,
      streams: own.length,
      registered: own.reduce((t, s) => t + (s.registered ?? 0), 0),
    });
  }
  return { centres, problems };
}

/**
 * Each ward's centres added up against the registered voters the atlas holds for it
 * (`atlas`, by ward slug): a problem for every ward that differs, or has no centres.
 */
export function checkRegistered(centres: RegisterCentre[], atlas: Map<string, number>): string[] {
  const sums = new Map<string, number>();
  for (const c of centres) sums.set(c.ward, (sums.get(c.ward) ?? 0) + c.registered);
  const problems: string[] = [];
  for (const [ward, want] of [...atlas.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const got = sums.get(ward);
    if (got === undefined) problems.push(`ward ${ward} has no centres`);
    else if (got !== want)
      problems.push(`ward ${ward}: the register has ${got}, the atlas ${want}`);
  }
  return problems;
}
