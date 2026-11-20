// Crowd events: the funerals, church events, harambees, tournaments, shows and school days in a
// campaign's area where a candidate can meet people without a rally. The searches that look for
// them, the instructions the AI reads them with, and the checks every event it names must pass
// before it is kept: a date within the next three weeks that the result itself states in words, a
// link among the search's own results that names a place in the campaign's area, a ward that is one
// of the campaign's. Pure. See docs/superpowers/specs/2026-11-20-crowd-events-design.md.

import { slugify } from "@/lib/atlas-files";
import type { DiaryKind } from "@/lib/diary";
import { addDays } from "@/lib/nairobi-date";

export const CROWD_KINDS = [
  "funeral",
  "church",
  "sports",
  "harambee",
  "market",
  "school",
  "community",
  "other",
] as const;
export type CrowdKind = (typeof CROWD_KINDS)[number];

export const CROWD_KIND_NAMES: Record<CrowdKind, string> = {
  funeral: "Funeral",
  church: "Church",
  sports: "Sports",
  harambee: "Harambee",
  market: "Market",
  school: "School",
  community: "Community",
  other: "Gathering",
};

/** What an event becomes in the diary when the team adds it (as add_crowd_event does). */
export const DIARY_KIND_OF: Record<CrowdKind, DiaryKind> = {
  funeral: "funeral",
  church: "church",
  sports: "visit",
  harambee: "visit",
  market: "market",
  school: "visit",
  community: "visit",
  other: "visit",
};

/** How far ahead an event is worth suggesting, in days. */
export const AHEAD_DAYS = 21;
/** How many search results the AI reads at most. */
export const MAX_HITS = 30;

/** The place a campaign's searches name, and its wards to match events to. */
export type CrowdArea = {
  /** "Githunguri", "Meru", "Roysambu": what the searches name. */
  places: string[];
  county: string;
  wards: { id: string; name: string; slug: string }[];
};

/** A campaign as the search reads it, and its wards. */
export type CrowdCampaign = {
  id: string;
  slug: string;
  level: string;
  seat: string;
  map_area: string | null;
};
export type CrowdWard = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  constituency: string | null;
};

/**
 * The places a campaign's searches name: its county for a county seat, its constituency for an
 * MP, and its ward with the constituency for an MCA; null for a president (the whole country is
 * no place to look for a funeral) and for a campaign with no map area. `names` holds the atlas's
 * names by key.
 */
export function areaOf(
  c: CrowdCampaign,
  wards: CrowdWard[],
  names: Map<string, string>,
): CrowdArea | null {
  if (c.level === "president" || !c.map_area) return null;
  const parts = c.map_area.split("/");
  const county = names.get(parts[0]!) ?? parts[0]!;
  const name = (key: string) => names.get(key) ?? null;
  const places =
    parts.length === 1
      ? [county]
      : parts.length === 2
        ? [name(c.map_area) ?? county]
        : [name(c.map_area), name(parts.slice(0, 2).join("/"))].filter((p): p is string =>
            Boolean(p),
          );
  return {
    places: places.length ? places : [county],
    county,
    wards: wards.map((w) => ({ id: w.id, name: w.name, slug: w.slug })),
  };
}

/** A search result the AI may cite. */
export type CrowdHit = {
  url: string;
  title: string | null;
  snippet: string | null;
  outlet: string | null;
  publishedAt: string | null;
};

/** One event as kept: what crowd_events stores. */
export type CrowdEventRow = {
  kind: CrowdKind;
  title: string;
  starts_on: string;
  starts_at: string | null;
  place: string | null;
  ward_id: string | null;
  crowd: string | null;
  why: string | null;
  source_url: string;
  source_title: string | null;
  source_name: string | null;
  dedupe: string;
};

/** One event as the screens show it. */
export type CrowdEvent = {
  id: string;
  kind: CrowdKind;
  title: string;
  day: string;
  startsAt: string | null;
  place: string | null;
  wardId: string | null;
  wardName: string | null;
  crowd: string | null;
  why: string | null;
  url: string;
  sourceName: string | null;
  status: "new" | "added" | "dismissed";
  diaryEntryId: string | null;
};

/** A search term, quoted when it has a space or a slash. */
const term = (p: string) => (/[\s/]/.test(p.trim()) ? `"${p.trim()}"` : p.trim());

/**
 * The four searches for an area: funerals and burials; church events and harambees; tournaments
 * and sports days; shows, festivals and school days. Each names the area's places.
 */
export function crowdQueries(area: CrowdArea): string[] {
  const where =
    area.places.length > 1
      ? `(${area.places.map(term).join(" OR ")})`
      : term(area.places[0] ?? area.county);
  return [
    `${where} (funeral OR burial OR "laid to rest" OR "requiem mass")`,
    `${where} (harambee OR fundraiser OR crusade OR church)`,
    `${where} (tournament OR football OR "sports day" OR marathon)`,
    `${where} (show OR festival OR graduation OR "prize giving" OR "open day")`,
  ].map((q) => q.slice(0, 300));
}

/** The schema the AI answers in. */
export const CROWD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "title",
          "date",
          "date_text",
          "time",
          "place",
          "ward",
          "crowd",
          "why",
          "url",
        ],
        properties: {
          kind: { type: "string", enum: [...CROWD_KINDS] },
          title: { type: "string" },
          date: { type: "string" },
          date_text: { type: "string" },
          time: { type: ["string", "null"] },
          place: { type: ["string", "null"] },
          ward: { type: ["string", "null"] },
          crowd: { type: ["string", "null"] },
          why: { type: ["string", "null"] },
          url: { type: "string" },
        },
      },
    },
  },
} as const;

export type CrowdAnswer = {
  events: {
    kind: string;
    title: string;
    date: string;
    date_text: string;
    time: string | null;
    place: string | null;
    ward: string | null;
    crowd: string | null;
    why: string | null;
    url: string;
  }[];
};

/** The instructions and the search results, for the AI. */
export function crowdPrompt(
  seat: string,
  area: CrowdArea,
  hits: CrowdHit[],
  today: string,
): string {
  const last = addDays(today, AHEAD_DAYS);
  const results = hits
    .slice(0, MAX_HITS)
    .map(
      (h, n) =>
        `${n + 1}. ${h.title ?? "(no title)"}\n   ${h.outlet ?? "unknown outlet"}${h.publishedAt ? `, published ${h.publishedAt.slice(0, 10)}` : ""}\n   ${h.url}\n   ${h.snippet ?? ""}`,
    )
    .join("\n");
  return `You find the gatherings a political campaign could attend in its own area. The campaign: ${seat}. Its area: ${area.places.join(", ")} (${area.county} County). Its wards: ${area.wards.map((w) => w.name).join(", ") || "none listed"}. Today is ${today}.

From the news results below, list every gathering that WILL take place between ${today} and ${last} in this area, where people gather in numbers: funerals and burials, requiem masses, church services, crusades, church or school harambees and fundraisers, football and other tournaments, sports days, marathons, school prize-givings and graduations, agricultural shows, festivals, cultural days, market fairs and community barazas.

Rules:
- Never invent anything. Every event must be stated in a result; give that result's exact link as "url", one of the links listed.
- "date" is the event's day as YYYY-MM-DD, and "date_text" the exact words in that result's title or summary that state it, copied as written (for example "on Saturday, November 28" or "November 27-29"). Leave out any event whose result does not state its date in words like these: never use today's date, the article's date or a guess. Leave out events before ${today} or after ${last}, and reports of gatherings that already happened.
- The result must name the place: leave out any event whose result does not mention ${area.places.join(", ")}, ${area.county} or one of the wards, whatever the search was for. Leave out events outside ${area.county} County and anything that is not a gathering (statements, court cases, appointments).
- "kind": funeral, church, sports, harambee, market, school, community or other.
- "title": the event as the result names it, plainly, under 120 characters. For a funeral, the name of the person being buried as the notice gives it, and nothing more about the family.
- "time": HH:MM (24 hour) when stated, else null. "place": the venue or village as stated, else null.
- "ward": one of the campaign's wards listed above, written exactly as listed, when the place is in it; else null.
- "crowd": the result's own words about how many will come ("thousands expected"), else null.
- "why": one short line on why the campaign should care (the ward, the crowd, who is expected), else null.
- If there are no such events, answer with an empty list.

News results:
${results || "(none)"}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Text folded for matching: lower case, letters and digits only, single spaces. */
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Ward names that are also everyday words (or a first name), so a result naming them proves nothing. */
const EVERYDAY = new Set([
  "airbase",
  "california",
  "hospital",
  "harambee",
  "kahawa",
  "kanuni",
  "karama",
  "karen",
  "kisima",
  "mountain view",
  "municipality",
  "njia",
  "pipeline",
  "utalii",
  "utawala",
  "viwandani",
  "ziwani",
]);
const COMPASS = / (east|west|north|south|central|town)$/;

/**
 * The names a result must mention for its event to be in the area: the places searched, the
 * county and the wards, each part of a two-part ward and a name without its East, West or Town
 * too, less the names that are everyday words. Folded.
 */
export function placeTerms(area: CrowdArea): string[] {
  const out = new Set<string>();
  for (const name of [...area.places, area.county, ...area.wards.map((w) => w.name)])
    for (const part of name.split("/")) {
      const f = fold(part);
      for (const n of [f, f.replace(COMPASS, "")])
        if (n.length >= 4 && !EVERYDAY.has(n)) out.add(n);
    }
  return [...out];
}

/** True when folded text names one of the folded terms as whole words. */
const names = (text: string, terms: string[]): boolean => {
  const t = ` ${text} `;
  return terms.some((n) => t.includes(` ${n} `));
};

const MONTH =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * True when the words state this day: a month with the day's number ("November 27-29", "27th
 * November"), the day and month as numbers ("28/11/2026"), or the day's weekday ("this
 * Saturday"). A year, when given, must be the day's.
 */
export function statesDay(words: string, day: string): boolean {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const f = fold(words);
  const years = f.match(/\b20\d\d\b/g);
  if (years && !years.includes(String(y))) return false;
  const month = MONTH.exec(f);
  if (month) {
    const numbers = (f.match(/\b\d{1,2}(?:st|nd|rd|th)?\b/g) ?? []).map((n) => parseInt(n, 10));
    return MONTHS.indexOf(month[1]!.slice(0, 3)) + 1 === m && numbers.includes(d);
  }
  const numeric = /\b(\d{1,2})[/.](\d{1,2})\b/.exec(words);
  if (numeric) return Number(numeric[1]) === d && Number(numeric[2]) === m;
  const weekday = WEEKDAYS.find((w) => f.split(" ").includes(w));
  return (
    weekday !== undefined && WEEKDAYS.indexOf(weekday) === new Date(`${day}T00:00:00Z`).getUTCDay()
  );
}

/** The event's name and day, folded, so the same event found twice is kept once. */
export const dedupeKey = (title: string, day: string): string =>
  `${slugify(title).slice(0, 100) || "event"}|${day}`;

/** Why an event the AI named was left out, in the order the checks run. */
export const REFUSALS = [
  "kind",
  "title",
  "link",
  "date",
  "window",
  "date words",
  "place",
  "twice",
] as const;
export type Refusal = (typeof REFUSALS)[number];

/** Each reason as the job's note words it: "left out: 4 with ...". */
export const REFUSAL_NAMES: Record<Refusal, string> = {
  kind: "a kind not known",
  title: "no title",
  link: "a link not among the results",
  date: "no real date",
  window: "a date outside the next three weeks",
  "date words": "no date in the result's own words",
  place: "no place in the area named",
  twice: "the same event twice",
};

/** What the checks made of one answer: the rows kept, how many events it named, and each one left out. */
export type CrowdCheck = {
  rows: CrowdEventRow[];
  named: number;
  refused: { reason: Refusal; title: string | null; url: string | null }[];
};

/**
 * The events the AI named that pass every check, as crowd_events rows: a kind it knows, a title,
 * a real day from today to three weeks ahead, a link among the search's own results whose title or
 * summary holds the AI's date words (and they state that day) and names a place in the area, a
 * ward that is one of the campaign's (or none). The same event twice is kept once.
 */
export const cleanCrowdEvents = (
  answer: unknown,
  hits: CrowdHit[],
  area: CrowdArea,
  today: string,
): CrowdEventRow[] => checkCrowdEvents(answer, hits, area, today).rows;

/** The checks of cleanCrowdEvents, saying why each event left out was. */
export function checkCrowdEvents(
  answer: unknown,
  hits: CrowdHit[],
  area: CrowdArea,
  today: string,
): CrowdCheck {
  const events = (answer as Partial<CrowdAnswer> | null)?.events;
  if (!Array.isArray(events)) return { rows: [], named: 0, refused: [] };
  const byUrl = new Map(hits.map((h) => [h.url, h]));
  const wardBySlug = new Map(area.wards.map((w) => [w.slug, w.id]));
  const terms = placeTerms(area);
  const last = addDays(today, AHEAD_DAYS);
  const seen = new Set<string>();
  const out: CrowdEventRow[] = [];
  const refused: CrowdCheck["refused"] = [];
  let named = 0;
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    named += 1;
    const kind = CROWD_KINDS.find((k) => k === e.kind);
    const title = clip(e.title, 160);
    const day = typeof e.date === "string" ? e.date.trim() : "";
    const url = typeof e.url === "string" ? e.url.trim() : "";
    const hit = byUrl.get(url);
    const no = (reason: Refusal) => refused.push({ reason, title, url: url || null });
    if (!kind) {
      no("kind");
      continue;
    }
    if (!title || title.length < 2) {
      no("title");
      continue;
    }
    if (!hit) {
      no("link");
      continue;
    }
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      no("date");
      continue;
    }
    if (day < today || day > last) {
      no("window");
      continue;
    }
    // The result itself must state the day, in the words the AI copied, and name the area.
    const text = fold(`${hit.title ?? ""} ${hit.snippet ?? ""}`);
    const words = typeof e.date_text === "string" ? e.date_text : "";
    if (!fold(words) || !text.includes(fold(words)) || !statesDay(words, day)) {
      no("date words");
      continue;
    }
    if (!names(text, terms)) {
      no("place");
      continue;
    }
    const time = typeof e.time === "string" && TIME.test(e.time.trim()) ? e.time.trim() : null;
    const ward = typeof e.ward === "string" ? (wardBySlug.get(slugify(e.ward)) ?? null) : null;
    const dedupe = dedupeKey(title, day);
    if (seen.has(dedupe)) {
      no("twice");
      continue;
    }
    seen.add(dedupe);
    out.push({
      kind,
      title,
      starts_on: day,
      starts_at: time,
      place: clip(e.place, 120),
      ward_id: ward,
      crowd: clip(e.crowd, 80),
      why: clip(e.why, 300),
      source_url: hit.url,
      source_title: clip(hit.title, 300),
      source_name: clip(hit.outlet, 120),
      dedupe,
    });
  }
  return { rows: out, named, refused };
}

/** How many were left out for each reason. */
export function refusalCounts(refused: { reason: Refusal }[]): Partial<Record<Refusal, number>> {
  const out: Partial<Record<Refusal, number>> = {};
  for (const r of refused) out[r.reason] = (out[r.reason] ?? 0) + 1;
  return out;
}

/**
 * One line for the job's note: how many events the AI named, how many were kept or already saved,
 * and why the rest were left out. Names no campaign: every team can read the note.
 */
export function checkSummary(
  named: number,
  kept: number,
  already: number,
  counts: Partial<Record<Refusal, number>>,
): string {
  if (!named) return "The AI named no events.";
  const out = REFUSALS.filter((r) => counts[r]).map((r) => `${counts[r]} with ${REFUSAL_NAMES[r]}`);
  const head = `The AI named ${named} ${named === 1 ? "event" : "events"}: ${kept} kept${already ? `, ${already} already saved` : ""}`;
  return out.length ? `${head}; left out: ${out.join(", ")}.` : `${head}.`;
}

/** The search results the AI reads: https links only, each once, newest first, at most MAX_HITS. */
export function crowdHits(found: CrowdHit[]): CrowdHit[] {
  const byUrl = new Map<string, CrowdHit>();
  for (const h of found) if (/^https:\/\//.test(h.url) && !byUrl.has(h.url)) byUrl.set(h.url, h);
  return [...byUrl.values()]
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, MAX_HITS);
}

/** Events still to come from `today`, by day then time; those set aside left out. */
export function upcoming(events: CrowdEvent[], today: string, days = AHEAD_DAYS): CrowdEvent[] {
  const last = addDays(today, days);
  return events
    .filter((e) => e.status !== "dismissed" && e.day >= today && e.day <= last)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.startsAt ?? "99").localeCompare(b.startsAt ?? "99") ||
        a.title.localeCompare(b.title),
    );
}

/** A campaign's area is searched once in this many hours. */
export const CROWD_EVERY_HOURS = 20;
/** Campaigns are started only within this long of the step's start; the rest wait for the next hour. */
export const CROWD_BUDGET_MS = 150_000;
/** How long the AI may take over one campaign's results: the main AI, then the backup, each. */
export const CROWD_AI_MS = 30_000;

/** The job row that keeps when a campaign's area was last searched. It holds the id, no name. */
export const crowdTurnKey = (campaignId: string): string => `crowd_events:${campaignId}`;

/**
 * The campaigns whose turn it is, in order: never searched first, then the longest since their last
 * search. One searched within the last `everyHours` waits.
 */
export function crowdTurns(
  ids: string[],
  lastRun: Map<string, string | null>,
  now: Date,
  everyHours = CROWD_EVERY_HOURS,
): string[] {
  const when = (id: string) => {
    const t = lastRun.get(id);
    return t ? Date.parse(t) : Number.NEGATIVE_INFINITY;
  };
  return ids
    .filter((id) => now.getTime() - when(id) >= everyHours * 3600_000)
    .sort((a, b) => when(a) - when(b) || a.localeCompare(b));
}

const tally = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The job note's first line: what this run did, and how many campaigns wait for the next hour. */
export function runLine(
  kept: number,
  searches: number,
  campaigns: number,
  waiting: number,
): string {
  const done = `${tally(kept, "event", "events")} kept from ${tally(searches, "search", "searches")} for ${tally(campaigns, "campaign", "campaigns")}`;
  return waiting
    ? `${done}; ${tally(waiting, "campaign waits", "campaigns wait")} for the next hour.`
    : `${done}.`;
}
