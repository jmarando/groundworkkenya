// The measured indicators as the screens show them: an area's latest figures,
// its people per km², how it compares with the county's other measured places
// of its level, and the "About this place" card's rows. Pure.

import type { IndicatorId } from "@/lib/atlas-files";
import { populationOf, votes, whole, type AtlasData, type Level } from "@/lib/atlas-view";

export type Measure = IndicatorId | "people_per_km2";
export type Measured = Partial<
  Record<IndicatorId, { value: number; year: number; source: string }>
>;

/** An area's latest value of each indicator it has. */
export function measuredAt(d: AtlasData, key: string): Measured {
  const out: Measured = {};
  for (const r of d.indicators) {
    const had = out[r.indicator];
    if (r.area === key && (!had || had.year < r.year))
      out[r.indicator] = { value: r.value, year: r.year, source: r.source };
  }
  return out;
}

/** People per km²: the population estimate over the measured size; null without either. */
export function peoplePerKm2(d: AtlasData, key: string): number | null {
  const km2 = measuredAt(d, key).area_km2?.value;
  const people = populationOf(d, key)?.estimate.total;
  return km2 && people !== undefined ? Math.round(people / km2) : null;
}

const valueOf = (d: AtlasData, key: string, id: Measure): number | null =>
  id === "people_per_km2" ? peoplePerKm2(d, key) : (measuredAt(d, key)[id]?.value ?? null);

/** The median over the county's measured places of one level; null with none. */
export function countyMedian(
  d: AtlasData,
  county: string,
  level: Level,
  id: Measure,
): number | null {
  const xs = d.areas
    .filter((a) => a.level === level && a.key.startsWith(`${county}/`))
    .map((a) => valueOf(d, a.key, id))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length / 2;
  return xs.length % 2 ? xs[Math.floor(mid)]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** "1.8× Nairobi's median", "15% of Nairobi's median", "about Nairobi's median"; null without a median. */
export function againstMedian(value: number, median: number | null, county: string): string | null {
  if (median === null || median <= 0) return null;
  const r = value / median;
  if (r >= 0.9 && r <= 1.1) return `about ${county}'s median`;
  if (r > 1.1) return `${Math.round(r * 10) / 10}× ${county}'s median`;
  return `${Math.round(r * 100)}% of ${county}'s median`;
}

/** A share is set beside the median share; anything else is compared with the median. */
export function comparisonText(
  id: Measure,
  value: number,
  median: number | null,
  county: string,
): string | null {
  if (id === "small_building_share" || id === "large_building_share")
    return median === null ? null : `${county}'s median: ${whole(median)}`;
  return againstMedian(value, median, county);
}

export function indicatorText(id: Measure, value: number): string {
  switch (id) {
    case "area_km2":
      return `${(Math.round(value * 10) / 10).toFixed(1)} km²`;
    case "buildings":
      return votes(value);
    case "buildings_per_km2":
    case "people_per_km2":
      return `${votes(Math.round(value))} per km²`;
    case "median_building_m2":
      return `${Math.round(value)} m²`;
    default:
      return whole(value);
  }
}

/** The card's measures, in order. */
export const PLACE_MEASURES: { id: Measure; label: string }[] = [
  { id: "people_per_km2", label: "People per km² (estimate)" },
  { id: "buildings_per_km2", label: "Buildings per km²" },
  { id: "median_building_m2", label: "Median building" },
  { id: "small_building_share", label: "Small structures (under 40 m²)" },
  { id: "large_building_share", label: "Large buildings (200 m² or more)" },
];

export type PlaceRow = { id: Measure; label: string; text: string | null; vs: string | null };

/** The "About this place" card's measured rows; `mapped` is false where there's no ward map. */
export function placeRows(
  d: AtlasData,
  key: string,
): { mapped: boolean; rows: PlaceRow[]; tag: string | null } {
  const area = d.areas.find((a) => a.key === key);
  const county = key.split("/")[0] ?? "";
  const countyName = d.areas.find((a) => a.key === county)?.name ?? county;
  const m = measuredAt(d, key);
  const rows = PLACE_MEASURES.map(({ id, label }) => {
    const value = valueOf(d, key, id);
    const median = area ? countyMedian(d, county, area.level, id) : null;
    return {
      id,
      label,
      text: value === null ? null : indicatorText(id, value),
      vs: value === null ? null : comparisonText(id, value, median, countyName),
    };
  });
  const b = m.buildings;
  const source = b ? d.sources.find((s) => s.id === b.source) : undefined;
  return {
    mapped: Boolean(m.area_km2),
    rows,
    tag: source && b ? `${source.publisher} · ${b.year}` : null,
  };
}
