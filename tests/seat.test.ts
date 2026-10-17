// Checks for the seat reader behind Path to City Hall: a county's 2022 governor
// result by constituency, read from the atlas's rows (the real Nairobi rows and
// small made-up atlases). Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/seat.test.ts

import type { AtlasData } from "@/lib/atlas-view";
import {
  flipSeat,
  placeOfSeat,
  seatForCampaign,
  seatFromAtlas,
  togetherName,
  type Seat,
} from "@/lib/seat";

import { atlasFromCsv, candidateId } from "./atlas-csv";

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

const real = atlasFromCsv();
const seatOf = (d: AtlasData, county: string, bloc: string | null): Seat => {
  const r = seatFromAtlas(d, county, bloc);
  if (!r.ok) throw new Error(r.why);
  return r.seat;
};
const refusal = (d: AtlasData, county: string, bloc: string | null = null) => {
  const r = seatFromAtlas(d, county, bloc);
  return r.ok ? "" : r.why;
};

// ---------------------------------------------------------- Nairobi, 2022 governor

{
  const s = seatOf(real, "nairobi", "Kenya Kwanza");
  eq(
    "the county and its race",
    [s.county, s.countyName, s.election],
    ["nairobi", "Nairobi", "2022-governor"],
  );
  eq(
    "the two main candidates and the rest, county-wide",
    [s.yours, s.rival, s.total, s.others, s.topOther],
    [
      { name: "Johnson Sakaja", bloc: "Kenya Kwanza" },
      { name: "Polycarp Igathe", bloc: "Azimio" },
      { yours: 699392, rival: 573516, valid: 1324409 },
      51501,
      10521,
    ],
  );
  eq(
    "13 constituencies reported separately, then the four Embakasi seats together",
    s.buckets.map((b) => [b.name, b.seats, b.together]),
    [
      ["Dagoretti North", 1, false],
      ["Dagoretti South", 1, false],
      ["Embakasi West", 1, false],
      ["Kamukunji", 1, false],
      ["Kasarani", 1, false],
      ["Kibra", 1, false],
      ["Langata", 1, false],
      ["Makadara", 1, false],
      ["Mathare", 1, false],
      ["Roysambu", 1, false],
      ["Ruaraka", 1, false],
      ["Starehe", 1, false],
      ["Westlands", 1, false],
      ["Embakasi Central, East, North and South", 4, true],
    ],
  );
  const kasarani = s.buckets.find((b) => b.key === "nairobi/kasarani")!;
  eq(
    "Kasarani: the votes and the register",
    [kasarani.yours, kasarani.rival, kasarani.registered],
    [60578, 27862, 155250],
  );
  const rest = s.buckets.find((b) => b.together)!;
  eq(
    "the seats together: the county's total less the others, with their registers",
    [rest.key, rest.yours, rest.rival, rest.registered],
    ["nairobi#together", 165801, 140487, 581788],
  );
  eq(
    "the buckets add up to the county's totals",
    [s.buckets.reduce((t, b) => t + b.yours, 0), s.buckets.reduce((t, b) => t + b.rival, 0)],
    [699392, 573516],
  );
  eq(
    "a constituency's register is its own 2022 row",
    s.buckets.filter((b) => !b.together).map((b) => b.registered),
    [
      157659, 114930, 141878, 128516, 155250, 128282, 145649, 129627, 123163, 153772, 124482,
      169575, 160739,
    ],
  );
  eq("the sources are named as the atlas names them", s.source, {
    constituencies: "The Star: Sakaja declared winner in Nairobi governor race",
    county: "Provisional results: 2022 Governor result, Nairobi City County",
    president:
      "IEBC: Declaration of results for the election of President, national tallying centre, by county (Form 34C summary), 2022",
  });
}

// ---------------------------------------------------------- which side is yours

{
  const kwanza = seatOf(real, "nairobi", "Kenya Kwanza");
  const azimio = seatOf(real, "nairobi", "Azimio");
  eq(
    "the campaign's bloc is yours (Kenya Kwanza)",
    [kwanza.yours.name, kwanza.rival.name, kwanza.defaulted],
    ["Johnson Sakaja", "Polycarp Igathe", false],
  );
  eq(
    "the campaign's bloc is yours (Azimio)",
    [azimio.yours.name, azimio.rival.name, azimio.defaulted],
    ["Polycarp Igathe", "Johnson Sakaja", false],
  );
  eq("the buckets follow", [azimio.buckets[4]!.yours, azimio.buckets[4]!.rival], [27862, 60578]);
  eq(
    "the totals follow",
    [azimio.total, azimio.others, azimio.topOther],
    [{ yours: 573516, rival: 699392, valid: 1324409 }, 51501, 10521],
  );
  const none = seatOf(real, "nairobi", null);
  const stranger = seatOf(real, "nairobi", "No Such Bloc");
  eq(
    "no bloc, or one that isn't in the race: the winner, said to be a default",
    [none.yours.name, none.defaulted, stranger.yours.name, stranger.defaulted],
    ["Johnson Sakaja", true, "Johnson Sakaja", true],
  );
}

// ---------------------------------------------------------- the presidential vote in the county

{
  const s = seatOf(real, "nairobi", "Kenya Kwanza");
  eq("the presidential candidates of the same two blocs, in the county", s.president, {
    yours: { name: "William Ruto", votes: 561775 },
    rival: { name: "Raila Odinga", votes: 767395 },
  });
  eq("the other side's view", seatOf(real, "nairobi", "Azimio").president, {
    yours: { name: "Raila Odinga", votes: 767395 },
    rival: { name: "William Ruto", votes: 561775 },
  });
  eq(
    "its source is named",
    s.source.president,
    "IEBC: Declaration of results for the election of President, national tallying centre, by county (Form 34C summary), 2022",
  );
}

// ---------------------------------------------------------- flipping

{
  const s = seatOf(real, "nairobi", "Kenya Kwanza");
  const f = flipSeat(s);
  eq(
    "flipped: the contenders, totals, president and the default flag",
    [f.yours.name, f.rival.name, f.total, f.president, f.defaulted],
    [
      "Polycarp Igathe",
      "Johnson Sakaja",
      { yours: 573516, rival: 699392, valid: 1324409 },
      {
        yours: { name: "Raila Odinga", votes: 767395 },
        rival: { name: "William Ruto", votes: 561775 },
      },
      false,
    ],
  );
  eq(
    "flipped: every bucket",
    f.buckets.map((b) => [b.yours, b.rival, b.registered]),
    s.buckets.map((b) => [b.rival, b.yours, b.registered]),
  );
  eq("flipped twice is the seat, but for the default flag", flipSeat(f), {
    ...s,
    defaulted: false,
  });
  eq(
    "a defaulted seat flipped is no longer a default",
    flipSeat(seatOf(real, "nairobi", null)).defaulted,
    false,
  );
  eq(
    "a flip of the same seat as Azimio's is Azimio's",
    { ...flipSeat(s), source: 0 },
    { ...seatOf(real, "nairobi", "Azimio"), source: 0 },
  );
}

// ---------------------------------------------------------- counties the atlas can't do

eq(
  "Nyeri: the governor result is for the county only",
  refusal(real, "nyeri"),
  "Nyeri's 2022 governor result is on file for the county as a whole, not by constituency.",
);
eq(
  "a county the atlas has no governor race for",
  refusal(real, "kenya"),
  "The 2022 governor result isn't on file for Kenya.",
);
eq(
  "an area the atlas doesn't know",
  refusal(real, "nowhere"),
  "The 2022 governor result isn't on file for nowhere.",
);

// ---------------------------------------------------------- made-up atlases

type Toy = {
  /** Constituency results as [name, A, B, source id]. */
  cons: [string, number, number, string?][];
  /** County totals for A, B and C. */
  county: [number, number, number];
  /** Registers: [constituency name, own row | null, ward numbers]. */
  register: [string, number | null, number[]][];
  presidentBlocs?: [string, string];
  /** The source ids of the two presidential rows. */
  presidentSources?: [string, string];
  /** Leave the sources table empty, so a label can only be the id. */
  noSources?: boolean;
};
function toyAtlas(t: Toy): AtlasData {
  const key = (n: string) => `x/${n.toLowerCase()}`;
  const gov = (name: string) => candidateId("2022-governor", "x", name);
  const pres = (name: string) => candidateId("2022-president", "kenya", name);
  const pb = t.presidentBlocs ?? ["Bloc P", "Bloc Q"];
  return {
    areas: [
      { key: "kenya", level: "country", name: "Kenya", parent: null },
      { key: "x", level: "county", name: "Xland", parent: "kenya" },
      ...t.register.map(([n]) => ({
        key: key(n),
        level: "constituency" as const,
        name: n,
        parent: "x",
      })),
      ...t.register.flatMap(([n, , wards]) =>
        wards.map((_, i) => ({
          key: `${key(n)}/w${i}`,
          level: "ward" as const,
          name: `${n} ward ${i}`,
          parent: key(n),
        })),
      ),
    ],
    candidates: [
      {
        id: gov("Ann"),
        election: "2022-governor",
        seat: "x",
        name: "Ann",
        party: "PA",
        bloc: "Bloc P",
      },
      {
        id: gov("Ben"),
        election: "2022-governor",
        seat: "x",
        name: "Ben",
        party: "PB",
        bloc: "Bloc Q",
      },
      {
        id: gov("Cy"),
        election: "2022-governor",
        seat: "x",
        name: "Cy",
        party: "PC",
        bloc: "Bloc R",
      },
      {
        id: pres("Pat"),
        election: "2022-president",
        seat: "kenya",
        name: "Pat",
        party: "P1",
        bloc: pb[0],
      },
      {
        id: pres("Quin"),
        election: "2022-president",
        seat: "kenya",
        name: "Quin",
        party: "P2",
        bloc: pb[1],
      },
    ],
    results: [
      { candidate: gov("Ann"), area: "x", votes: t.county[0], source: "county" },
      { candidate: gov("Ben"), area: "x", votes: t.county[1], source: "county" },
      { candidate: gov("Cy"), area: "x", votes: t.county[2], source: "county" },
      ...t.cons.flatMap(([n, a, b, src]) => [
        { candidate: gov("Ann"), area: key(n), votes: a, source: src ?? "press" },
        { candidate: gov("Ben"), area: key(n), votes: b, source: src ?? "press" },
      ]),
      { candidate: pres("Pat"), area: "x", votes: 5000, source: t.presidentSources?.[0] ?? "iebc" },
      {
        candidate: pres("Quin"),
        area: "x",
        votes: 7000,
        source: t.presidentSources?.[1] ?? "iebc",
      },
    ],
    turnout: [],
    register: t.register.flatMap(([n, own, wards]) => [
      // An older register for every area, which a 2022 reading must not touch.
      { year: 2017, area: key(n), registered: 7, source: "reg" },
      ...wards.map((_, i) => ({
        year: 2017,
        area: `${key(n)}/w${i}`,
        registered: 7,
        source: "reg",
      })),
      ...(own === null ? [] : [{ year: 2022, area: key(n), registered: own, source: "reg" }]),
      ...wards.map((w, i) => ({
        year: 2022,
        area: `${key(n)}/w${i}`,
        registered: w,
        source: "reg",
      })),
    ]),
    population: [],
    sources: t.noSources
      ? []
      : [
          { id: "county", title: "County figures", publisher: "Pub1", url: null, note: null },
          { id: "press", title: "Constituency figures", publisher: "Pub2", url: null, note: null },
          { id: "iebc", title: "Presidential figures", publisher: "Pub3", url: null, note: null },
          {
            id: "iebc2",
            title: "More presidential figures",
            publisher: "Pub4",
            url: null,
            note: null,
          },
        ],
    indicators: [],
    homeArea: "x",
    sides: {},
    notes: {},
    profiles: {},
  };
}
const BASE: Toy = {
  cons: [
    ["Alpha", 400, 300],
    ["Beta", 250, 350],
    ["Gamma", 300, 200],
  ],
  county: [950, 850, 60],
  register: [
    ["Alpha", 1000, []],
    ["Beta", null, [300, 500]],
    ["Gamma", 900, [450, 450]],
  ],
};

{
  const s = seatOf(toyAtlas(BASE), "x", "Bloc P");
  eq(
    "a constituency's register is its own row, or else the sum of its wards",
    s.buckets.map((b) => [b.name, b.registered]),
    [
      ["Alpha", 1000],
      ["Beta", 800],
      ["Gamma", 900],
    ],
  );
  eq(
    "the county's totals are what the county row says",
    [s.total, s.others, s.topOther],
    [{ yours: 950, rival: 850, valid: 1860 }, 60, 60],
  );
  eq(
    "everything reported: no bucket for seats together, and the buckets are the constituencies",
    s.buckets.some((b) => b.together),
    false,
  );
  eq("a county's source labels are 'publisher: title'", s.source, {
    constituencies: "Pub2: Constituency figures",
    county: "Pub1: County figures",
    president: "Pub3: Presidential figures",
  });
  eq(
    "with no presidential candidate of the same blocs there is no ticket",
    seatOf(toyAtlas({ ...BASE, presidentBlocs: ["Bloc Z", "Bloc Y"] }), "x", "Bloc P").president,
    null,
  );
  eq(
    "with one of the two blocs missing there is no ticket either",
    seatOf(toyAtlas({ ...BASE, presidentBlocs: ["Bloc P", "Bloc Y"] }), "x", "Bloc P").president,
    null,
  );
  eq("the presidential candidates of the same blocs", s.president, {
    yours: { name: "Pat", votes: 5000 },
    rival: { name: "Quin", votes: 7000 },
  });
  eq(
    "a presidential result with no source in the table is named by its id",
    seatOf(toyAtlas({ ...BASE, noSources: true }), "x", "Bloc P").source.president,
    "iebc",
  );
  eq(
    "with no ticket there is no source for it",
    seatOf(toyAtlas({ ...BASE, presidentBlocs: ["Bloc Z", "Bloc Y"] }), "x", "Bloc P").source
      .president,
    null,
  );
  eq(
    "nor with one of the two blocs missing",
    seatOf(toyAtlas({ ...BASE, presidentBlocs: ["Bloc P", "Bloc Y"] }), "x", "Bloc P").source
      .president,
    null,
  );
  eq(
    "two presidential sources are both named, each once",
    seatOf(toyAtlas({ ...BASE, presidentSources: ["iebc", "iebc2"] }), "x", "Bloc P").source
      .president,
    "Pub3: Presidential figures; Pub4: More presidential figures",
  );
}
{
  // One constituency missing: the county's total less the others is the bucket.
  const t: Toy = { ...BASE, cons: [BASE.cons[0]!, BASE.cons[1]!], county: [950, 850, 60] };
  const s = seatOf(toyAtlas(t), "x", "Bloc P");
  const last = s.buckets[s.buckets.length - 1]!;
  eq(
    "one missing constituency becomes the remainder, named for itself",
    [last.name, last.seats, last.together, last.yours, last.rival, last.registered],
    ["Gamma", 1, true, 300, 200, 900],
  );
}
eq(
  "a remainder below zero for yours (the constituencies add up to more than the county) is refused",
  refusal(
    toyAtlas({ ...BASE, cons: [BASE.cons[0]!, BASE.cons[1]!], county: [600, 850, 60] }),
    "x",
    "Bloc P",
  ),
  "The constituency figures add up to more than the county's total.",
);
eq(
  "and for the rival",
  refusal(
    toyAtlas({ ...BASE, cons: [BASE.cons[0]!, BASE.cons[1]!], county: [950, 600, 60] }),
    "x",
    "Bloc P",
  ),
  "The constituency figures add up to more than the county's total.",
);
{
  // A remainder of nothing for one side is still a remainder.
  const s = seatOf(
    toyAtlas({ ...BASE, cons: [BASE.cons[0]!, BASE.cons[1]!], county: [950, 650, 60] }),
    "x",
    "Bloc P",
  );
  const last = s.buckets[s.buckets.length - 1]!;
  eq(
    "a remainder where the rival has nothing left is accepted",
    [last.yours, last.rival],
    [300, 0],
  );
  const t = seatOf(
    toyAtlas({ ...BASE, cons: [BASE.cons[0]!, BASE.cons[1]!], county: [650, 850, 60] }),
    "x",
    "Bloc P",
  );
  const lastT = t.buckets[t.buckets.length - 1]!;
  eq("and where yours has", [lastT.yours, lastT.rival], [0, 200]);
}
eq(
  "a candidate on their own in the county is no race",
  refusal(
    (() => {
      const a = toyAtlas(BASE);
      return { ...a, candidates: a.candidates.filter((c) => c.name !== "Ben" && c.name !== "Cy") };
    })(),
    "x",
  ),
  "The 2022 governor result isn't on file for Xland.",
);
{
  const stale = seatOf(toyAtlas(BASE), "x", "Bloc P");
  eq(
    "an older register is not read for 2022 (own row or wards)",
    stale.buckets.map((b) => b.registered),
    [1000, 800, 900],
  );
  const none = seatFromAtlas(toyAtlas(BASE), "x", "Bloc P", 2017);
  eq("and a year with no governor race says so", none.ok, false);
  const bare = seatOf(toyAtlas({ ...BASE, noSources: true }), "x", "Bloc P");
  eq("a source the atlas doesn't list is named by its id", bare.source, {
    constituencies: "press",
    county: "county",
    president: "iebc",
  });
  const mixed = seatOf(
    toyAtlas({
      ...BASE,
      cons: [
        ["Alpha", 400, 300],
        ["Beta", 250, 350, "county"],
        ["Gamma", 300, 200],
      ],
    }),
    "x",
    "Bloc P",
  );
  eq(
    "different sources are all named, each once, in the atlas's order",
    mixed.source.constituencies,
    "Pub2: Constituency figures; Pub1: County figures",
  );
}
eq(
  "a register smaller than the votes counted in a constituency is refused",
  refusal(
    toyAtlas({
      ...BASE,
      register: [
        ["Alpha", 600, []],
        ["Beta", null, [300, 500]],
        ["Gamma", 900, [450, 450]],
      ],
    }),
    "x",
    "Bloc P",
  ),
  "The 2022 register is smaller than the votes counted in Alpha.",
);
eq(
  "a register exactly the votes counted is accepted",
  refusal(
    toyAtlas({
      ...BASE,
      register: [
        ["Alpha", 700, []],
        ["Beta", null, [300, 500]],
        ["Gamma", 900, [450, 450]],
      ],
    }),
    "x",
    "Bloc P",
  ),
  "",
);
eq(
  "and in the seats shown together",
  refusal(
    toyAtlas({
      ...BASE,
      cons: [BASE.cons[0]!, BASE.cons[1]!],
      register: [
        ["Alpha", 1000, []],
        ["Beta", null, [300, 500]],
        ["Gamma", 300, []],
      ],
    }),
    "x",
    "Bloc P",
  ),
  "The 2022 register is smaller than the votes counted in Gamma.",
);
eq(
  "no register for a constituency is refused",
  refusal(
    toyAtlas({
      ...BASE,
      register: [
        ["Alpha", 1000, []],
        ["Beta", null, []],
        ["Gamma", 900, []],
      ],
    }),
    "x",
  ),
  "The 2022 register by constituency isn't on file for Xland.",
);
eq(
  "no constituency with both candidates is the county only",
  refusal(toyAtlas({ ...BASE, cons: [] }), "x"),
  "Xland's 2022 governor result is on file for the county as a whole, not by constituency.",
);
{
  // The winner by county votes is yours when no bloc is named, whoever the atlas lists first.
  const t: Toy = { ...BASE, county: [800, 950, 60] };
  const s = seatOf(toyAtlas(t), "x", null);
  eq(
    "the winner by the county's votes",
    [s.yours.name, s.rival.name, s.defaulted],
    ["Ben", "Ann", true],
  );
  eq("and a third candidate is neither", [s.others, s.topOther], [60, 60]);
}

// ---------------------------------------------------------- the name of seats together

eq("one name", togetherName(["Kasarani"]), "Kasarani");
eq("two names", togetherName(["Kibra", "Langata"]), "Kibra and Langata");
eq("three names", togetherName(["Kibra", "Langata", "Makadara"]), "Kibra, Langata and Makadara");
eq(
  "the same first word is said once",
  togetherName(["Embakasi Central", "Embakasi East", "Embakasi North", "Embakasi South"]),
  "Embakasi Central, East, North and South",
);
eq(
  "two with the same first word",
  togetherName(["Dagoretti North", "Dagoretti South"]),
  "Dagoretti North and South",
);
eq(
  "different first words are joined in full",
  togetherName(["Embakasi East", "Embakasi West", "Kasarani"]),
  "Embakasi East, Embakasi West and Kasarani",
);
eq(
  "a name of one word among the same first word is joined in full",
  togetherName(["Embakasi", "Embakasi East"]),
  "Embakasi and Embakasi East",
);
eq("none", togetherName([]), "");

// ---------------------------------------------------------- the seat a campaign plans on

{
  const withSide = (bloc: string) => atlasFromCsv({ sides: { "2022-governor": bloc } });
  const sakaja = seatForCampaign(
    { level: "governor", seat: "Governor · Nairobi" },
    withSide("Kenya Kwanza"),
    "nairobi",
  );
  eq(
    "a Nairobi governor's seat, from the campaign's side",
    sakaja?.ok && [sakaja.seat.yours.name, sakaja.seat.defaulted],
    ["Johnson Sakaja", false],
  );
  const igathe = seatForCampaign(
    { level: "governor", seat: "Governor · Nairobi" },
    withSide("Azimio"),
    "nairobi",
  );
  eq("the other side", igathe?.ok && igathe.seat.yours.name, "Polycarp Igathe");
  const none = seatForCampaign({ level: "governor", seat: "Governor · Nairobi" }, real, "nairobi");
  eq(
    "no side set: the winner, said to be a default",
    none?.ok && [none.seat.yours.name, none.seat.defaulted],
    ["Johnson Sakaja", true],
  );
  eq(
    "an MP, a president or no campaign has no seat to plan",
    [
      seatForCampaign({ level: "mp", seat: "MP · Mathira" }, real, "nyeri"),
      seatForCampaign({ level: "president", seat: "President" }, real, "kenya"),
      seatForCampaign(null, real, "nairobi"),
    ],
    [null, null, null],
  );
  eq(
    "a governor whose county the atlas can't place is told the county",
    seatForCampaign({ level: "governor", seat: "Governor · Kiambu" }, real, "kenya"),
    { ok: false, why: "The 2022 governor result isn't on file for Kiambu." },
  );
  eq(
    "and one whose seat names no place",
    seatForCampaign({ level: "governor", seat: "" }, real, "kenya"),
    { ok: false, why: "The 2022 governor result isn't on file for this county." },
  );
  eq(
    "a home that is a constituency is no county",
    seatForCampaign({ level: "governor", seat: "Governor · Nairobi" }, real, "nairobi/kasarani"),
    { ok: false, why: "The 2022 governor result isn't on file for Nairobi." },
  );
  eq(
    "Nyeri: on file for the county only",
    seatForCampaign({ level: "governor", seat: "Governor · Nyeri" }, real, "nyeri"),
    {
      ok: false,
      why: "Nyeri's 2022 governor result is on file for the county as a whole, not by constituency.",
    },
  );
}

// ---------------------------------------------------------- the place a campaign's seat names

eq("a seat's place", placeOfSeat("Governor · Nairobi"), "Nairobi");
eq("with spaces and a longer place", placeOfSeat("  Governor ·  Trans Nzoia "), "Trans Nzoia");
eq("with no dot, the whole text", placeOfSeat("Nairobi"), "Nairobi");
eq("with several dots, the last", placeOfSeat("Governor · Kenya · Kiambu"), "Kiambu");
eq("empty", placeOfSeat(""), "");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
