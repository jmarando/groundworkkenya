// Checks for crowd events: the searches an area gets, the places they name, and the checks every
// event the AI names must pass before it is kept. Pure; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/crowd-events.test.ts

import {
  AHEAD_DAYS,
  areaOf,
  cleanCrowdEvents,
  crowdHits,
  crowdPrompt,
  crowdQueries,
  dedupeKey,
  DIARY_KIND_OF,
  MAX_HITS,
  nextLastRun,
  placeTerms,
  statesDay,
  upcoming,
  type CrowdArea,
  type CrowdEvent,
  type CrowdHit,
} from "@/lib/crowd-events";
import { crowdComing } from "@/lib/findings/crowds";
import { unaccounted, type FindingsInput } from "@/lib/findings/core";
import { crowdItem, realToday } from "@/lib/home";
import { crowdWeek } from "@/lib/home.functions";

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

// ---- the places a campaign's searches name
const names = new Map([
  ["meru", "Meru"],
  ["kiambu", "Kiambu"],
  ["kiambu/githunguri", "Githunguri"],
  ["meru/tigania-west", "Tigania West"],
  ["meru/tigania-west/athwana", "Athwana"],
]);
const camp = (level: string, map_area: string | null) => ({
  id: "c",
  slug: "s",
  level,
  seat: "Seat",
  map_area,
});
eq(
  "a county seat searches its county; an MP the constituency; an MCA the ward and constituency",
  [
    areaOf(camp("woman-rep", "meru"), [], names)?.places,
    areaOf(camp("mp", "kiambu/githunguri"), [], names)?.places,
    areaOf(camp("mca", "meru/tigania-west/athwana"), [], names)?.places,
  ],
  [["Meru"], ["Githunguri"], ["Athwana", "Tigania West"]],
);
eq(
  "a president, or a campaign with no map, has no area to search",
  [areaOf(camp("president", "nairobi"), [], names), areaOf(camp("mp", null), [], names)],
  [null, null],
);
eq(
  "the county a constituency sits in",
  areaOf(camp("mp", "kiambu/githunguri"), [], names)?.county,
  "Kiambu",
);

// ---- the searches
const AREA: CrowdArea = {
  places: ["Athwana", "Tigania West"],
  county: "Meru",
  wards: [
    { id: "w1", name: "Kiirua/Naari", slug: "kiirua-naari" },
    { id: "w2", name: "Akirang'ondu", slug: "akirang-ondu" },
    { id: "w3", name: "Nkuene", slug: "nkuene" },
  ],
};
const qs = crowdQueries(AREA);
eq("four searches", qs.length, 4);
eq(
  "each names the places, a two-word one quoted",
  qs.every((q) => q.startsWith('(Athwana OR "Tigania West") (')),
  true,
);
eq(
  "funerals, church and harambees, sports, then shows and school days",
  qs.map((q) => /funeral|harambee|tournament|graduation/.exec(q)?.[0]),
  ["funeral", "harambee", "tournament", "graduation"],
);
eq(
  "one place alone isn't bracketed",
  crowdQueries({ ...AREA, places: ["Meru"] })[0]!.startsWith("Meru (funeral"),
  true,
);

// ---- the results the AI reads
const hit = (url: string, publishedAt: string | null = null): CrowdHit => ({
  url,
  title: `Title ${url.slice(-1)}`,
  snippet: "snippet",
  outlet: "The Star",
  publishedAt,
});
const hits = crowdHits([
  hit("https://a.ke/1", "2026-11-18T08:00:00Z"),
  hit("http://insecure.ke/2", "2026-11-19T08:00:00Z"),
  hit("https://a.ke/1", "2026-11-18T08:00:00Z"),
  hit("https://b.ke/3", "2026-11-19T09:00:00Z"),
]);
eq(
  "https only, each once, newest first",
  hits.map((h) => h.url),
  ["https://b.ke/3", "https://a.ke/1"],
);
eq(
  "at most MAX_HITS",
  crowdHits(Array.from({ length: 50 }, (_, n) => hit(`https://x.ke/${n}`))).length,
  MAX_HITS,
);
const prompt = crowdPrompt("Woman Rep · Meru", AREA, hits, "2026-11-20");
eq(
  "the prompt gives today, the window's end, the wards and every link, and asks for the date's words",
  [
    prompt.includes("Today is 2026-11-20"),
    prompt.includes("2026-12-11"),
    prompt.includes("Kiirua/Naari"),
    prompt.includes("https://b.ke/3"),
    prompt.includes('"date_text"'),
    prompt.includes("The result must name the place"),
  ],
  [true, true, true, true, true, true],
);

// ---- the area's names and the date's words
eq(
  "the names a result must mention: places, county, wards and their parts, a name without its East or Town",
  [...placeTerms(AREA)].sort(),
  ["akirang ondu", "athwana", "kiirua", "meru", "naari", "nkuene", "tigania", "tigania west"],
);
eq(
  "a ward that is an everyday word doesn't count, nor its bare word",
  placeTerms({
    places: ["Kuria East"],
    county: "Migori",
    wards: [
      { id: "a", name: "Municipality", slug: "municipality" },
      { id: "b", name: "Kahawa West", slug: "kahawa-west" },
      { id: "c", name: "Karatina Town", slug: "karatina-town" },
    ],
  }).sort(),
  ["kahawa west", "karatina", "karatina town", "kuria", "kuria east", "migori"],
);
eq(
  "words that state the day: a month with its number, D/M, a weekday; a wrong day, year or no date do not",
  [
    statesDay("November 27-29", "2026-11-27"),
    statesDay("on 27th November", "2026-11-27"),
    statesDay("28.11.2026", "2026-11-28"),
    statesDay("this Saturday", "2026-11-28"),
    statesDay("December 12, 2026", "2026-12-12"),
    statesDay("Nov 28", "2026-11-27"),
    statesDay("December 12, 2025", "2026-12-12"),
    statesDay("this Friday", "2026-11-28"),
    statesDay("next week", "2026-11-28"),
  ],
  [true, true, true, true, true, false, false, false, false],
);

// ---- the checks
const TODAY = "2026-11-20";
const said = (url: string, title: string, snippet: string): CrowdHit => ({
  url,
  title,
  snippet,
  outlet: "The Star",
  publishedAt: "2026-11-18T08:00:00Z",
});
const CHECKED = [
  said(
    "https://a.ke/1",
    "Burial of the late Mzee Example",
    "Mourners will gather at Kiirua on Saturday, November 28 for the burial.",
  ),
  said(
    "https://a.ke/today",
    "Athwana crusade opens",
    "It opens on Friday, November 20 at Athwana.",
  ),
  said(
    "https://a.ke/last",
    "Tigania West sports day",
    "It is on 11 December 2026 in Tigania West.",
  ),
  said(
    "https://a.ke/far",
    "Kaimosi Friends University graduation",
    "Its fifth graduation is on November 28.",
  ),
  said("https://a.ke/numeric", "Nkuene harambee", "The harambee is set for 28/11/2026 at Nkuene."),
  said(
    "https://a.ke/weekday",
    "Kiirua church harambee this Saturday",
    "Members meet this Saturday.",
  ),
  said(
    "https://a.ke/lastyear",
    "Athwana show",
    "The show was held on November 28, 2025 at Athwana.",
  ),
  said(
    "https://a.ke/everyday",
    "Municipality market day",
    "The municipality market day is on November 28.",
  ),
];
const ok = {
  kind: "funeral",
  title: "Burial of the late Mzee Example",
  date: "2026-11-28",
  date_text: "Saturday, November 28",
  time: "10:00",
  place: "Kiirua Catholic Church",
  ward: "Kiirua/Naari",
  crowd: "hundreds expected",
  why: "Kiirua/Naari is a big ward.",
  url: "https://a.ke/1",
};
const kept = cleanCrowdEvents({ events: [ok] }, CHECKED, AREA, TODAY);
eq("a good event is kept, with its ward, source and dedupe key", kept, [
  {
    kind: "funeral",
    title: "Burial of the late Mzee Example",
    starts_on: "2026-11-28",
    starts_at: "10:00",
    place: "Kiirua Catholic Church",
    ward_id: "w1",
    crowd: "hundreds expected",
    why: "Kiirua/Naari is a big ward.",
    source_url: "https://a.ke/1",
    source_title: "Burial of the late Mzee Example",
    source_name: "The Star",
    dedupe: "burial-of-the-late-mzee-example|2026-11-28",
  },
]);
const rejected = [
  { ...ok, kind: "rally" },
  { ...ok, url: "https://not-among-results.ke/9" },
  { ...ok, date: "2026-11-19" },
  { ...ok, date: "2026-12-12" },
  { ...ok, date: "28 November" },
  { ...ok, date: "2026-02-30" },
  { ...ok, title: " " },
];
eq(
  "an unknown kind, a link not searched, a past day, a day past the window, a day not as YYYY-MM-DD, an impossible day, no title: all left out",
  rejected.map((e) => cleanCrowdEvents({ events: [e] }, CHECKED, AREA, TODAY).length),
  [0, 0, 0, 0, 0, 0, 0],
);
eq(
  "today and the window's last day are in",
  [
    cleanCrowdEvents(
      {
        events: [
          { ...ok, url: "https://a.ke/today", date: TODAY, date_text: "Friday, November 20" },
        ],
      },
      CHECKED,
      AREA,
      TODAY,
    ).length,
    cleanCrowdEvents(
      {
        events: [
          { ...ok, url: "https://a.ke/last", date: "2026-12-11", date_text: "11 December 2026" },
        ],
      },
      CHECKED,
      AREA,
      TODAY,
    ).length,
  ],
  [1, 1],
);
const keeps = (e: Record<string, unknown>, area: CrowdArea = AREA) =>
  cleanCrowdEvents({ events: [{ ...ok, ...e }] }, CHECKED, area, TODAY).length;
eq(
  "the date's words must be the result's own and state the day: not in it, another day, none, or a guess are left out",
  [
    keeps({ date_text: "November 29" }),
    keeps({ date: "2026-11-27" }),
    keeps({ date_text: "" }),
    keeps({ date_text: "this weekend" }),
    keeps({ date: TODAY, date_text: "Saturday, November 28" }),
  ],
  [0, 0, 0, 0, 0],
);
eq(
  "a weekday alone or a D/M date is kept when it is the day; a past year is not",
  [
    keeps({ url: "https://a.ke/weekday", date_text: "this Saturday" }),
    keeps({ url: "https://a.ke/weekday", date: "2026-11-27", date_text: "this Saturday" }),
    keeps({ url: "https://a.ke/numeric", date_text: "28/11/2026" }),
    keeps({ url: "https://a.ke/lastyear", date_text: "November 28, 2025" }),
  ],
  [1, 0, 1, 0],
);
eq(
  "a result that names no place in the area is left out, an everyday ward name proving nothing",
  [
    keeps({ url: "https://a.ke/far", date_text: "November 28" }),
    keeps(
      { url: "https://a.ke/everyday", date_text: "November 28" },
      { ...AREA, wards: [...AREA.wards, { id: "w4", name: "Municipality", slug: "municipality" }] },
    ),
  ],
  [0, 0],
);
eq(
  "a time not as HH:MM is dropped, not the event; a ward not the campaign's is none",
  cleanCrowdEvents(
    { events: [{ ...ok, time: "10am", ward: "Westlands" }] },
    CHECKED,
    AREA,
    TODAY,
  ).map((e) => [e.starts_at, e.ward_id]),
  [[null, null]],
);
eq(
  "a ward matched however the AI writes it",
  cleanCrowdEvents({ events: [{ ...ok, ward: "akirang'ondu" }] }, CHECKED, AREA, TODAY)[0]?.ward_id,
  "w2",
);
eq(
  "the same event twice is kept once",
  cleanCrowdEvents(
    { events: [ok, { ...ok, title: "Burial of the late Mzee Example!" }] },
    CHECKED,
    AREA,
    TODAY,
  ).length,
  1,
);
eq(
  "an answer that isn't a list keeps nothing",
  [
    cleanCrowdEvents(null, hits, AREA, TODAY),
    cleanCrowdEvents({ events: "no" }, hits, AREA, TODAY),
  ],
  [[], []],
);
eq(
  "a dedupe key folds the name",
  dedupeKey("Kiirua  Crusade!!", "2026-12-01"),
  "kiirua-crusade|2026-12-01",
);
eq("the window is three weeks", AHEAD_DAYS, 21);
const NOW = new Date("2026-11-20T03:10:00.000Z");
eq(
  "a stopped run keeps the last run's time, so the next hour tries again; a run that searched records now",
  [
    nextLastRun(true, null, NOW),
    nextLastRun(true, "2026-11-19T00:30:00.000Z", NOW),
    nextLastRun(false, "2026-11-19T00:30:00.000Z", NOW),
  ],
  [null, "2026-11-19T00:30:00.000Z", "2026-11-20T03:10:00.000Z"],
);
eq(
  "in the diary a funeral stays a funeral, a tournament is a visit",
  [DIARY_KIND_OF.funeral, DIARY_KIND_OF.church, DIARY_KIND_OF.sports, DIARY_KIND_OF.market],
  ["funeral", "church", "visit", "market"],
);

// ---- what the screens show
const ev = (id: string, day: string, extra: Partial<CrowdEvent> = {}): CrowdEvent => ({
  id,
  kind: "church",
  title: `Event ${id}`,
  day,
  startsAt: null,
  place: null,
  wardId: null,
  wardName: null,
  crowd: null,
  why: null,
  url: "https://a.ke/1",
  sourceName: null,
  status: "new",
  diaryEntryId: null,
  ...extra,
});
eq(
  "upcoming: by day then time, past and set-aside ones out",
  upcoming(
    [
      ev("a", "2026-11-22", { startsAt: "15:00" }),
      ev("b", "2026-11-22", { startsAt: "09:00" }),
      ev("c", "2026-11-19"),
      ev("d", "2026-11-21", { status: "dismissed" }),
      ev("e", "2026-11-21", { status: "added" }),
    ],
    TODAY,
  ).map((e) => e.id),
  ["e", "b", "a"],
);
eq(
  "Home counts the week's open events and those in the campaign's wards",
  crowdWeek(
    [
      ev("a", "2026-11-21", { wardId: "w1" }),
      ev("b", "2026-11-26"),
      ev("c", "2026-11-27", { wardId: "w2" }),
      ev("d", "2026-11-22", { status: "added", wardId: "w1" }),
    ],
    TODAY,
  ),
  { week: 2, inWards: 1 },
);
eq("Home's line", crowdItem({ week: 2, inWards: 1 }), {
  title: "2 crowd events in the next 7 days",
  detail:
    "Funerals, church events, harambees, tournaments and shows found in the news. 1 is in your wards.",
  action: { kind: "go", label: "See where", to: "/diary" },
});
eq(
  "it comes after what is waiting on the campaign",
  realToday({ pendingExpenses: 1, unread: 0, mind: null, crowds: { week: 3, inWards: 3 } }).map(
    (i) => i.title,
  ),
  ["1 expense to approve", "3 crowd events in the next 7 days"],
);
eq(
  "no line when nothing is coming",
  realToday({ pendingExpenses: 0, unread: 0, mind: null, crowds: { week: 0, inWards: 0 } }),
  [],
);

// ---- the finding on Strategy
const input = {
  today: TODAY,
  home: "meru",
  race: "woman_rep",
  atlas: {
    areas: [
      { key: "meru", level: "county", name: "Meru", parent: "kenya" },
      { key: "meru/buuri", level: "constituency", name: "Buuri", parent: "meru" },
      { key: "meru/buuri/kiirua-naari", level: "ward", name: "Kiirua/Naari", parent: "meru/buuri" },
    ],
    candidates: [],
    results: [],
    turnout: [],
    register: [{ year: 2022, area: "meru/buuri/kiirua-naari", registered: 15690, source: "iebc" }],
    sources: [],
    population: [],
    indicators: [],
    homeArea: null,
    sides: {},
    notes: {},
    profiles: {},
  },
  wards: [
    {
      id: "w1",
      name: "Kiirua/Naari",
      slug: "kiirua-naari",
      constituency: "Buuri",
      key: "meru/buuri/kiirua-naari",
      targetVotes: 5799,
    },
  ],
  houses: null,
  doors: null,
  supporters: null,
  spend: null,
  issues: null,
  issueWeeks: null,
  rivalWeeks: null,
  diary: [],
  rivals: [],
  polls: [],
  crowds: [
    {
      id: "e1",
      kind: "funeral",
      title: "Burial of the late Mzee Example, 2026",
      day: "2026-11-26",
      wardId: "w1",
      sourceName: "The Star",
    },
    {
      id: "e2",
      kind: "church",
      title: "Far away",
      day: "2026-12-05",
      wardId: "w1",
      sourceName: null,
    },
    {
      id: "e3",
      kind: "sports",
      title: "No ward",
      day: "2026-11-22",
      wardId: null,
      sourceName: null,
    },
  ],
} as unknown as FindingsInput;
const found = crowdComing(input);
eq(
  "one finding: the week's crowd in a mapped ward; one past the week or with no ward says nothing",
  found.map((f) => [f.rule, f.decision, f.place, f.line]),
  [
    [
      "crowd-coming",
      "time",
      "meru/buuri/kiirua-naari",
      "A funeral in Kiirua/Naari on Thu 26 Nov, a ward of 15,690 registered voters. Not in the diary yet.",
    ],
  ],
);
eq(
  "every number in it is a figure, the event's title kept off the line",
  unaccounted(found[0]!),
  [],
);
eq("none before schema 50", crowdComing({ ...input, crowds: null }), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
