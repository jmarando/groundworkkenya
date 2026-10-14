// One campaign's worth of made-up data on which every finding rule fires once:
// a Nairobi governor's race with four seats and six wards, the diary, doors,
// issues, stipends, polls and mentions. Shared by the findings tests.

import type { AtlasData } from "@/lib/atlas-view";
import type { DiaryEntry } from "@/lib/diary";
import type { FindingsInput, FindingsWard } from "@/lib/findings/core";
import type { RacePoll, RaceRival } from "@/lib/race-data";

const area = (key: string, level: string, name: string, parent: string | null) => ({
  key,
  level: level as AtlasData["areas"][number]["level"],
  name,
  parent,
});
const DN = "nairobi/dagoretti-north";
const WL = "nairobi/westlands";
const KS = "nairobi/kasarani";
const EE = "nairobi/embakasi-east";
export const KEYS = {
  kawangware: `${DN}/kawangware`,
  kileleshwa: `${DN}/kileleshwa`,
  kangemi: `${WL}/kangemi`,
  parklands: `${WL}/parklands`,
  mwiki: `${KS}/mwiki`,
  utawala: `${EE}/utawala`,
};

/** 2022 governor: our side is Bloc A. Kasarani is Mobilise, Dagoretti North Persuade, Embakasi East Cut the gap, Westlands Hold. */
export const ATLAS: AtlasData = {
  areas: [
    area("kenya", "country", "Kenya", null),
    area("nairobi", "county", "Nairobi", "kenya"),
    area(DN, "constituency", "Dagoretti North", "nairobi"),
    area(WL, "constituency", "Westlands", "nairobi"),
    area(KS, "constituency", "Kasarani", "nairobi"),
    area(EE, "constituency", "Embakasi East", "nairobi"),
    area(KEYS.kawangware, "ward", "Kawangware", DN),
    area(KEYS.kileleshwa, "ward", "Kileleshwa", DN),
    area(KEYS.kangemi, "ward", "Kangemi", WL),
    area(KEYS.parklands, "ward", "Parklands", WL),
    area(KEYS.mwiki, "ward", "Mwiki", KS),
    area(KEYS.utawala, "ward", "Utawala", EE),
  ],
  candidates: [
    {
      id: "a",
      election: "2022-governor",
      seat: "nairobi",
      name: "Candidate A",
      party: "Party A",
      bloc: "Bloc A",
    },
    {
      id: "b",
      election: "2022-governor",
      seat: "nairobi",
      name: "Candidate B",
      party: "Party B",
      bloc: "Bloc B",
    },
  ],
  results: (
    [
      [DN, 46_100, 48_000],
      [WL, 65_000, 35_000],
      [KS, 55_000, 45_000],
      [EE, 30_000, 70_000],
    ] as const
  ).flatMap(([at, a, b]) => [
    { candidate: "a", area: at, votes: a, source: "iebc" },
    { candidate: "b", area: at, votes: b, source: "iebc" },
  ]),
  turnout: (
    [
      ["nairobi", 1_000_000, 500_000, 499_000],
      [DN, 200_000, 101_000, 100_000],
      [WL, 160_000, 100_500, 100_000],
      [KS, 250_000, 101_000, 100_000],
      [EE, 180_000, 101_000, 100_000],
    ] as const
  ).map(([at, registered, cast, valid]) => ({
    election: "2022-governor",
    area: at,
    registered,
    cast,
    rejected: 1_000,
    valid,
    source: "iebc",
  })),
  register: (
    [
      [KEYS.kawangware, 52_000],
      [KEYS.kileleshwa, 48_000],
      [KEYS.kangemi, 40_000],
      [KEYS.parklands, 30_000],
      [KEYS.mwiki, 60_000],
      [KEYS.utawala, 45_000],
    ] as const
  ).map(([at, registered]) => ({ year: 2022, area: at, registered, source: "iebc" })),
  population: (
    [
      [KEYS.kawangware, 66_500],
      [KEYS.kileleshwa, 50_000],
      [KEYS.kangemi, 41_000],
      [KEYS.parklands, 39_000],
      [KEYS.mwiki, 63_000],
      [KEYS.utawala, 44_000],
    ] as const
  ).map(([at, adults]) => ({
    area: at,
    year: 2020,
    total: adults * 2,
    adults,
    youngAdults: adults / 2,
    source: "worldpop",
  })),
  sources: [
    { id: "iebc", title: "Results", publisher: "IEBC", url: null, note: null },
    { id: "worldpop", title: "Population", publisher: "WorldPop", url: null, note: null },
    {
      id: "ob",
      title: "Open Buildings v3",
      publisher: "Google Open Buildings",
      url: null,
      note: null,
    },
  ],
  indicators: (
    [
      [KEYS.kawangware, 4_739],
      [KEYS.kileleshwa, 1_255],
      [KEYS.kangemi, 6_000],
      [KEYS.parklands, 2_500],
    ] as const
  ).map(([at, value]) => ({
    area: at,
    indicator: "buildings_per_km2" as const,
    year: 2023,
    value,
    source: "ob",
  })),
  homeArea: null,
  sides: { "2022-governor": "Bloc A" },
  notes: {},
  profiles: {},
};

const ward = (
  slug: keyof typeof KEYS,
  name: string,
  constituency: string,
  targetVotes: number,
): FindingsWard => ({
  id: `w-${slug}`,
  name,
  slug,
  constituency,
  key: KEYS[slug],
  targetVotes,
});
export const WARDS: FindingsWard[] = [
  ward("kawangware", "Kawangware", "Dagoretti North", 6_000),
  ward("kileleshwa", "Kileleshwa", "Dagoretti North", 5_000),
  ward("kangemi", "Kangemi", "Westlands", 4_000),
  ward("parklands", "Parklands", "Westlands", 3_000),
  ward("mwiki", "Mwiki", "Kasarani", 0),
  ward("utawala", "Utawala", "Embakasi East", 2_000),
];

const doors = (wardId: string, knocked: number) => ({
  wardId,
  knocked,
  rated: 0,
  supporters: 0,
  doorsWeek: 0,
  agentsToday: [],
});

const stop = (
  id: string,
  day: string,
  kind: DiaryEntry["kind"],
  wardId: string | null,
): DiaryEntry => ({
  id,
  day,
  startsAt: null,
  title: `Stop ${id}`,
  kind,
  wardId,
  wardName: null,
  note: null,
});

export const RIVALS: RaceRival[] = (
  [
    ["us", "Our Candidate", true],
    ["r-a", "Challenger A", false],
    ["r-b", "Challenger B", false],
  ] as const
).map(([id, name, isUs], n) => ({
  id,
  name,
  party: null,
  office: null,
  isUs,
  tone: isUs ? "us" : "a",
  sort: n,
  facebook: null,
  x: null,
  tiktok: null,
  searchAs: null,
}));

export const poll = (
  id: string,
  publishedOn: string,
  shares: [string, number][],
  margin: number | null = null,
): RacePoll => ({
  id,
  pollster: "Pollster B",
  fieldworkFrom: null,
  fieldworkTo: null,
  publishedOn,
  sampleSize: 1_200,
  margin,
  sourceUrl: `https://example.test/${id}`,
  shares: shares.map(([rivalId, share]) => ({
    name: RIVALS.find((r) => r.id === rivalId)!.name,
    share,
    rivalId,
  })),
  undecided: null,
  approval: null,
  disapproval: null,
});

/** Every rule fires once on this, today being 13 October 2026. */
export const FULL: FindingsInput = {
  today: "2026-10-13",
  home: "nairobi",
  race: "governor",
  atlas: ATLAS,
  wards: WARDS,
  houses: {
    kawangware: 8_830,
    kileleshwa: 4_200,
    kangemi: 7_000,
    parklands: 3_000,
    mwiki: 9_000,
    utawala: 5_000,
  },
  doors: [
    doors("w-kawangware", 177),
    doors("w-kileleshwa", 1_260),
    doors("w-kangemi", 700),
    doors("w-parklands", 900),
    doors("w-mwiki", 450),
    doors("w-utawala", 2_000),
  ],
  supporters: [
    { wardId: "w-kawangware", supporters: 1_204 },
    { wardId: "w-kileleshwa", supporters: 5_200 },
    { wardId: "w-kangemi", supporters: 3_000 },
    { wardId: "w-parklands", supporters: 3_100 },
    { wardId: "w-utawala", supporters: 2_000 },
  ],
  spend: [
    { wardId: "w-kawangware", kes: 1_000 },
    { wardId: "w-kileleshwa", kes: 20_000 },
    { wardId: "w-kangemi", kes: 10_000 },
    { wardId: "w-parklands", kes: 9_000 },
    { wardId: "w-utawala", kes: 10_000 },
  ],
  issues: [
    { wardId: "w-kawangware", source: "door", issue: "Water", n: 12 },
    { wardId: "w-kawangware", source: "door", issue: "Roads", n: 8 },
    { wardId: "w-kawangware", source: "door", issue: "jobs", n: 11 },
    { wardId: "w-kawangware", source: "messages", issue: "Water and sanitation", n: 6 },
    { wardId: "w-kawangware", source: "messages", issue: "Rents", n: 9 },
    { wardId: "w-kawangware", source: "news", issue: "water", n: 2 },
    { wardId: "w-kawangware", source: "news", issue: "road", n: 4 },
    { wardId: "w-kileleshwa", source: "door", issue: "Security", n: 5 },
    { wardId: "w-kileleshwa", source: "door", issue: "Water", n: 4 },
  ],
  issueWeeks: [
    { week: 0, source: "door", issue: "Floods", n: 6 },
    { week: 0, source: "door", issue: "Water", n: 4 },
    { week: 0, source: "messages", issue: "flooding", n: 4 },
    { week: 0, source: "messages", issue: "Water", n: 2 },
    { week: 0, source: "news", issue: "Floods", n: 1 },
    { week: 2, source: "door", issue: "Floods", n: 2 },
    { week: 2, source: "door", issue: "Water", n: 30 },
    { week: 3, source: "messages", issue: "Floods", n: 1 },
    { week: 3, source: "messages", issue: "Water", n: 24 },
    { week: 4, source: "news", issue: "Floods", n: 10 },
    { week: 4, source: "news", issue: "Water", n: 20 },
  ],
  rivalWeeks: [
    { week: 0, rivalId: null, n: 50 },
    { week: 1, rivalId: null, n: 50 },
    { week: 2, rivalId: null, n: 50 },
    { week: 3, rivalId: null, n: 50 },
    { week: 4, rivalId: null, n: 50 },
    { week: 0, rivalId: "r-a", n: 21 },
    { week: 2, rivalId: "r-a", n: 20 },
    { week: 4, rivalId: "r-a", n: 16 },
    { week: 0, rivalId: "r-b", n: 5 },
  ],
  diary: [
    stop("d1", "2026-10-01", "visit", "w-kangemi"),
    stop("d2", "2026-10-05", "market", "w-parklands"),
    stop("d3", "2026-10-09", "church", "w-kangemi"),
    stop("d4", "2026-10-20", "rally", "w-parklands"),
    stop("d5", "2026-09-20", "visit", "w-kawangware"),
    stop("d6", "2026-10-15", "meeting", "w-kawangware"),
    stop("d7", "2026-10-14", "watch", "w-mwiki"),
    stop("d8", "2026-10-10", "media", null),
  ],
  rivals: RIVALS,
  polls: [
    poll("older", "2026-08-15", [
      ["us", 33],
      ["r-a", 31],
      ["r-b", 20],
    ]),
    poll(
      "newer",
      "2026-10-01",
      [
        ["us", 32],
        ["r-a", 35],
        ["r-b", 19],
      ],
      2.5,
    ),
  ],
};

/** The full input with some of it replaced. */
export const input = (over: Partial<FindingsInput> = {}): FindingsInput => ({ ...FULL, ...over });
