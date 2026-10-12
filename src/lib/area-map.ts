// A county drawn from its ward outlines as SVG: each ward's rings projected
// flat (fine at a county's size) and scaled to the width asked for. Pure.

export type Ring = [number, number][];
export type WardShape = {
  slug: string;
  name: string;
  constituency: string | null;
  polygons: Ring[][];
};

type Geo = {
  features: {
    properties: { slug: string; name: string; constituency?: string };
    geometry: { type: string; coordinates: unknown };
  }[];
};

/** The wards in a ward map, as polygons of rings. */
export function wardShapes(geo: Geo): WardShape[] {
  return geo.features.map((f) => ({
    slug: f.properties.slug,
    name: f.properties.name,
    constituency: f.properties.constituency ?? null,
    polygons:
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as Ring[]]
        : (f.geometry.coordinates as Ring[][]),
  }));
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** SVG paths for the shapes, flat-projected and scaled to `width`; the height follows. */
export function projectShapes(
  shapes: WardShape[],
  width: number,
): { width: number; height: number; paths: { slug: string; d: string }[] } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of shapes)
    for (const poly of s.polygons)
      for (const ring of poly)
        for (const [x, y] of ring) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
  if (!Number.isFinite(minX)) return { width, height: 0, paths: [] };
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = width / ((maxX - minX) * k || 1);
  const pt = ([x, y]: [number, number]) =>
    `${r1((x - minX) * k * scale)},${r1((maxY - y) * scale)}`;
  return {
    width,
    height: Math.round((maxY - minY) * scale),
    paths: shapes.map((s) => ({
      slug: s.slug,
      d: s.polygons
        .map((poly) => poly.map((ring) => `M${ring.map(pt).join("L")}Z`).join(""))
        .join(""),
    })),
  };
}
