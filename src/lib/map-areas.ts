// The areas the Voters map covers, by the atlas key a campaign holds in
// campaigns.map_area: the ward shapes, the house file and the count of houses
// in each ward that go with each. A new area needs its ward shapes in
// public/geo, a line here, and a run of scripts/geo/house-tiles.ts.

export type Top = "county" | "constituency";

export type MapArea = {
  /** The atlas key, as campaigns.map_area holds it. */
  key: string;
  /** In file names: public/tiles/houses-<id>.pmtiles. */
  id: string;
  name: string;
  /** A county opens on its wards by constituency; a constituency on its wards. */
  top: Top;
  wards: string;
  houses: string;
  counts: string;
  /** West, south, east, north: the wards' extent, rounded out. */
  bounds: [number, number, number, number];
};

export const MAP_AREAS: MapArea[] = [
  {
    key: "nairobi",
    id: "nairobi",
    name: "Nairobi County",
    top: "county",
    wards: "/geo/nairobi-wards.json",
    houses: "/tiles/houses-nairobi.pmtiles",
    counts: "/tiles/houses-nairobi.json",
    bounds: [36.66, -1.45, 37.11, -1.16],
  },
  {
    key: "nyeri/mathira",
    id: "mathira",
    name: "Mathira",
    top: "constituency",
    wards: "/geo/mathira-wards.json",
    houses: "/tiles/houses-mathira.pmtiles",
    counts: "/tiles/houses-mathira.json",
    bounds: [37.03, -0.57, 37.31, -0.1],
  },
  {
    // A ward campaign's map is its ward alone: it opens on the ward, as a constituency's does.
    key: "nairobi/roysambu/roysambu",
    id: "roysambu",
    name: "Roysambu Ward",
    top: "constituency",
    wards: "/geo/roysambu-wards.json",
    houses: "/tiles/houses-roysambu.pmtiles",
    counts: "/tiles/houses-roysambu.json",
    bounds: [36.82, -1.27, 36.91, -1.19],
  },
  {
    key: "kiambu/githunguri",
    id: "githunguri",
    name: "Githunguri",
    top: "constituency",
    wards: "/geo/githunguri-wards.json",
    houses: "/tiles/houses-githunguri.pmtiles",
    counts: "/tiles/houses-githunguri.json",
    bounds: [36.67, -1.13, 36.9, -0.97],
  },
  {
    key: "meru/tigania-west/athwana",
    id: "athwana",
    name: "Athwana Ward",
    top: "constituency",
    wards: "/geo/athwana-wards.json",
    houses: "/tiles/houses-athwana.pmtiles",
    counts: "/tiles/houses-athwana.json",
    bounds: [37.58, 0.19, 37.79, 0.49],
  },
];

export function mapAreaFor(key: string | null | undefined): MapArea | null {
  return MAP_AREAS.find((a) => a.key === key) ?? null;
}

/** public/tiles/houses-<id>.json: the houses in each ward, which door coverage divides by. */
export type HouseCounts = {
  area: string;
  source: string;
  minConfidence: number;
  built: string;
  total: number;
  wards: Record<string, number>;
};
