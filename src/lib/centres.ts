// The polling centres the Voters map draws: the database's rows read into centres, which have a
// position, and the dots and shaded areas handed to the map. Pure, so the map only draws.

import type { MyRole } from "@/lib/access";
import { boundsOf, distanceM, type Building, type LngLat, type Ring } from "@/lib/geo";
import { tilesCovering } from "@/lib/house-tiles";
import type { HouseState } from "@/lib/houses";
import { plusCodeCentre } from "@/lib/pluscode";
import { centreAt, type CentreArea } from "@/lib/stations/areas";

/**
 * Where a centre's position came from: the OpenStreetMap school of that name, a close name
 * there that nobody has confirmed yet, an organiser's pin, or an agent standing at the centre.
 */
export type PlacedBy = "osm" | "osm-close" | "organiser" | "agent";

const SOURCES: PlacedBy[] = ["osm", "osm-close", "organiser", "agent"];

export type Placement = {
  at: LngLat;
  by: PlacedBy;
  /** How close the phone said it was, for an agent's position. */
  accuracyM: number | null;
  when: string | null;
  /** The name of whoever placed it, when it can be read. */
  who: string | null;
};

/** An agent's position the phone couldn't confirm, waiting for an organiser. */
export type Suggestion = {
  at: LngLat;
  accuracyM: number | null;
  when: string | null;
  who: string | null;
};

export type Centre = {
  id: string;
  /** The short code agents key on USSD: PS-0001 upwards in IEBC's order. */
  code: string;
  /** IEBC's 13 digits. */
  iebc: string | null;
  name: string;
  wardId: string | null;
  streams: number;
  voters: number;
  /** Null until the centre has a position. */
  placed: Placement | null;
  suggestion: Suggestion | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const whole = (v: unknown): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** A latitude and longitude as the map wants them, [lng, lat]; null unless both are on Earth. */
function point(lat: unknown, lng: unknown): LngLat | null {
  const la = num(lat);
  const ln = num(lng);
  return la !== null && ln !== null && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? [ln, la] : null;
}

/**
 * The centres in polling_stations rows. A row without an id, code or name is left out; a
 * position needs both its coordinates and a source it can name. `names` is user id to name.
 */
export function toCentres(rows: unknown, names: Map<string, string>): Centre[] {
  if (!Array.isArray(rows)) return [];
  const who = (id: unknown) => (typeof id === "string" ? (names.get(id) ?? null) : null);
  const out: Centre[] = [];
  for (const r of rows as unknown[]) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const id = text(x["id"]);
    const code = text(x["code"]);
    const name = text(x["name"]);
    if (!id || !code || !name) continue;
    const at = point(x["lat"], x["lng"]);
    const by = SOURCES.find((s) => s === x["placed_by"]);
    const waiting = point(x["suggested_lat"], x["suggested_lng"]);
    out.push({
      id,
      code,
      iebc: text(x["iebc_code"]),
      name,
      wardId: text(x["ward_id"]),
      streams: whole(x["streams"]),
      voters: whole(x["registered_voters"]),
      placed:
        at && by
          ? {
              at,
              by,
              accuracyM: num(x["placed_accuracy_m"]),
              when: text(x["placed_at"]),
              who: who(x["placed_actor"]),
            }
          : null,
      suggestion: waiting
        ? {
            at: waiting,
            accuracyM: num(x["suggested_accuracy_m"]),
            when: text(x["suggested_at"]),
            who: who(x["suggested_by"]),
          }
        : null,
    });
  }
  return out;
}

/** The tint of the area nearest each centre, and the legend's swatch for it at its drawn strength. */
export const CENTRE_TINT = "hsl(200, 80%, 55%)";
export const CENTRE_SWATCH = "hsla(200, 80%, 55%, 0.35)";

const MIN_DOT = 4;
const MAX_DOT = 24;

/**
 * A centre's dot radius in pixels: bigger for a bigger register, from 4 to 24. Nairobi's
 * centres run from 1 registered voter to about 40,000, with a median near 5,600, so the radius
 * follows the square root: the area of the dot follows the voters.
 */
export function dotSize(voters: number): number {
  const r = MIN_DOT + Math.sqrt(Math.max(voters, 0)) / 9;
  return Math.min(MAX_DOT, Math.round(r * 10) / 10);
}

export type CentreDots = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { code: string; name: string; voters: number; size: number; close: boolean };
    geometry: { type: "Point"; coordinates: LngLat };
  }[];
};

/** A dot for each centre with a position; a close name (not confirmed yet) is drawn hollow. */
export function centreDots(centres: Centre[]): CentreDots {
  return {
    type: "FeatureCollection",
    features: centres.flatMap((c) =>
      c.placed
        ? [
            {
              type: "Feature" as const,
              properties: {
                code: c.code,
                name: c.name,
                voters: c.voters,
                size: dotSize(c.voters),
                close: c.placed.by === "osm-close",
              },
              geometry: { type: "Point" as const, coordinates: c.placed.at },
            },
          ]
        : [],
    ),
  };
}

export type CentreAreaShapes = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { code: string };
    geometry: { type: "MultiPolygon"; coordinates: Ring[][] };
  }[];
};

/** The areas nearest each centre as shapes to draw; one with no polygons, or no centre, isn't. */
export function centreAreaShapes(areas: CentreArea[], centres: Centre[]): CentreAreaShapes {
  const codeOf = new Map(centres.map((c) => [c.id, c.code]));
  return {
    type: "FeatureCollection",
    features: areas.flatMap((a) => {
      const code = codeOf.get(a.id);
      return code && a.polygons.length
        ? [
            {
              type: "Feature" as const,
              properties: { code },
              geometry: { type: "MultiPolygon" as const, coordinates: a.polygons },
            },
          ]
        : [];
    }),
  };
}

/** What came of the doors knocked in 30 days, in one centre's area. */
export type CentreDoors = { knocked: number; rated: number; supporters: number };

/**
 * The doors knocked in 30 days, counted in the area each house stands in (a house's plus code
 * says where it is, so no house file is read): houses knocked, those with a score, and those
 * that score 4 or 5. Every area has an entry; a house outside every area is left out.
 */
export function centreDoors(houses: HouseState[], areas: CentreArea[]): Map<string, CentreDoors> {
  const out = new Map(areas.map((a) => [a.id, { knocked: 0, rated: 0, supporters: 0 }]));
  for (const h of houses) {
    const at = plusCodeCentre(h.pc);
    const doors = out.get((at && centreAt(at, areas)) || "");
    if (!doors) continue;
    doors.knocked += 1;
    if (h.support !== null) {
      doors.rated += 1;
      if (h.support >= 4) doors.supporters += 1;
    }
  }
  return out;
}

/** How many of these houses stand in the area, by where each house's centre is. */
export function housesIn(buildings: Building[], area: CentreArea): number {
  return buildings.filter((b) => centreAt(b.centre, [area]) !== null).length;
}

/**
 * A ward's centres in the two lists the panel shows: those on the map and those not yet, each
 * with the biggest register first and ties by name.
 */
export function wardCentres(
  centres: Centre[],
  wardId: string,
): { placed: Centre[]; waiting: Centre[] } {
  const bySize = (a: Centre, b: Centre) => b.voters - a.voters || a.name.localeCompare(b.name);
  const here = centres.filter((c) => c.wardId === wardId).sort(bySize);
  return { placed: here.filter((c) => c.placed), waiting: here.filter((c) => !c.placed) };
}

/** The candidate, managers and organisers put centres on the map: what the database allows. */
export function canPlaceCentres(role: MyRole): boolean {
  return role === "super" || role === "candidate" || role === "manager" || role === "organiser";
}

/** " on 12 Oct" for a time, in Nairobi; nothing for none. */
function on(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const day = new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Nairobi",
  });
  return ` on ${day}`;
}

const goodTo = (m: number | null) =>
  m === null ? "" : ` (the phone said it was good to ${Math.round(m)} m)`;

/** Where a centre's position came from, in words, for its card. */
export function placementNote(p: Placement): string {
  if (p.by === "osm") return "From OpenStreetMap, where a school has this name.";
  if (p.by === "osm-close")
    return "From OpenStreetMap, but a school with a close name rather than this one's: not confirmed yet.";
  if (p.by === "organiser") return `Placed by ${p.who ?? "an organiser"}${on(p.when)}.`;
  return `Confirmed at the centre by ${p.who ?? "an agent"}${on(p.when)}${goodTo(p.accuracyM)}.`;
}

/** A distance for people: to the nearest 10 m under a kilometre, else in kilometres. */
function far(m: number): string {
  if (m < 10) return "under 10 m";
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** An agent's suggestion, for the organiser deciding on it; `pin` is where the centre is now. */
export function suggestionNote(s: Suggestion, pin: LngLat | null): string {
  const away = pin ? `, about ${far(distanceM(pin, s.at))} from the pin` : "";
  return `${s.who ?? "An agent"} suggested this position${on(s.when)}${goodTo(s.accuracyM)}${away}.`;
}

/** The most house tiles read to count one area's houses; a bigger area isn't counted. */
const MAX_COUNT_TILES = 100;

/**
 * The zoom-16 tiles to read to count the houses in an area; null when it has no outline or
 * would take more than 100 tiles (a rural ward in one piece).
 */
export function tilesToCount(area: CentreArea): { x: number; y: number }[] | null {
  if (!area.polygons.length) return null;
  const tiles = tilesCovering(boundsOf({ type: "MultiPolygon", coordinates: area.polygons }));
  return tiles.length <= MAX_COUNT_TILES ? tiles : null;
}

/** How far from a phone the field app looks for polling centres. */
export const NEAR_M = 2000;

/**
 * The centres near a phone: those on the map within `radiusM`, nearest first with the metres to
 * each; and the centres of the ward it is in that aren't on the map yet (biggest register
 * first), which an agent standing at one can place.
 */
export function centresNear(
  centres: Centre[],
  at: LngLat,
  wardId: string | null,
  radiusM = NEAR_M,
): { near: { centre: Centre; metres: number }[]; waiting: Centre[] } {
  const near = centres
    .flatMap((c) => (c.placed ? [{ centre: c, metres: distanceM(at, c.placed.at) }] : []))
    .filter((n) => n.metres <= radiusM)
    .sort((a, b) => a.metres - b.metres)
    .map((n) => ({ centre: n.centre, metres: Math.round(n.metres) }));
  return { near, waiting: wardId ? wardCentres(centres, wardId).waiting : [] };
}

/** What the database's station_here asks of a phone: a fix this good, and this near the ward. */
export const HERE_ACCURACY_M = 50;
export const HERE_OUTSIDE_M = 300;

/** What station_here answered: the position became the centre's, or was kept, and why. */
export type HereResult = { moved: boolean; why: "accuracy" | "distance" | "no-ward" | null };

/** What an agent is told after "I'm here". */
export function hereMessage(r: HereResult, accuracyM: number | null): string {
  if (r.moved) return "Thank you: the centre is now where you are.";
  if (r.why === "accuracy") {
    const sure =
      accuracyM === null
        ? "Your phone didn't say how sure it was"
        : `Your phone is only sure to ${Math.round(accuracyM)} m`;
    return `${sure}, and a centre needs ${HERE_ACCURACY_M} m or better, so your position is kept for an organiser to check. Try again in the open.`;
  }
  if (r.why === "distance")
    return `You are more than ${HERE_OUTSIDE_M} m outside this centre's ward, so your position is kept for an organiser to check.`;
  return "Your position is kept for an organiser to check.";
}
