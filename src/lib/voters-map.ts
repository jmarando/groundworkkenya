// The Voters map's rules: which level a zoom shows, the area under a point,
// where the camera goes for an area or a house, what a click does (said on the
// map, as AGENTS.md asks), the constituency names drawn at the top level, and
// search. Pure, so the map component only draws.

import {
  distanceM,
  inBox,
  ringCentre,
  wardAt,
  type Box,
  type LngLat,
  type WardShape,
} from "@/lib/geo";
import type { Top } from "@/lib/map-areas";
import { plusCodeCentre } from "@/lib/pluscode";
import type { Area, SearchChanges } from "@/lib/voters-view";

export type Basemap = "satellite" | "streets";
export type Level = "area" | "constituency" | "ward" | "street";

export const MIN_ZOOM = 8;
export const CONSTITUENCY_ZOOM = 11;
export const WARD_ZOOM = 13;
export const STREET_ZOOM = 16;
export const MAX_ZOOM = 20;
/** A house opens close enough to see its neighbours. */
export const HOUSE_ZOOM_OPEN = 18;
/** A place from the search opens at street level, with the houses around it. */
export const PLACE_ZOOM = 16.5;

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

/**
 * Where the camera goes: a house in the map area, a ward, a constituency, else the whole
 * map area. A house outside the map area (a plus code typed into the address) is no house.
 */
export function cameraFor(
  at: { area: Area; house?: string | null },
  wards: WardRef[],
  shapes: WardShape[],
  mapArea: { bounds: [number, number, number, number]; top: Top },
): CameraTarget {
  const [west, south, east, north] = mapArea.bounds;
  const bounds = { west, south, east, north };
  const found = at.house ? plusCodeCentre(at.house) : null;
  const centre = found && inBox(found, bounds) ? found : null;
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
  return {
    kind: "box",
    box: bounds,
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

const centreOf = (b: Box): LngLat => [(b.west + b.east) / 2, (b.south + b.north) / 2];

/**
 * Where a constituency's name goes, so that clicking it opens that constituency: the middle
 * of the box around its wards, or, when that falls outside every one of them (Mathare's does,
 * in Ruaraka), the centre of the ward whose own box is centred nearest it.
 */
function labelPoint(own: WardShape[]): LngLat {
  const middle = centreOf(union(own.map((s) => s.box))!);
  if (wardAt(middle, own)) return middle;
  const [nearest] = [...own].sort(
    (a, b) => distanceM(centreOf(a.box), middle) - distanceM(centreOf(b.box), middle),
  );
  const outline = nearest?.polygons[0]?.[0];
  return outline ? ringCentre(outline) : middle;
}

/** A point for each constituency's name at the top level, in name order; labelPoint says where. */
export function constituencyLabels(shapes: WardShape[], wards: WardRef[]): LabelPoints {
  const members = new Map<string, WardShape[]>();
  for (const s of shapes) {
    const name = wards.find((w) => w.slug === s.slug)?.constituency;
    if (name) members.set(name, [...(members.get(name) ?? []), s]);
  }
  return {
    type: "FeatureCollection",
    features: [...members.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, own]) => ({
        type: "Feature" as const,
        properties: { name },
        geometry: { type: "Point" as const, coordinates: labelPoint(own) },
      })),
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

/** Lower case, without accents, and only a to z and 0 to 9 with single spaces between. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Wards and constituencies by name, and people by name, or by their number
 * when four or more digits are typed after its 0 or 254. Names match without
 * capitals or accents. At most `max` of each kind.
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
  // Typed the local way (0733…) or the international way (254733…), numbers are kept +254…;
  // the four digits that start a number search are counted after that 0 or 254.
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
        local.length >= 4
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

/**
 * What choosing a search hit does: a ward or constituency becomes the area on
 * show; a person with a house opens it, in the ward it stands in; a person
 * without one opens their record on the People tab; a place opens the ward
 * there, with the camera on the place (outside every ward, the area stays).
 */
export function searchGo(
  hit: SearchHit,
  shapes: WardShape[],
): { changes: SearchChanges; camera: CameraTarget | null } {
  if (hit.kind === "ward")
    return { changes: { area: `w:${hit.slug}`, house: undefined }, camera: null };
  if (hit.kind === "constituency")
    return { changes: { area: `c:${hit.name}`, house: undefined }, camera: null };
  if (hit.kind === "person") {
    if (!hit.house) return { changes: { tab: "people", person: hit.id }, camera: null };
    const at = plusCodeCentre(hit.house);
    const slug = (at ? wardAt(at, shapes)?.slug : undefined) ?? hit.wardSlug;
    return { changes: { ...(slug ? { area: `w:${slug}` } : {}), house: hit.house }, camera: null };
  }
  const ward = wardAt(hit.center, shapes);
  return {
    changes: { ...(ward ? { area: `w:${ward.slug}` } : {}), house: undefined },
    camera: { kind: "point", center: hit.center, zoom: PLACE_ZOOM },
  };
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

/**
 * Places from a MapTiler search reply; anything that isn't an object with a name
 * and a centre is left out.
 */
export function placeHits(json: unknown): SearchHit[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: SearchHit[] = [];
  for (const entry of features as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const f = entry as Record<string, unknown>;
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
