// The Voters map's rules: which level a zoom shows, the area under a point,
// where the camera goes for an area or a house, what a click does (said on the
// map, as AGENTS.md asks), the constituency names drawn at the top level, and
// search. Pure, so the map component only draws.

import { wardAt, type Box, type LngLat, type WardShape } from "@/lib/geo";
import type { Top } from "@/lib/map-areas";
import { plusCodeCentre } from "@/lib/pluscode";
import type { Area } from "@/lib/voters-view";

export type Basemap = "satellite" | "streets";
export type Level = "area" | "constituency" | "ward" | "street";

export const MIN_ZOOM = 8;
export const CONSTITUENCY_ZOOM = 11;
export const WARD_ZOOM = 13;
export const STREET_ZOOM = 16;
export const MAX_ZOOM = 20;
/** A house opens close enough to see its neighbours. */
export const HOUSE_ZOOM_OPEN = 18;

/** The level a zoom shows. A constituency's map (Mathira) starts at the constituency. */
export function levelFor(zoom: number, top: Top): Level {
  if (zoom < CONSTITUENCY_ZOOM) return top === "constituency" ? "constituency" : "area";
  if (zoom < WARD_ZOOM) return "constituency";
  if (zoom < STREET_ZOOM) return "ward";
  return "street";
}

type WardRef = { slug: string; constituency: string };

/**
 * The area under a point at a level: the whole map at the top, the ward's
 * constituency (or the whole map, for a constituency's map) one level down,
 * else the ward. Null when no ward is under the point: keep the area on show.
 */
export function areaAt(
  level: Level,
  p: LngLat,
  shapes: WardShape[],
  wards: WardRef[],
  top: Top,
): Area | null {
  if (level === "area") return { level: "county" };
  const shape = wardAt(p, shapes);
  if (!shape) return null;
  if (level === "constituency") {
    if (top === "constituency") return { level: "county" };
    const name = wards.find((w) => w.slug === shape.slug)?.constituency;
    return name ? { level: "constituency", name } : null;
  }
  return { level: "ward", slug: shape.slug };
}

export type CameraTarget =
  | { kind: "point"; center: LngLat; zoom: number }
  | { kind: "box"; box: Box; minZoom: number; maxZoom: number };

const union = (boxes: Box[]): Box | null =>
  boxes.length
    ? {
        west: Math.min(...boxes.map((b) => b.west)),
        south: Math.min(...boxes.map((b) => b.south)),
        east: Math.max(...boxes.map((b) => b.east)),
        north: Math.max(...boxes.map((b) => b.north)),
      }
    : null;

/** Where the camera goes: a house, a ward, a constituency, else the whole map area. */
export function cameraFor(
  at: { area: Area; house?: string | null },
  wards: WardRef[],
  shapes: WardShape[],
  mapArea: { bounds: [number, number, number, number]; top: Top },
): CameraTarget {
  const centre = at.house ? plusCodeCentre(at.house) : null;
  if (centre) return { kind: "point", center: centre, zoom: HOUSE_ZOOM_OPEN };
  const { area } = at;
  if (area.level === "ward") {
    const box = shapes.find((s) => s.slug === area.slug)?.box;
    if (box) return { kind: "box", box, minZoom: WARD_ZOOM, maxZoom: STREET_ZOOM - 0.1 };
  }
  if (area.level === "constituency") {
    const slugs = new Set(wards.filter((w) => w.constituency === area.name).map((w) => w.slug));
    const box = union(shapes.filter((s) => slugs.has(s.slug)).map((s) => s.box));
    if (box) return { kind: "box", box, minZoom: CONSTITUENCY_ZOOM, maxZoom: WARD_ZOOM - 0.1 };
  }
  const [west, south, east, north] = mapArea.bounds;
  return {
    kind: "box",
    box: { west, south, east, north },
    minZoom: MIN_ZOOM,
    maxZoom: (mapArea.top === "constituency" ? WARD_ZOOM : CONSTITUENCY_ZOOM) - 0.1,
  };
}

/** What a click does at the level on show, said on the map. */
export function hintFor(level: Level, top: Top): string {
  if (level === "street") return "Click a house to open it";
  if (level === "ward") return "Zoom in, or click, to see the houses";
  if (level === "constituency" || top === "constituency") return "Click a ward to drop in";
  return "Click a ward to drop in, or a constituency's name";
}

export type LabelPoints = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { name: string };
    geometry: { type: "Point"; coordinates: LngLat };
  }[];
};

/** A point in the middle of each constituency's wards, for its name at the top level. */
export function constituencyLabels(shapes: WardShape[], wards: WardRef[]): LabelPoints {
  const boxes = new Map<string, Box[]>();
  for (const s of shapes) {
    const name = wards.find((w) => w.slug === s.slug)?.constituency;
    if (name) boxes.set(name, [...(boxes.get(name) ?? []), s.box]);
  }
  return {
    type: "FeatureCollection",
    features: [...boxes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, bs]) => {
        const b = union(bs)!;
        return {
          type: "Feature" as const,
          properties: { name },
          geometry: {
            type: "Point" as const,
            coordinates: [(b.west + b.east) / 2, (b.south + b.north) / 2] as LngLat,
          },
        };
      }),
  };
}

export type SearchHit =
  | { kind: "ward"; slug: string; label: string; sub: string }
  | { kind: "constituency"; name: string; label: string; sub: string }
  | {
      kind: "person";
      id: string;
      label: string;
      sub: string;
      house: string | null;
      wardSlug: string | null;
    }
  | { kind: "place"; label: string; sub: string; center: LngLat };

type SearchWard = { slug: string; name: string; constituency: string };
type SearchPerson = {
  id: string;
  name: string;
  phone: string;
  ward: string | null;
  house: string | null;
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Wards and constituencies by name, and people by name, or by their number
 * when four or more digits are typed. At most `max` of each kind.
 */
export function searchHits(
  q: string,
  wards: SearchWard[],
  people: SearchPerson[],
  top: Top,
  max = 5,
): SearchHit[] {
  const needle = fold(q);
  if (!needle) return [];
  const digits = q.replace(/\D/g, "");
  // Typed the local way (0733…) or the international way (254733…), numbers are kept +254….
  const local = digits.replace(/^(?:254|0)/, "");
  const out: SearchHit[] = [];
  out.push(
    ...wards
      .filter((w) => fold(w.name).includes(needle))
      .slice(0, max)
      .map((w) => ({
        kind: "ward" as const,
        slug: w.slug,
        label: `${w.name} ward`,
        sub: top === "constituency" ? "Ward" : w.constituency,
      })),
  );
  if (top === "county") {
    const names = [...new Set(wards.map((w) => w.constituency))].sort();
    out.push(
      ...names
        .filter((n) => fold(n).includes(needle))
        .slice(0, max)
        .map((n) => ({ kind: "constituency" as const, name: n, label: n, sub: "Constituency" })),
    );
  }
  const slugOf = new Map(wards.map((w) => [w.name, w.slug]));
  out.push(
    ...people
      .filter((p) =>
        digits.length >= 4
          ? p.phone.replace(/\D/g, "").includes(local)
          : fold(p.name).includes(needle),
      )
      .slice(0, max)
      .map((p) => ({
        kind: "person" as const,
        id: p.id,
        label: p.name,
        sub: p.ward ? `${p.ward} ward` : "No ward on file",
        house: p.house,
        wardSlug: p.ward ? (slugOf.get(p.ward) ?? null) : null,
      })),
  );
  return out;
}

/** MapTiler's search for places and streets inside the map area; null without a key or for under 3 letters. */
export function geocodeUrl(
  q: string,
  key: string | null,
  bounds: [number, number, number, number],
): string | null {
  const text = q.trim();
  if (!key || text.length < 3) return null;
  const params = new URLSearchParams({
    key,
    bbox: bounds.join(","),
    country: "ke",
    limit: "5",
  });
  return `https://api.maptiler.com/geocoding/${encodeURIComponent(text)}.json?${params.toString()}`;
}

/** Places from a MapTiler search reply; anything without a name and a centre is left out. */
export function placeHits(json: unknown): SearchHit[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: SearchHit[] = [];
  for (const f of features as Record<string, unknown>[]) {
    const c = f["center"];
    const label = typeof f["text"] === "string" ? f["text"] : null;
    if (!label || !Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number")
      continue;
    const full = typeof f["place_name"] === "string" ? f["place_name"] : "";
    out.push({
      kind: "place",
      label,
      sub: full.startsWith(`${label}, `) ? full.slice(label.length + 2) : full || "Place",
      center: [c[0], c[1]],
    });
  }
  return out;
}
