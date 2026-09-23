// People helpers shared by the console's add and import screens. Pure: no
// database, no network, so the rules can be tested on their own.

import { normalizeKePhone } from "@/lib/phone";

/**
 * Support is asked on a 1-5 scale at the door, and stored as the 0-100 score
 * the console already uses: 4 and 5 land in "strong" (70+), 3 in "undecided"
 * (40-69), 1 and 2 below that.
 */
export const SUPPORT_SCORE: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 10,
  2: 30,
  3: 50,
  4: 75,
  5: 95,
};

export const IMPORT_FIELDS = [
  "name",
  "phone",
  "ward",
  "segment",
  "language",
  "sms",
  "whatsapp",
  "call",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Record<ImportField, number | null>;

/** Header names people actually use, in English and Kiswahili. */
const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "full name", "fullname", "names", "jina", "majina"],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "msisdn",
    "number",
    "tel",
    "telephone",
    "simu",
    "namba",
    "namba ya simu",
    "contact",
  ],
  ward: ["ward", "wadi", "ward name"],
  segment: ["segment", "group", "kundi", "category"],
  language: ["language", "lang", "lugha"],
  sms: ["sms", "sms consent", "consent sms", "consent_sms", "text", "texts ok", "sms ok"],
  whatsapp: ["whatsapp", "wa", "whatsapp consent", "consent_whatsapp", "whatsapp ok"],
  call: ["call", "calls", "phone calls", "call consent", "consent_call", "calls ok"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function guessMapping(headers: string[]): Mapping {
  const taken = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as Mapping;
  for (const field of IMPORT_FIELDS) {
    const wanted = SYNONYMS[field].map(norm);
    const at = headers.findIndex((h, i) => !taken.has(i) && wanted.includes(norm(h)));
    if (at >= 0) {
      mapping[field] = at;
      taken.add(at);
    }
  }
  return mapping;
}

/** A consent cell that says yes, however it says it. */
export function truthy(v: string | undefined): boolean {
  return /^(y|yes|true|1|ndio|ndiyo|x|✓|✔|ok|agreed|opted in)$/i.test((v ?? "").trim());
}

function language(v: string | undefined): "sw" | "en" | null {
  const t = norm(v ?? "");
  if (!t) return null;
  if (["sw", "swa", "swahili", "kiswahili"].includes(t)) return "sw";
  if (["en", "eng", "english", "kiingereza"].includes(t)) return "en";
  return null;
}

export type ImportRow = {
  line: number;
  phone: string;
  name: string | null;
  wardId: string | null;
  segment: string | null;
  language: "sw" | "en" | null;
  sms: boolean;
  whatsapp: boolean;
  call: boolean;
};

export type PreparedImport = {
  rows: ImportRow[];
  invalid: { line: number; value: string }[];
  duplicates: number;
  unknownWards: { name: string; count: number }[];
  unknownSegments: { name: string; count: number }[];
};

/**
 * Turn spreadsheet records into rows the database will take. Numbers are
 * normalised to +254…, repeats within the file keep the first, and ward and
 * group names are matched forgivingly ("KIBRA Ward" finds Kibra).
 */
export function prepareImport(
  records: string[][],
  mapping: Mapping,
  wards: { id: string; name: string }[],
  segments: { slug: string; name: string }[],
  firstLine = 2,
): PreparedImport {
  const wardKey = (s: string) => norm(s).replace(/ ward$/, "");
  const wardByName = new Map(wards.map((w) => [wardKey(w.name), w.id]));
  const segBy = new Map<string, string>();
  for (const s of segments) {
    segBy.set(norm(s.slug), s.slug);
    segBy.set(norm(s.name), s.slug);
  }

  const get = (r: string[], f: ImportField) => {
    const i = mapping[f];
    return i === null ? undefined : r[i]?.trim();
  };

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  const invalid: PreparedImport["invalid"] = [];
  const unknownWards = new Map<string, number>();
  const unknownSegments = new Map<string, number>();
  let duplicates = 0;

  records.forEach((r, i) => {
    const line = firstLine + i;
    const raw = get(r, "phone") ?? "";
    const phone = normalizeKePhone(raw);
    if (!phone) {
      invalid.push({ line, value: raw });
      return;
    }
    if (seen.has(phone)) {
      duplicates++;
      return;
    }
    seen.add(phone);

    const wardName = get(r, "ward");
    let wardId: string | null = null;
    if (wardName) {
      wardId = wardByName.get(wardKey(wardName)) ?? null;
      if (!wardId) unknownWards.set(wardName, (unknownWards.get(wardName) ?? 0) + 1);
    }

    const segName = get(r, "segment");
    let segment: string | null = null;
    if (segName) {
      segment = segBy.get(norm(segName)) ?? null;
      if (!segment) unknownSegments.set(segName, (unknownSegments.get(segName) ?? 0) + 1);
    }

    rows.push({
      line,
      phone,
      name: get(r, "name") || null,
      wardId,
      segment,
      language: language(get(r, "language")),
      sms: truthy(get(r, "sms")),
      whatsapp: truthy(get(r, "whatsapp")),
      call: truthy(get(r, "call")),
    });
  });

  const list = (m: Map<string, number>) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return {
    rows,
    invalid,
    duplicates,
    unknownWards: list(unknownWards),
    unknownSegments: list(unknownSegments),
  };
}
