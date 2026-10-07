import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { projectShapes, wardShapes } from "@/lib/area-map";
import { slugify } from "@/lib/atlas-files";
import { getJson } from "@/lib/geo-files";

/** The ward maps the atlas can draw, by county. Nyeri's holds Mathira's wards only. */
const MAPS: Record<string, { url: string; constituency?: string }> = {
  nairobi: { url: "/geo/nairobi-wards.json" },
  nyeri: { url: "/geo/mathira-wards.json", constituency: "mathira" },
};
const WIDTH = 640;

/** The county drawn ward by ward; wards outside `focus` are faded. */
export function AreaMap({
  county,
  focus,
  colourOf,
  onPick,
  label,
}: {
  county: string;
  /** The area on show: its wards are drawn in full. */
  focus: string;
  /** A ward's fill from its key (county/constituency/ward); null leaves it plain. */
  colourOf: (wardKey: string) => string | null;
  onPick?: (wardKey: string) => void;
  label: string;
}) {
  const map = MAPS[county];
  const { data: geo } = useQuery({
    queryKey: ["geo", "wards", county],
    queryFn: () => getJson<Parameters<typeof wardShapes>[0]>(map!.url),
    enabled: Boolean(map),
    staleTime: Infinity,
  });
  const drawn = useMemo(() => {
    if (!geo || !map) return null;
    const shapes = wardShapes(geo);
    const p = projectShapes(shapes, WIDTH);
    return {
      height: p.height,
      wards: shapes.map((s, i) => ({
        key: `${county}/${map.constituency ?? slugify(s.constituency ?? "")}/${s.slug}`,
        name: s.name,
        d: p.paths[i]?.d ?? "",
      })),
    };
  }, [geo, map, county]);

  if (!map) return <p className="f-note">There's no ward map for this county yet.</p>;
  if (!drawn) return <p className="meta">Drawing the map…</p>;
  return (
    <svg className="el-map" viewBox={`0 0 ${WIDTH} ${drawn.height}`} role="img" aria-label={label}>
      {drawn.wards.map((w) => {
        const inside = focus === county || w.key === focus || w.key.startsWith(`${focus}/`);
        return (
          <path
            key={w.key}
            d={w.d}
            fill={colourOf(w.key) ?? "var(--muted)"}
            fillOpacity={inside ? 0.9 : 0.25}
            stroke="var(--card)"
            strokeWidth={1}
            onClick={onPick ? () => onPick(w.key) : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <title>{w.name}</title>
          </path>
        );
      })}
    </svg>
  );
}
