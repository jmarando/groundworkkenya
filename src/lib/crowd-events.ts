// Crowd events: the funerals, church events, harambees, tournaments, shows and school days in a
// campaign's area where a candidate can meet people without a rally. The searches that look for
// them, the instructions the AI reads them with, and the checks every event it names must pass
// before it is kept: a date within the next three weeks, a link among the search's own results,
// a ward that is one of the campaign's. Pure. See
// docs/superpowers/specs/2026-11-20-crowd-events-design.md.

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
        required: ["kind", "title", "date", "time", "place", "ward", "crowd", "why", "url"],
        properties: {
          kind: { type: "string", enum: [...CROWD_KINDS] },
          title: { type: "string" },
          date: { type: "string" },
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
- "date" is the event's day as YYYY-MM-DD. It must be stated, or follow plainly from the result (for example "this Saturday" in an article published on a known day). Leave out events with no date you can be sure of, events before ${today} or after ${last}, and reports of gatherings that already happened.
- Leave out events outside ${area.county} County and anything that is not a gathering (statements, court cases, appointments).
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

/** The event's name and day, folded, so the same event found twice is kept once. */
export const dedupeKey = (title: string, day: string): string =>
  `${slugify(title).slice(0, 100) || "event"}|${day}`;

/**
 * The events the AI named that pass every check, as crowd_events rows: a kind it knows, a title,
 * a real day from today to three weeks ahead, a link among the search's own results, a ward that
 * is one of the campaign's (or none). The same event twice is kept once.
 */
export function cleanCrowdEvents(
  answer: unknown,
  hits: CrowdHit[],
  area: CrowdArea,
  today: string,
): CrowdEventRow[] {
  const events = (answer as Partial<CrowdAnswer> | null)?.events;
  if (!Array.isArray(events)) return [];
  const byUrl = new Map(hits.map((h) => [h.url, h]));
  const wardBySlug = new Map(area.wards.map((w) => [w.slug, w.id]));
  const last = addDays(today, AHEAD_DAYS);
  const seen = new Set<string>();
  const out: CrowdEventRow[] = [];
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const kind = CROWD_KINDS.find((k) => k === e.kind);
    const title = clip(e.title, 160);
    const day = typeof e.date === "string" ? e.date.trim() : "";
    const hit = typeof e.url === "string" ? byUrl.get(e.url.trim()) : undefined;
    if (!kind || !title || title.length < 2 || !hit) continue;
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) continue;
    if (day < today || day > last) continue;
    const time = typeof e.time === "string" && TIME.test(e.time.trim()) ? e.time.trim() : null;
    const ward = typeof e.ward === "string" ? (wardBySlug.get(slugify(e.ward)) ?? null) : null;
    const dedupe = dedupeKey(title, day);
    if (seen.has(dedupe)) continue;
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
  return out;
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
