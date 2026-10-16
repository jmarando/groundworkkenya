// What the Voters map draws for walk lists: the draft's houses numbered in walking order, the
// shape being drawn, a list's doors coloured by their latest visit, and the outline of each open
// list. Shapes for the map's GeoJSON sources; pure, so the map only draws.

import type { Box, LngLat, Ring } from "@/lib/geo";
import { OUTCOME_COLOUR, PLAIN, type Outcome } from "@/lib/houses";
import type { ListDoor } from "@/lib/walk-lists.functions";

type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "Point"; coordinates: LngLat }
  | { type: "LineString"; coordinates: LngLat[] };

export type Shapes = {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: Record<string, unknown>; geometry: Geometry }[];
};

const polygon = (
  properties: Record<string, unknown>,
  rings: Ring[],
): Shapes["features"][number] => ({
  type: "Feature",
  properties,
  geometry: { type: "Polygon", coordinates: rings },
});

/** About two metres, for a door with no outline of its own. */
const SQUARE = 0.00002;

/** The houses of the draft, each a polygon carrying its number in the walking order. */
export function draftShapes(doors: { pc: string; rings: Ring[]; n: number }[]): Shapes {
  return {
    type: "FeatureCollection",
    features: doors
      .filter((d) => d.rings.length > 0)
      .map((d) => polygon({ pc: d.pc, n: d.n }, d.rings)),
  };
}

/** The shape being drawn: every point, the line between two, the closed shape from three. */
export function drawnShape(points: LngLat[]): Shapes {
  const features: Shapes["features"] = points.map((p, i) => ({
    type: "Feature",
    properties: { i },
    geometry: { type: "Point", coordinates: p },
  }));
  if (points.length === 2)
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: points },
    });
  if (points.length >= 3) features.push(polygon({}, [[...points, points[0]!]]));
  return { type: "FeatureCollection", features };
}

/** A door's rings, or a small square round its place when it has no outline of its own. */
function doorRings(d: ListDoor): Ring[] {
  if (d.rings.length) return d.rings;
  const [lng, lat] = d.at;
  return [
    [
      [lng - SQUARE, lat + SQUARE],
      [lng + SQUARE, lat + SQUARE],
      [lng + SQUARE, lat - SQUARE],
      [lng - SQUARE, lat - SQUARE],
      [lng - SQUARE, lat + SQUARE],
    ],
  ];
}

/**
 * A list's doors, each coloured by the latest visit at its house; a visit from before `since`
 * (when the list first went out) is not this list's, and the door stays plain.
 */
export function listDoorShapes(doors: ListDoor[], since: string | null = null): Shapes {
  const from = since ? Date.parse(since) : NaN;
  return {
    type: "FeatureCollection",
    features: doors.map((d) => {
      const visited = d.visitedAt ? Date.parse(d.visitedAt) : NaN;
      const fresh =
        d.outcome !== null && !Number.isNaN(visited) && (Number.isNaN(from) || visited >= from);
      return polygon(
        { pc: d.pc, n: d.n, colour: fresh && d.outcome ? OUTCOME_COLOUR[d.outcome] : PLAIN },
        doorRings(d),
      );
    }),
  };
}

/**
 * A list's doors on the phone, each coloured by what the phone knows of it (the server's visits
 * since the list went out, and those waiting to send); a door with none stays plain.
 */
export function outcomeShapes(doors: ListDoor[], outcomes: ReadonlyMap<string, Outcome>): Shapes {
  return {
    type: "FeatureCollection",
    features: doors.map((d) => {
      const outcome = outcomes.get(d.pc);
      return polygon(
        { pc: d.pc, n: d.n, colour: outcome ? OUTCOME_COLOUR[outcome] : PLAIN },
        doorRings(d),
      );
    }),
  };
}

/** The outline of each open list at street level. */
export function openListOutlines(lists: { id: string; rings: Ring[] }[]): Shapes {
  return {
    type: "FeatureCollection",
    features: lists.filter((l) => l.rings.length > 0).map((l) => polygon({ id: l.id }, l.rings)),
  };
}

const M_PER_DEGREE = 111_320;

/**
 * A ring round a list's houses: the convex hull of the points, each widened by `padM` metres so
 * the houses stand inside it. Closed; empty for no points.
 */
export function listHull(points: LngLat[], padM = 4): Ring {
  if (points.length === 0) return [];
  const padded: LngLat[] = points.flatMap(([lng, lat]) => {
    const dLat = padM / M_PER_DEGREE;
    const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
    return [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
    ] as LngLat[];
  });
  // Andrew's monotone chain.
  const sorted = [...padded].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: LngLat, a: LngLat, b: LngLat) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: LngLat[]): LngLat[] => {
    const out: LngLat[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return [...hull, hull[0]!];
}

/** The box round some doors, for flying the camera to a list; null for none. */
export function boxOfDoors(doors: { at: LngLat }[]): Box | null {
  if (doors.length === 0) return null;
  return {
    west: Math.min(...doors.map((d) => d.at[0])),
    south: Math.min(...doors.map((d) => d.at[1])),
    east: Math.max(...doors.map((d) => d.at[0])),
    north: Math.max(...doors.map((d) => d.at[1])),
  };
}
