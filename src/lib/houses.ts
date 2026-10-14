// The Voters map's colours and counts for houses and wards. A house takes the
// outcome of its latest visit in 30 days, and the last score it gave in them; a
// ward is shaded by the share of its houses knocked, or by the supporters among
// its doors that gave a score. "Doors first" ranks wards by houses not yet
// knocked. Nothing is guessed: no data is grey, and the legend says so. Pure.

export type Outcome = "spoke" | "not_home" | "refused";
export type Colour = "doors" | "support" | "vote";

export type Band = 0 | 1 | 2 | 3 | 4 | 5;

/** The 0-100 score back on the 1-5 door scale; 0 when unknown. The inverse of SUPPORT_SCORE. */
export function band(score: number): Band {
  if (!score || score <= 0) return 0;
  if (score >= 85) return 5;
  if (score >= 62) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export const BAND_COLOUR: Record<Exclude<Band, 0>, string> = {
  1: "hsl(0, 80%, 55%)",
  2: "hsl(22, 90%, 57%)",
  3: "hsl(45, 95%, 56%)",
  4: "hsl(95, 60%, 48%)",
  5: "hsl(142, 70%, 42%)",
};

/**
 * A ward's doors: each house's latest outcome and last score in 30 days, and the
 * visits of this week.
 */
export type WardDoors = {
  wardId: string;
  knocked: number;
  rated: number;
  supporters: number;
  doorsWeek: number;
  agentsToday: string[];
};

/** A house's latest visit in 30 days, with the last score it gave in them. */
export type HouseState = { pc: string; at: string; outcome: Outcome; support: number | null };

/** One visit at a house, for its card. */
export type HouseVisit = {
  at: string;
  agent: string | null;
  outcome: Outcome;
  support: number | null;
  issue: string | null;
  person: { id: string; name: string } | null;
};

export type LegendItem = { label: string; colour: string };

/** A ward with this share of its houses knocked in 30 days is shaded full green. */
export const DOORS_FULL = 0.4;
export const NO_DATA = "hsl(0, 0%, 80%)";
export const NO_SCORE = "hsl(150, 6%, 70%)";
export const PLAIN = "hsl(0, 0%, 100%)";
/** An outline at least this big is often several homes: a block of flats, a plot of rooms. */
export const BLOCK_M2 = 200;

/** The house card's note for an outline big enough to be several homes; null below BLOCK_M2. */
export function blockNote(m2: number | null): string | null {
  return m2 !== null && m2 >= BLOCK_M2
    ? `This outline covers ${new Intl.NumberFormat("en-KE").format(m2)} m², often several homes: log each household as its own visit.`
    : null;
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  spoke: "Spoke",
  not_home: "Not home",
  refused: "Refused",
};

export const OUTCOME_COLOUR: Record<Outcome, string> = {
  spoke: "hsl(142, 62%, 40%)",
  not_home: "hsl(200, 85%, 62%)",
  refused: "hsl(0, 72%, 55%)",
};

const RED = [0, 72, 52];
const AMBER = [40, 92, 52];
const GREEN = [142, 62, 40];

/** Red at 0, amber at 0.5, green at 1; clamped, and NaN reads as 0. */
export function scaleColour(t: number): string {
  const x = Number.isNaN(t) ? 0 : Math.min(Math.max(t, 0), 1);
  const [from, to, u] = x <= 0.5 ? [RED, AMBER, x / 0.5] : [AMBER, GREEN, (x - 0.5) / 0.5];
  const [h, s, l] = from.map((v, i) => Math.round(v + (to[i]! - v) * u));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** A house's fill for the colour on show; null for the 2022 vote, which shades wards only. */
export function houseColour(colour: Colour, h: HouseState): string | null {
  if (colour === "doors") return OUTCOME_COLOUR[h.outcome];
  if (colour === "support") {
    const s = h.support;
    return s !== null && s >= 1 && s <= 5 ? BAND_COLOUR[s as 1 | 2 | 3 | 4 | 5] : NO_SCORE;
  }
  return null;
}

/** A ward's fill: the share of its houses knocked, or of its scored doors that support us. */
export function wardShade(colour: Colour, houses: number, d: WardDoors | undefined): string {
  if (colour === "doors")
    return houses > 0 ? scaleColour((d?.knocked ?? 0) / houses / DOORS_FULL) : NO_DATA;
  if (colour === "support") return d && d.rated > 0 ? scaleColour(d.supporters / d.rated) : NO_DATA;
  return NO_DATA;
}

const NOT_KNOCKED: LegendItem = { label: "Not knocked in 30 days", colour: PLAIN };

/** What a house's colour means, at street level. */
export function houseLegend(colour: Colour): LegendItem[] {
  if (colour === "support")
    return [
      { label: "1 against", colour: BAND_COLOUR[1] },
      { label: "3 undecided", colour: BAND_COLOUR[3] },
      { label: "5 strong", colour: BAND_COLOUR[5] },
      { label: "No score", colour: NO_SCORE },
      NOT_KNOCKED,
    ];
  if (colour === "doors")
    return [
      { label: OUTCOME_LABEL.spoke, colour: OUTCOME_COLOUR.spoke },
      { label: OUTCOME_LABEL.not_home, colour: OUTCOME_COLOUR.not_home },
      { label: OUTCOME_LABEL.refused, colour: OUTCOME_COLOUR.refused },
      NOT_KNOCKED,
    ];
  return [];
}

/** What a ward's colour means, above street level. */
export function wardLegend(colour: Colour): LegendItem[] {
  if (colour === "support")
    return [
      { label: "No supporters among doors scored", colour: scaleColour(0) },
      { label: "Half", colour: scaleColour(0.5) },
      { label: "All supporters", colour: scaleColour(1) },
      { label: "No doors scored", colour: NO_DATA },
    ];
  if (colour === "doors")
    return [
      { label: "No houses knocked", colour: scaleColour(0) },
      { label: "20% of houses", colour: scaleColour(0.5) },
      { label: "40% or more", colour: scaleColour(1) },
      { label: "No houses on the map", colour: NO_DATA },
    ];
  return [];
}

export type WardRef = { id: string; slug: string; name: string };
export type DoorsFirstRow = {
  wardId: string;
  slug: string;
  name: string;
  houses: number;
  knocked: number;
  notKnocked: number;
};

/** The wards with the most houses not knocked in 30 days; a ward with no house count is left out. */
export function doorsFirst(
  wards: WardRef[],
  houses: Record<string, number>,
  doors: WardDoors[],
  max = 6,
): DoorsFirstRow[] {
  const byWard = new Map(doors.map((d) => [d.wardId, d]));
  return wards
    .filter((w) => (houses[w.slug] ?? 0) > 0)
    .map((w) => {
      const total = houses[w.slug]!;
      const knocked = Math.min(byWard.get(w.id)?.knocked ?? 0, total);
      return {
        wardId: w.id,
        slug: w.slug,
        name: w.name,
        houses: total,
        knocked,
        notKnocked: total - knocked,
      };
    })
    .sort((a, b) => b.notKnocked - a.notKnocked || a.name.localeCompare(b.name))
    .slice(0, max);
}

export type DoorTotals = {
  houses: number;
  knocked: number;
  rated: number;
  supporters: number;
  doorsWeek: number;
  agentsToday: number;
};

/** The doors across some wards; an agent out in two of them counts once. */
export function doorTotals(
  wards: { id: string; slug: string }[],
  houses: Record<string, number>,
  doors: WardDoors[],
): DoorTotals {
  const ids = new Set(wards.map((w) => w.id));
  const inside = doors.filter((d) => ids.has(d.wardId));
  const sum = (f: (d: WardDoors) => number) => inside.reduce((t, d) => t + f(d), 0);
  return {
    houses: wards.reduce((t, w) => t + (houses[w.slug] ?? 0), 0),
    knocked: sum((d) => d.knocked),
    rated: sum((d) => d.rated),
    supporters: sum((d) => d.supporters),
    doorsWeek: sum((d) => d.doorsWeek),
    agentsToday: new Set(inside.flatMap((d) => d.agentsToday)).size,
  };
}

export const isOutcome = (v: unknown): v is Outcome =>
  v === "spoke" || v === "not_home" || v === "refused";

const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;

/** house_doors() rows; a row without a ward or with a bad count is left out. */
export function toWardDoors(rows: unknown): WardDoors[] {
  if (!Array.isArray(rows)) return [];
  const out: WardDoors[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const knocked = count(r["knocked"]);
    const rated = count(r["rated"]);
    const supporters = count(r["supporters"]);
    const doorsWeek = count(r["doors_week"]);
    if (typeof r["ward_id"] !== "string" || knocked === null || rated === null) continue;
    if (supporters === null || doorsWeek === null) continue;
    const agents = Array.isArray(r["agents_today"]) ? r["agents_today"] : [];
    out.push({
      wardId: r["ward_id"],
      knocked,
      rated,
      supporters,
      doorsWeek,
      agentsToday: agents.filter((a): a is string => typeof a === "string"),
    });
  }
  return out;
}

/** ward_houses() rows; a row without a house, a time or a known outcome is left out. */
export function toHouseStates(rows: unknown): HouseState[] {
  if (!Array.isArray(rows)) return [];
  const out: HouseState[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const s = r["support"];
    if (typeof r["pc"] !== "string" || typeof r["visited_at"] !== "string") continue;
    if (!isOutcome(r["outcome"])) continue;
    out.push({
      pc: r["pc"],
      at: r["visited_at"],
      outcome: r["outcome"],
      support: typeof s === "number" && s >= 1 && s <= 5 ? s : null,
    });
  }
  return out;
}
