// The polling centres the Voters map draws: the database's rows read into centres, which have a
// position, and the dots and shaded areas handed to the map. Pure, so the map only draws.

import type { LngLat, Ring } from "@/lib/geo";
import type { CentreArea } from "@/lib/stations/areas";

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
