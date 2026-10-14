// Checks for the measured indicators as the screens show them: the latest
// figure, people per km², the county's median, the comparisons and the card's
// rows, measured or not. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/area-indicators.test.ts

import {
  againstMedian,
  comparisonText,
  countyMedian,
  indicatorText,
  measuredAt,
  peoplePerKm2,
  placeRows,
} from "@/lib/area-indicators";
import type { AtlasData } from "@/lib/atlas-view";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const ind = (area: string, indicator: string, year: number, value: number) => ({
  area,
  indicator: indicator as never,
  year,
  value,
  source: indicator === "area_km2" ? "geo" : "ob",
});
const D: AtlasData = {
  areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
    { key: "nairobi/dn", level: "constituency", name: "Dagoretti North", parent: "nairobi" },
    { key: "nairobi/dn/kil", level: "ward", name: "Kileleshwa", parent: "nairobi/dn" },
    { key: "nairobi/dn/kaw", level: "ward", name: "Kawangware", parent: "nairobi/dn" },
    { key: "nairobi/dn/x", level: "ward", name: "Unmapped", parent: "nairobi/dn" },
  ],
  candidates: [],
  results: [],
  turnout: [],
  register: [],
  population: [
    {
      area: "nairobi/dn/kil",
      year: 2020,
      total: 20000,
      adults: 15000,
      youngAdults: 6000,
      source: "wp",
    },
    {
      area: "nairobi/dn/kaw",
      year: 2020,
      total: 140000,
      adults: 90000,
      youngAdults: 50000,
      source: "wp",
    },
  ],
  sources: [
    {
      id: "ob",
      title: "Open Buildings v3",
      publisher: "Google Open Buildings",
      url: null,
      note: null,
    },
    { id: "geo", title: "geoBoundaries", publisher: "geoBoundaries", url: null, note: null },
  ],
  indicators: [
    ind("nairobi/dn/kil", "area_km2", 2020, 4),
    ind("nairobi/dn/kil", "buildings_per_km2", 2019, 900),
    ind("nairobi/dn/kil", "buildings_per_km2", 2023, 1000),
    ind("nairobi/dn/kil", "buildings", 2023, 4000),
    ind("nairobi/dn/kil", "median_building_m2", 2023, 180),
    ind("nairobi/dn/kil", "small_building_share", 2023, 0.1),
    ind("nairobi/dn/kil", "large_building_share", 2023, 0.4),
    ind("nairobi/dn/kaw", "area_km2", 2020, 2),
    ind("nairobi/dn/kaw", "buildings_per_km2", 2023, 12000),
    ind("nairobi/dn/kaw", "buildings", 2023, 24000),
    ind("nairobi/dn/kaw", "median_building_m2", 2023, 30),
    ind("nairobi/dn/kaw", "small_building_share", 2023, 0.6),
    ind("nairobi/dn/kaw", "large_building_share", 2023, 0.02),
  ],
  homeArea: null,
  sides: {},
  notes: {},
  profiles: {},
};

eq("the latest year wins", measuredAt(D, "nairobi/dn/kil").buildings_per_km2, {
  value: 1000,
  year: 2023,
  source: "ob",
});
eq(
  "people per km², and none where the place isn't measured",
  [
    peoplePerKm2(D, "nairobi/dn/kil"),
    peoplePerKm2(D, "nairobi/dn/kaw"),
    peoplePerKm2(D, "nairobi/dn/x"),
  ],
  [5000, 70000, null],
);
eq(
  "the county's median over its measured wards",
  [
    countyMedian(D, "nairobi", "ward", "buildings_per_km2"),
    countyMedian(D, "nairobi", "ward", "people_per_km2"),
    countyMedian(D, "nairobi", "constituency", "buildings_per_km2"),
  ],
  [6500, 37500, null],
);
eq(
  "against the median: above, below, about, and none to compare with",
  [
    againstMedian(12000, 6500, "Nairobi"),
    againstMedian(1000, 6500, "Nairobi"),
    againstMedian(6600, 6500, "Nairobi"),
    againstMedian(5, null, "Nairobi"),
    againstMedian(5, 0, "Nairobi"),
  ],
  ["1.8× Nairobi's median", "15% of Nairobi's median", "about Nairobi's median", null, null],
);
eq(
  "a share is set beside the median share",
  [
    comparisonText("small_building_share", 0.6, 0.35, "Nairobi"),
    comparisonText("small_building_share", 0.6, null, "Nairobi"),
  ],
  ["Nairobi's median: 35%", null],
);
eq(
  "the figures as text",
  [
    indicatorText("buildings_per_km2", 12000),
    indicatorText("people_per_km2", 70000),
    indicatorText("median_building_m2", 30),
    indicatorText("small_building_share", 0.6),
    indicatorText("area_km2", 2.345),
    indicatorText("buildings", 24000),
  ],
  ["12,000 per km²", "70,000 per km²", "30 m²", "60%", "2.3 km²", "24,000"],
);
const kaw = placeRows(D, "nairobi/dn/kaw");
eq(
  "the card's rows for a measured ward",
  [kaw.mapped, kaw.tag, kaw.rows.map((r) => [r.label, r.text, r.vs])],
  [
    true,
    "Google Open Buildings · 2023",
    [
      ["People per km² (estimate)", "70,000 per km²", "1.9× Nairobi's median"],
      ["Buildings per km²", "12,000 per km²", "1.8× Nairobi's median"],
      ["Median building", "30 m²", "29% of Nairobi's median"],
      ["Small structures (under 40 m²)", "60%", "Nairobi's median: 35%"],
      ["Large buildings (200 m² or more)", "2%", "Nairobi's median: 21%"],
    ],
  ],
);
const x = placeRows(D, "nairobi/dn/x");
eq(
  "a place without a ward map: nothing measured, never zero",
  [x.mapped, x.tag, x.rows.every((r) => r.text === null && r.vs === null)],
  [false, null, true],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
