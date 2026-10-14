// The area nearest each polling centre in a ward: the part of the ward closer to that centre
// than to any other (a Voronoi cell of the ward's placed centres, cut to the ward's outline).
// IEBC publishes no station boundaries, so the map calls it "nearest centre"; houses take
// their centre by the same rule. Pure.

import { Delaunay } from "d3-delaunay";
// The library's ES build has a default export only, whatever its types say.
import polygonClipping from "polygon-clipping";

import { inPolygon, type LngLat, type Ring, type WardShape } from "@/lib/geo";

export type CentreArea = { id: string; polygons: Ring[][] };

/**
 * The part of the ward nearest each centre, worked out in local metres around the ward's
 * middle so a cell's edge is where two centres are equally far. A ward with one centre is all
 * that centre's; a centre at the very place of another gets no area of its own.
 */
export function centreAreas(centres: { id: string; at: LngLat }[], ward: WardShape): CentreArea[] {
  if (!centres.length) return [];
  if (centres.length === 1) return [{ id: centres[0]!.id, polygons: ward.polygons }];
  const lat0 = (ward.box.south + ward.box.north) / 2;
  const lng0 = (ward.box.west + ward.box.east) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const toXY = ([lng, lat]: LngLat): [number, number] => [(lng - lng0) * k, lat - lat0];
  const fromXY = ([x, y]: [number, number]): LngLat => [x / k + lng0, y + lat0];
  const pad = 0.05;
  const [x0, y0] = toXY([ward.box.west - pad, ward.box.south - pad]);
  const [x1, y1] = toXY([ward.box.east + pad, ward.box.north + pad]);
  const points = centres.map((c) => toXY(c.at));
  // Bounds stretched past every centre too: one outside the ward still has its cell.
  const xs = [x0, x1, ...points.map((p) => p[0])];
  const ys = [y0, y1, ...points.map((p) => p[1])];
  const voronoi = Delaunay.from(points).voronoi([
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ]);
  return centres.map((c, i) => {
    const cell = voronoi.cellPolygon(i) as [number, number][] | null;
    if (!cell || cell.length < 4) return { id: c.id, polygons: [] };
    const ring: Ring = cell.map((p) => fromXY(p));
    return { id: c.id, polygons: polygonClipping.intersection([ring], ward.polygons) as Ring[][] };
  });
}

/** The area a point is in, by the centre's id; null outside them all. */
export function centreAt(p: LngLat, areas: CentreArea[]): string | null {
  return areas.find((a) => a.polygons.some((rings) => inPolygon(p, rings)))?.id ?? null;
}
