// The Voters screen's rules: the area, tab, house and filters the address
// holds, an area's numbers, who in it matches the filters, and the links in
// and out. Pure.

import type { Colour } from "@/lib/houses";
import type { Top } from "@/lib/map-areas";
import { PLUS_CODE } from "@/lib/pluscode";
import type { Basemap } from "@/lib/voters-map";

export type Area =
  { level: "county" } | { level: "constituency"; name: string } | { level: "ward"; slug: string };

export type SupportFilter = "strong" | "persuadable" | "against" | "unscored";
export type ConsentFilter = "sms" | "whatsapp" | "call" | "none";
export type ContactFilter = "week" | "month" | "never";

export type VotersSearch = {
  area?: string;
  /** The People tab; the map when not set. */
  tab?: "people";
  /** The house whose card is open, by its plus code. */
  house?: string;
  /** The polling centre whose card is open, by its short code (PS-0042). */
  centre?: string;
  /** The walk list whose card is open, by its id. */
  list?: string;
  /** What the map is coloured by; doors when not set. */
  colour?: Colour;
  /** The base map; satellite when not set. */
  base?: Basemap;
  support?: SupportFilter;
  consent?: ConsentFilter;
  contact?: ContactFilter;
  /** A group (segment) slug. */
  segment?: string;
  person?: string;
  manage?: true;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A polling centre's short code: PS-0042, or SAMPLE-0001 for a sample the team kept. */
const CENTRE_CODE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

const COLOURS: Colour[] = ["doors", "support", "vote"];
const BASES: Basemap[] = ["satellite", "streets"];
const SUPPORT: SupportFilter[] = ["strong", "persuadable", "against", "unscored"];
const CONSENT: ConsentFilter[] = ["sms", "whatsapp", "call", "none"];
const CONTACT: ContactFilter[] = ["week", "month", "never"];

const pick = <T extends string>(v: unknown, allowed: T[]): T | undefined =>
  typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : undefined;

/** The address's search, with anything unknown dropped. */
export function validateVotersSearch(raw: Record<string, unknown>): VotersSearch {
  const out: VotersSearch = {};
  const area = raw["area"];
  if (typeof area === "string" && /^(c:.{2,60}|w:[a-z0-9-]{2,60})$/.test(area)) out.area = area;
  // Before the map, view=people was the People list; view=doors and view=wards now open the map.
  if (raw["tab"] === "people" || raw["view"] === "people") out.tab = "people";
  const house = typeof raw["house"] === "string" ? raw["house"].trim().toUpperCase() : "";
  if (PLUS_CODE.test(house)) out.house = house;
  const centre = typeof raw["centre"] === "string" ? raw["centre"].trim().toUpperCase() : "";
  if (CENTRE_CODE.test(centre)) out.centre = centre;
  const list = raw["list"];
  if (typeof list === "string" && UUID.test(list)) out.list = list.toLowerCase();
  const colour = pick(raw["colour"], COLOURS);
  if (colour) out.colour = colour;
  const base = pick(raw["base"], BASES);
  if (base) out.base = base;
  const support = pick(raw["support"], SUPPORT);
  if (support) out.support = support;
  const consent = pick(raw["consent"], CONSENT);
  if (consent) out.consent = consent;
  const contact = pick(raw["contact"], CONTACT);
  if (contact) out.contact = contact;
  const segment = raw["segment"];
  if (typeof segment === "string" && /^[a-z0-9-]{1,40}$/.test(segment)) out.segment = segment;
  const person = raw["person"];
  if (typeof person === "string" && /^[A-Za-z0-9-]{1,64}$/.test(person)) out.person = person;
  if (raw["manage"] === true || raw["manage"] === 1 || raw["manage"] === "1") out.manage = true;
  return out;
}

export type WardInfo = {
  id: string;
  slug: string;
  name: string;
  constituency: string;
  registered: number;
  target: number;
  supporters: number;
  people: number;
  contacted: number;
};

/** The area an address names; anything it doesn't know is the county. */
export function parseArea(param: string | undefined, wards: WardInfo[]): Area {
  if (param?.startsWith("w:")) {
    const slug = param.slice(2);
    return wards.some((w) => w.slug === slug) ? { level: "ward", slug } : { level: "county" };
  }
  if (param?.startsWith("c:")) {
    const name = param.slice(2);
    return wards.some((w) => w.constituency === name)
      ? { level: "constituency", name }
      : { level: "county" };
  }
  return { level: "county" };
}

export const areaParam = (a: Area): string | undefined =>
  a.level === "ward" ? `w:${a.slug}` : a.level === "constituency" ? `c:${a.name}` : undefined;

export const wardsIn = (a: Area, wards: WardInfo[]): WardInfo[] =>
  a.level === "ward"
    ? wards.filter((w) => w.slug === a.slug)
    : a.level === "constituency"
      ? wards.filter((w) => w.constituency === a.name)
      : wards;

const wardOf = (a: Area, wards: WardInfo[]) =>
  a.level === "ward" ? wards.find((w) => w.slug === a.slug) : undefined;

/** The top of the campaign's map: its name, and whether it is a county or one constituency. */
export type Home = { name: string; top: Top };
const NAIROBI: Home = { name: "Nairobi County", top: "county" };

export function areaTitle(a: Area, wards: WardInfo[], home: Home = NAIROBI): string {
  if (a.level === "constituency") return a.name;
  const w = wardOf(a, wards);
  return w ? `${w.name} ward` : home.name;
}

/** Nairobi County › constituency › ward, each step an area to go back to. */
export function crumbsOf(
  a: Area,
  wards: WardInfo[],
  home: Home = NAIROBI,
): { label: string; area: Area }[] {
  const out: { label: string; area: Area }[] = [{ label: home.name, area: { level: "county" } }];
  const w = wardOf(a, wards);
  const constituency = a.level === "constituency" ? a.name : w?.constituency;
  // A constituency's map (Mathira) is its own top: no second crumb for it.
  if (constituency && home.top === "county")
    out.push({ label: constituency, area: { level: "constituency", name: constituency } });
  if (w) out.push({ label: `${w.name} ward`, area: { level: "ward", slug: w.slug } });
  return out;
}

export type DoorWard = { id: string; people: number; knocked: number; doors30: number };

/** The area's headline numbers; coverage is the share of people on file seen in 30 days. */
export function areaNumbers(
  a: Area,
  wards: WardInfo[],
  doors: DoorWard[],
  /** People not yet placed in a ward: only the county counts them. */
  unplaced?: { people: number; knocked: number; doors30: number },
): {
  registered: number;
  target: number;
  onFile: number;
  supporters: number;
  doors: number;
  coverage: number | null;
} {
  const inside = wardsIn(a, wards);
  const ids = new Set(inside.map((w) => w.id));
  const d = doors.filter((x) => ids.has(x.id));
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
  const extra = a.level === "county" && unplaced ? unplaced : { people: 0, knocked: 0, doors30: 0 };
  const people = sum(d, (x) => x.people) + extra.people;
  return {
    registered: sum(inside, (w) => w.registered),
    target: sum(inside, (w) => w.target),
    onFile: sum(inside, (w) => w.people) + extra.people,
    supporters: sum(inside, (w) => w.supporters),
    doors: sum(d, (x) => x.doors30) + extra.doors30,
    coverage: people
      ? (sum(d, (x) => x.knocked) + extra.knocked) / people
      : inside.length
        ? 0
        : null,
  };
}

export type PersonLike = {
  ward: string | null;
  constituency: string | null;
  support: number;
  channels: string[];
  optedOut: boolean;
  lastTouch: string | null;
  segment: string | null;
};

/** Whether a ward, by name, is in the area. */
export function inArea(wardName: string | null, a: Area, wards: WardInfo[]): boolean {
  if (a.level === "county") return true;
  return wardsIn(a, wards).some((w) => w.name === wardName);
}

const CHANNEL: Record<Exclude<ConsentFilter, "none">, string> = {
  sms: "SMS",
  whatsapp: "WA",
  call: "Call",
};

export function matchPerson(
  r: PersonLike,
  a: Area,
  wards: WardInfo[],
  f: {
    support?: SupportFilter;
    consent?: ConsentFilter;
    contact?: ContactFilter;
    segment?: string;
  },
  now: number,
): boolean {
  if (!inArea(r.ward, a, wards)) return false;
  if (f.segment && r.segment !== f.segment) return false;
  if (f.support === "strong" && r.support < 70) return false;
  if (f.support === "persuadable" && (r.support < 40 || r.support >= 70)) return false;
  if (f.support === "against" && (r.support <= 0 || r.support >= 40)) return false;
  if (f.support === "unscored" && r.support > 0) return false;
  if (f.consent === "none" && (r.optedOut ? false : r.channels.length > 0)) return false;
  if (f.consent && f.consent !== "none" && (r.optedOut || !r.channels.includes(CHANNEL[f.consent])))
    return false;
  const age = r.lastTouch ? (now - Date.parse(r.lastTouch)) / 864e5 : Infinity;
  if (f.contact === "week" && age > 7) return false;
  if (f.contact === "month" && age > 30) return false;
  if (f.contact === "never" && age !== Infinity) return false;
  return true;
}

export type BroadcastSearch = { wards?: string; support?: "strong" | "persuadable" | "both" };

/** Broadcast with the area's wards and, when asked, a support band chosen. */
export function broadcastSearch(
  a: Area,
  wards: WardInfo[],
  support?: SupportFilter,
): BroadcastSearch {
  const out: BroadcastSearch = {};
  if (a.level !== "county")
    out.wards = wardsIn(a, wards)
      .map((w) => w.id)
      .join(",");
  if (support === "strong" || support === "persuadable") out.support = support;
  return out;
}

/** What Broadcast starts from: the wards and bands a link chose, else everyone strong or persuadable. */
export function parseBroadcastSearch(raw: Record<string, unknown>): {
  wardIds: string[];
  strong: boolean;
  persuadable: boolean;
} {
  const wards = typeof raw["wards"] === "string" ? raw["wards"] : "";
  const wardIds = wards
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9-]{1,64}$/.test(s))
    .slice(0, 200);
  const support = raw["support"];
  return {
    wardIds,
    strong: support !== "persuadable",
    persuadable: support !== "strong",
  };
}

/** Where an old People link lands on Voters. */
export const peopleForward = (raw: Record<string, unknown>): VotersSearch => {
  const person = validateVotersSearch({ person: raw["person"] }).person;
  return person ? { tab: "people", person } : { tab: "people" };
};

export type SearchChanges = { [K in keyof VotersSearch]?: VotersSearch[K] | undefined };

/** The address with `changes` applied; an undefined change removes its key. */
export function nextSearch(prev: VotersSearch, changes: SearchChanges): VotersSearch {
  // The router hands back keys the address had but the screen doesn't keep (an
  // old view=people would reopen the People tab): clean them out first.
  const out: Record<string, unknown> = { ...validateVotersSearch(prev) };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return validateVotersSearch(out);
}

/** What came up at the door across the area's wards, most first. */
export function doorIssues(
  canvassWards: { name: string; issues: { name: string; count: number }[] }[],
  a: Area,
  wards: WardInfo[],
  max = 8,
): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const w of canvassWards) {
    if (!inArea(w.name, a, wards)) continue;
    for (const i of w.issues) m.set(i.name, (m.get(i.name) ?? 0) + i.count);
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name))
    .slice(0, max);
}

/** A share as a whole percentage; one too small to round up reads "under 1%", not "0%". */
export const share = (x: number): string =>
  x > 0 && x < 0.005 ? "under 1%" : `${Math.round(x * 100)}%`;

/**
 * Of the supporters a campaign finds, the share who vote on the day. Not all do, so the
 * supporters to find for a number of votes needed are a quarter more than the votes.
 */
export const SUPPORTERS_WHO_VOTE = 0.8;

/** The supporters to find so that `votes` of them vote. */
export const toFind = (votes: number): number =>
  votes > 0 ? Math.ceil(votes / SUPPORTERS_WHO_VOTE) : 0;

const whole = (n: number) => Math.round(n).toLocaleString("en-KE");

/**
 * How an area's target is worked out, in words: the votes needed against the register, the
 * turnout that makes them half the votes, and the supporters to find. Null with no target.
 */
export function targetWords(n: { registered: number; target: number }): string | null {
  if (n.target <= 0) return null;
  const find = `To have ${whole(n.target)} votes on the day, find ${whole(toFind(n.target))} supporters: about one supporter in five doesn't vote.`;
  if (n.registered <= 0) return `${whole(n.target)} votes are needed here. ${find}`;
  const r = n.target / n.registered;
  const half =
    r < 0.5
      ? `half the votes cast if ${Math.round(r * 200)}% of them vote`
      : "more than half of everyone registered";
  return `${whole(n.target)} votes are needed here: ${share(r)} of the ${whole(n.registered)} registered voters, which is ${half}. ${find}`;
}

/**
 * How a change moves the page: a new area, tab, house, centre or walk list is a step Back
 * can undo, and a new area or tab goes back to the top, where its title is.
 */
export function stepFor(changes: SearchChanges): { replace: boolean; resetScroll: boolean } {
  const top = "area" in changes || "tab" in changes;
  return {
    replace: !(top || "house" in changes || "centre" in changes || "list" in changes),
    resetScroll: top,
  };
}

/** The page to show: a list that got shorter brings a page past its end back to its last page. */
export const pageWithin = (page: number, count: number, size: number): number =>
  Math.min(page, Math.max(Math.ceil(count / size), 1) - 1);
