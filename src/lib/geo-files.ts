// The map's static files in public/geo: ward shapes and building outlines.
// They don't change while the app is open, so each is fetched once and kept.

import { queryOptions } from "@tanstack/react-query";

import type { BuildingCollection } from "@/lib/geo";

/** Which wards have building outlines, and where they came from. */
export type BuildingsIndex = {
  updated: string;
  source: string;
  wards: Record<string, { count: number }>;
};

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return (await res.json()) as T;
}

export const buildingsIndexQuery = queryOptions({
  queryKey: ["geo", "buildings-index"],
  queryFn: () => getJson<BuildingsIndex>("/geo/buildings/index.json"),
  staleTime: Infinity,
});

/** A ward's building outlines. Only ask for wards the index lists. */
export const wardBuildingsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["geo", "buildings", slug],
    queryFn: () => getJson<BuildingCollection>(`/geo/buildings/${slug}.json`),
    staleTime: Infinity,
  });
