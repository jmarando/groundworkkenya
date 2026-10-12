import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { projectShapes, wardShapes } from "@/lib/area-map";
import { slugify } from "@/lib/atlas-files";
import { getJson } from "@/lib/geo-files";

/** The ward maps the atlas can draw, by county. Nyeri's holds Mathira's wards only. */
const MAPS: Record<string, { url: string; constituency?: string; partial?: string }> = {
  nairobi: { url: "/geo/nairobi-wards.json" },
  nyeri: {
    url: "/geo/mathira-wards.json",
    constituency: "mathira",
    partial: "Only Mathira's wards are mapped so far.",
  },
};
const WIDTH = 640;

/** The county drawn ward by ward; wards outside `focus` are faded. */
export function AreaMap({
  county,
  within,
  focus,
  colourOf,
  onPick,
  label,
}: {
  county: string;
  /** Draw only this area's wards (a constituency), zoomed to them. */
  within?: string | undefined;
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
    const shown = wardShapes(geo)
      .map((s) => ({
        s,
        key: `${county}/${map.constituency ?? slugify(s.constituency ?? "")}/${s.slug}`,
      }))
      .filter((w) => !within || w.key.startsWith(`${within}/`));
    const p = projectShapes(
      shown.map((w) => w.s),
      WIDTH,
    );
    return {
      height: p.height,
      wards: shown.map((w, i) => ({ key: w.key, name: w.s.name, d: p.paths[i]?.d ?? "" })),
    };
  }, [geo, map, county, within]);

  if (!map) return <p className="f-note">There's no ward map for this county yet.</p>;
  if (!drawn) return <p className="meta">Drawing the map…</p>;
  const inside = (key: string) => focus === county || key === focus || key.startsWith(`${focus}/`);
  if (!drawn.wards.some((w) => inside(w.key)))
    return <p className="f-note">There's no ward map for this area yet.</p>;
  return (
    <>
      <svg
        className="el-map"
        viewBox={`0 0 ${WIDTH} ${drawn.height}`}
        role="img"
        aria-label={label}
      >
        {drawn.wards.map((w) => (
          <path
            key={w.key}
            d={w.d}
            fill={colourOf(w.key) ?? "var(--muted)"}
            fillOpacity={inside(w.key) ? 0.9 : 0.6}
            stroke="var(--card)"
            strokeWidth={1}
            onClick={onPick ? () => onPick(w.key) : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <title>{w.name}</title>
          </path>
        ))}
      </svg>
      {map.partial && focus === county ? <p className="meta">{map.partial}</p> : null}
    </>
  );
}
