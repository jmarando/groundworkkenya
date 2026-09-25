import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { getJson } from "@/lib/geo-files";

type Coords = number[][][] | number[][][][];
type GeoFile = {
  features: {
    properties: { slug: string; name: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Coords };
  }[];
};

type Shape = { slug: string; name: string; d: string };

const WIDTH = 1000;

/**
 * An outline map drawn straight from GeoJSON: no tiles, no map library.
 * Kenya sits on the equator, so an equirectangular projection scaled by the
 * cosine of the middle latitude is true enough for a county or ward map.
 */
function project(geo: GeoFile | undefined): { shapes: Shape[]; height: number } {
  if (!geo) return { shapes: [], height: 600 };
  const polys = (g: GeoFile["features"][number]["geometry"]) =>
    (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const f of geo.features) {
    for (const poly of polys(f.geometry)) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (x === undefined || y === undefined) continue;
          west = Math.min(west, x);
          east = Math.max(east, x);
          south = Math.min(south, y);
          north = Math.max(north, y);
        }
      }
    }
  }
  const kx = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const scale = WIDTH / ((east - west) * kx);
  const px = (x: number) => ((x - west) * kx * scale).toFixed(1);
  const py = (y: number) => ((north - y) * scale).toFixed(1);
  const shapes = geo.features.map((f) => ({
    slug: f.properties.slug,
    name: f.properties.name,
    d: polys(f.geometry)
      .map((poly) =>
        poly
          .map(
            (ring) =>
              ring.map(([x, y], i) => `${i ? "L" : "M"}${px(x ?? 0)} ${py(y ?? 0)}`).join("") + "Z",
          )
          .join(""),
      )
      .join(""),
  }));
  return { shapes, height: Math.round((north - south) * scale) };
}

export function ChoroplethMap({
  file,
  label,
  fill,
  opacity,
  selected,
  onSelect,
  tip,
}: {
  /** GeoJSON under public/, with {slug, name} on each feature. */
  file: string;
  /** What the map shows, for screen readers. */
  label: string;
  fill: (slug: string) => string;
  opacity?: (slug: string) => number;
  selected?: string | null;
  onSelect?: (slug: string) => void;
  /** Hover card for one area. */
  tip?: (slug: string, name: string) => ReactNode;
}) {
  const { data, isError } = useQuery({
    queryKey: ["geo", file],
    queryFn: () => getJson<GeoFile>(file),
    staleTime: Infinity,
  });
  const { shapes, height } = useMemo(() => project(data), [data]);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ slug: string; name: string; x: number; y: number } | null>(
    null,
  );

  if (isError) return <p className="meta">The map didn't load. Refresh to try again.</p>;
  if (!data) return <div className="cmap cmap--loading" aria-hidden="true" />;

  const move = (s: Shape, e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ slug: s.slug, name: s.name, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div className="cmap" ref={box} onPointerLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role={onSelect ? "group" : "img"}
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
      >
        {shapes.map((s) => (
          <path
            key={s.slug}
            d={s.d}
            className={selected === s.slug ? "is-sel" : undefined}
            style={{ fill: fill(s.slug), opacity: opacity ? opacity(s.slug) : 1 }}
            onPointerMove={(e) => move(s, e)}
            onClick={onSelect ? () => onSelect(s.slug) : undefined}
            {...(onSelect
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": s.name,
                  "aria-pressed": selected === s.slug,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(s.slug);
                    }
                  },
                }
              : {})}
          />
        ))}
      </svg>
      {hover && tip && (
        <div
          className="cmap-tip"
          style={{ left: hover.x, top: hover.y }}
          role="status"
          aria-live="polite"
        >
          {tip(hover.slug, hover.name)}
        </div>
      )}
    </div>
  );
}
