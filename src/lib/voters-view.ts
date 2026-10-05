// The Voters screen's rules: the area, view and filters the address holds, an
// area's numbers, who in it matches the filters, the views a role sees, and
// the links in and out. Pure.

export type Area =
  { level: "county" } | { level: "constituency"; name: string } | { level: "ward"; slug: string };

export type VotersView = "people" | "doors" | "wards";
export type SupportFilter = "strong" | "persuadable" | "against" | "unscored";
export type ConsentFilter = "sms" | "whatsapp" | "call" | "none";
export type ContactFilter = "week" | "month" | "never";

export type VotersSearch = {
  area?: string;
  view?: VotersView;
  support?: SupportFilter;
  consent?: ConsentFilter;
  contact?: ContactFilter;
  person?: string;
  manage?: true;
};

const VIEWS: VotersView[] = ["people", "doors", "wards"];
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
  const view = pick(raw["view"], VIEWS);
  if (view) out.view = view;
  const support = pick(raw["support"], SUPPORT);
  if (support) out.support = support;
  const consent = pick(raw["consent"], CONSENT);
  if (consent) out.consent = consent;
  const contact = pick(raw["contact"], CONTACT);
  if (contact) out.contact = contact;
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

export function areaTitle(a: Area, wards: WardInfo[]): string {
  if (a.level === "constituency") return a.name;
  const w = wardOf(a, wards);
  return w ? `${w.name} ward` : "Nairobi County";
}

/** Nairobi County › constituency › ward, each step an area to go back to. */
export function crumbsOf(a: Area, wards: WardInfo[]): { label: string; area: Area }[] {
  const out: { label: string; area: Area }[] = [
    { label: "Nairobi County", area: { level: "county" } },
  ];
  const w = wardOf(a, wards);
  const constituency = a.level === "constituency" ? a.name : w?.constituency;
  if (constituency)
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
  const people = sum(d, (x) => x.people);
  return {
    registered: sum(inside, (w) => w.registered),
    target: sum(inside, (w) => w.target),
    onFile: sum(inside, (w) => w.people),
    supporters: sum(inside, (w) => w.supporters),
    doors: sum(d, (x) => x.doors30),
    coverage: people ? sum(d, (x) => x.knocked) / people : inside.length ? 0 : null,
  };
}

/** Agents get the doors; above a ward everyone else also gets every ward by the numbers. */
export const viewsFor = (isAgent: boolean, a: Area): VotersView[] =>
  isAgent ? ["doors"] : a.level === "ward" ? ["people", "doors"] : ["people", "doors", "wards"];

export function viewOf(search: VotersSearch, isAgent: boolean, a: Area): VotersView {
  const views = viewsFor(isAgent, a);
  if (search.view && views.includes(search.view)) return search.view;
  if (isAgent) return "doors";
  return a.level === "ward" ? "people" : "wards";
}

export type PersonLike = {
  ward: string | null;
  constituency: string | null;
  support: number;
  channels: string[];
  optedOut: boolean;
  lastTouch: string | null;
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
  f: { support?: SupportFilter; consent?: ConsentFilter; contact?: ContactFilter },
  now: number,
): boolean {
  if (!inArea(r.ward, a, wards)) return false;
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
  return person ? { view: "people", person } : { view: "people" };
};

export type SearchChanges = { [K in keyof VotersSearch]?: VotersSearch[K] | undefined };

/** The address with `changes` applied; an undefined change removes its key. */
export function nextSearch(prev: VotersSearch, changes: SearchChanges): VotersSearch {
  const out: Record<string, unknown> = { ...prev };
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
 * How a change moves the page: a new area or view is a step Back can undo,
 * and only a new area goes back to the top, where its title and numbers are.
 */
export function stepFor(changes: SearchChanges): { replace: boolean; resetScroll: boolean } {
  const area = "area" in changes;
  return { replace: !(area || "view" in changes), resetScroll: area };
}
