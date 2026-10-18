// Checks for the people-in-places facts behind Outlook 2027: adults, young
// adults and the adults not on the register in each constituency (the atlas's
// WorldPop estimates), and the county's new registrations placed in proportion
// to the adults off the register. The expected figures were worked out apart
// from the module, from the definitions, on the same rows (scratchpad
// outlook/ref.py). Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/outlook-youth.test.ts

import type { AtlasData } from "@/lib/atlas-view";
import { baselinePlan, likeBefore, simulate } from "@/lib/outlook";
import { outlookFor, youthFacts } from "@/lib/outlook-youth";
import { seatFromAtlas } from "@/lib/seat";

import { atlasFromCsv } from "./atlas-csv";

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
function near(name: string, got: number, want: number, eps = 1e-4) {
  if (Math.abs(got - want) <= eps) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${got}\n  want ${want} (±${eps})`);
  }
}

const d = atlasFromCsv();
const r = seatFromAtlas(d, "nairobi", null);
if (!r.ok) throw new Error(r.why);
const nairobi = r.seat;
const K = (name: string) => `nairobi/${name}`;
const y = youthFacts(d, nairobi);
if (!y) throw new Error("Nairobi has population estimates");

const REGISTRATION = {
  count: 276886,
  period: "2026-03-30 to 2026-04-28",
  source: "Capital FM, 1 May 2026 (IEBC mass drive)",
};
const FRESH: Record<string, number> = {
  [K("dagoretti-north")]: 15803,
  [K("dagoretti-south")]: 13406,
  [K("embakasi-west")]: 15180,
  [K("kamukunji")]: 19993,
  [K("kasarani")]: 6996,
  [K("kibra")]: 38730,
  [K("langata")]: 0,
  [K("makadara")]: 9106,
  [K("mathare")]: 11367,
  [K("roysambu")]: 13142,
  [K("ruaraka")]: 43240,
  [K("starehe")]: 0,
  [K("westlands")]: 20247,
  "nairobi#together": 69676,
};

// ------------------------------------------------------------- what the estimates say

eq("the county", y.total, {
  adults: 3231692,
  young: 2059932,
  registered: 2415310,
  unregistered: 869702,
});
eq("the year", y.year, 2020);
eq(
  "where it comes from",
  y.source,
  "WorldPop (University of Southampton): Age and sex structures, Kenya, 2020, 100 m grid",
);
eq(
  "a bucket for each place the seat has",
  Object.keys(y.buckets).sort(),
  nairobi.buckets.map((b) => b.key).sort(),
);
eq(
  "the register is the seat's",
  Object.entries(y.buckets).every(
    ([k, v]) => v.registered === nairobi.buckets.find((b) => b.key === k)!.registered,
  ),
  true,
);
eq("Dagoretti North", y.buckets[K("dagoretti-north")], {
  adults: 207296,
  young: 118078,
  registered: 157659,
  unregistered: 49637,
});
eq("Kibra", y.buckets[K("kibra")], {
  adults: 249934,
  young: 153861,
  registered: 128282,
  unregistered: 121652,
});
eq("Ruaraka", y.buckets[K("ruaraka")], {
  adults: 260299,
  young: 170202,
  registered: 124482,
  unregistered: 135817,
});
eq("Westlands", y.buckets[K("westlands")], {
  adults: 224336,
  young: 118668,
  registered: 160739,
  unregistered: 63597,
});
eq(
  "Langata, where the register is longer than the estimate, has none off it",
  y.buckets[K("langata")],
  { adults: 115947, young: 71366, registered: 145649, unregistered: 0 },
);
eq("Starehe likewise", y.buckets[K("starehe")]?.unregistered, 0);
eq(
  "the four Embakasi seats together are the sum of the four, each held at nothing or more",
  y.buckets["nairobi#together"],
  { adults: 791053, young: 524927, registered: 581788, unregistered: 218854 },
);
eq(
  "no bucket is below nothing, and the county's is the sum of the buckets'",
  [
    Object.values(y.buckets).every((b) => b.unregistered >= 0),
    Object.values(y.buckets).reduce((t, b) => t + b.unregistered, 0),
  ],
  [true, 869702],
);

// ------------------------------------------------------------- when there are no estimates

{
  const ward = d.areas.find((a) => a.parent === K("dagoretti-north"))!.key;
  const without: AtlasData = { ...d, population: d.population.filter((p) => p.area !== ward) };
  eq("a constituency with a ward missing", youthFacts(without, nairobi), null);
  const other: AtlasData = {
    ...d,
    population: d.population.map((p) => (p.area === ward ? { ...p, year: 2019 } : p)),
  };
  eq("a ward from another year", youthFacts(other, nairobi), null);
  const elsewhere: AtlasData = {
    ...d,
    population: d.population.map((p) => (p.area === ward ? { ...p, source: "another" } : p)),
  };
  eq("a ward from another source", youthFacts(elsewhere, nairobi), null);
  const own = (over: object) => ({
    area: K("kibra"),
    year: 2020,
    total: 369291,
    adults: 249934,
    youngAdults: 153861,
    source: "worldpop-2020-agesex",
    ...over,
  });
  eq(
    "one constituency's own estimate, the same",
    youthFacts({ ...d, population: [...d.population, own({})] }, nairobi)?.total.adults,
    3231692,
  );
  eq(
    "one constituency's own estimate from another year",
    youthFacts({ ...d, population: [...d.population, own({ year: 2019 })] }, nairobi),
    null,
  );
  eq(
    "one constituency's own estimate from another source",
    youthFacts({ ...d, population: [...d.population, own({ source: "another" })] }, nairobi),
    null,
  );
  eq(
    "a county the atlas has no constituencies for",
    youthFacts(d, { ...nairobi, county: "nowhere" }),
    null,
  );
  eq("no population at all", youthFacts({ ...d, population: [] }, nairobi), null);
  const nowhere: AtlasData = {
    ...d,
    register: d.register.filter(
      (x) => x.area !== K("kibra") && !x.area.startsWith(`${K("kibra")}/`),
    ),
  };
  eq("a constituency whose register is not on file", youthFacts(nowhere, nairobi), null);
  const noTogether = { ...nairobi, buckets: nairobi.buckets.filter((b) => !b.together) };
  eq("a seat that leaves some constituencies out", youthFacts(d, noTogether), null);
  eq(
    "a source the atlas does not describe is named by its id",
    youthFacts({ ...d, sources: [] }, nairobi)?.source,
    "worldpop-2020-agesex",
  );
}

// ------------------------------------------------------------- placing the new registrations

{
  const o = outlookFor(nairobi, y, REGISTRATION);
  eq(
    "the seat, the facts and the figure come through",
    [o.seat === nairobi, o.youth === y, o.registration],
    [true, true, REGISTRATION],
  );
  const sorted = (r: Record<string, number> | null) =>
    r && Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1));
  eq("each place's share of the county's 276,886", sorted(o.fresh), sorted(FRESH));
  eq(
    "adding up to the county's figure",
    Object.values(o.fresh!).reduce((t, v) => t + v, 0),
    276886,
  );
  eq(
    "none where nobody is off the register",
    [o.fresh![K("langata")], o.fresh![K("starehe")]],
    [0, 0],
  );
  eq(
    "each place in proportion to who is off the register: Ruaraka and Kibra lead",
    Object.entries(o.fresh!)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k),
    ["nairobi#together", K("ruaraka"), K("kibra")],
  );

  // and the sum, end to end
  const p = likeBefore(baselinePlan(nairobi), nairobi);
  const s = simulate(o, p);
  near("new registrations vote at 2022's rate: the first candidate", s.votes[0]!, 779568.810973);
  near("the second", s.votes[1]!, 639262.654126);
  near("the margin", s.margin, 140306.156848);
  eq("2022 again is still 2022", simulate(o, baselinePlan(nairobi)).votes, [699392, 573516]);
}
eq("no figure for the county, none placed", outlookFor(nairobi, y, null).fresh, null);
eq("no estimates, none placed", outlookFor(nairobi, null, REGISTRATION).fresh, null);
eq(
  "a figure that is not whole, none placed",
  outlookFor(nairobi, y, { ...REGISTRATION, count: 10.5 }).fresh,
  null,
);
{
  const none = {
    ...y,
    buckets: Object.fromEntries(
      Object.entries(y.buckets).map(([k, v]) => [k, { ...v, unregistered: 0 }]),
    ),
  };
  eq(
    "nobody off the register anywhere, none placed",
    outlookFor(nairobi, none, REGISTRATION).fresh,
    null,
  );
  eq("nothing carried over from the facts", outlookFor(nairobi, none, REGISTRATION).youth, none);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
