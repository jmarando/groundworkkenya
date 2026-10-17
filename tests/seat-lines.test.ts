// Checks for the Path to City Hall readings: the sentences that say where a
// governor's path stands, with every number in them one of the line's figures.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/seat-lines.test.ts

import { unaccounted } from "@/lib/findings/core";
import type { Scenario } from "@/lib/path";
import { flipSeat, seatFromAtlas, type Seat, type SeatBucket } from "@/lib/seat";
import { hallName, seatLines } from "@/lib/seat-lines";

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

const r = seatFromAtlas(atlasFromCsv(), "nairobi", "Kenya Kwanza");
if (!r.ok) throw new Error(r.why);
const nairobi = r.seat;
const MOVE = (share: number, turnout = 0) => ({ share, turnout });
const everywhere = (share: number, turnout = 0, seat: Seat = nairobi): Scenario =>
  Object.fromEntries(seat.buckets.map((b) => [b.key, MOVE(share, turnout)]));
const line = (seat: Seat, sc: Scenario, id: string) =>
  seatLines(seat, sc).find((l) => l.id === id)?.line;

/** A made-up seat: buckets as [key, yours, rival, registered]; `together` names one bucket of 3 seats. */
function toy(
  buckets: [string, number, number, number][],
  extra: {
    others?: number;
    together?: string;
    togetherSeats?: number;
    president?: Seat["president"];
  } = {},
): Seat {
  const bs: SeatBucket[] = buckets.map(([key, yours, rival, registered]) => ({
    key,
    name: key.toUpperCase(),
    seats: key === extra.together ? (extra.togetherSeats ?? 3) : 1,
    together: key === extra.together,
    yours,
    rival,
    registered,
  }));
  const y = bs.reduce((t, b) => t + b.yours, 0);
  const v = bs.reduce((t, b) => t + b.rival, 0);
  const others = extra.others ?? 0;
  return {
    county: "x",
    countyName: "Xland",
    election: "2022-governor",
    yours: { name: "Ann", bloc: "P" },
    rival: { name: "Ben", bloc: "Q" },
    defaulted: false,
    others,
    topOther: others,
    total: { yours: y, rival: v, valid: y + v + others },
    buckets: bs,
    president: extra.president ?? null,
    source: { constituencies: "Press", county: "County", president: null },
  };
}

// ------------------------------------------------------------- where the path stands

eq(
  "standing on 2022's map",
  line(nairobi, {}, "standing"),
  "On 2022's map your side has 52.8% of the valid votes and is ahead by 125,876 votes. It carried 11 of the 13 constituencies reported separately, and was ahead by 25,314 votes in the 4 seats reported together.",
);
eq(
  "a move of zero is still 2022's map",
  line(nairobi, everywhere(0), "standing")?.startsWith("On 2022's map"),
  true,
);
eq(
  "standing after a change",
  line(nairobi, { "nairobi/westlands": MOVE(-1) }, "standing"),
  "With your changes your side has 52.7% of the valid votes and is ahead by 124,303 votes. It carries 10 of the 13 constituencies reported separately, and is ahead by 25,314 votes in the 4 seats reported together.",
);
eq(
  "standing when behind",
  line(nairobi, everywhere(-8), "standing"),
  "With your changes your side has 45.1% of the valid votes and is behind by 77,789 votes. It carries 4 of the 13 constituencies reported separately, and is behind by 23,692 votes in the 4 seats reported together.",
);
eq(
  "the rival's side on 2022's map",
  line(flipSeat(nairobi), {}, "standing"),
  "On 2022's map your side has 43.3% of the valid votes and is behind by 125,876 votes. It carried 2 of the 13 constituencies reported separately, and was behind by 25,314 votes in the 4 seats reported together.",
);
{
  const level = toy([["a", 500, 500, 2000]]);
  eq(
    "level, with no seats together",
    line(level, {}, "standing"),
    "On 2022's map your side has 50.0% of the valid votes and is level. It carried 0 of the 1 constituency reported separately.",
  );
  const one = toy(
    [
      ["a", 501, 500, 2000],
      ["t", 101, 100, 500],
    ],
    { together: "t" },
  );
  eq(
    "one vote, and a level set of seats together",
    line(
      toy(
        [
          ["a", 501, 500, 2000],
          ["t", 100, 100, 500],
        ],
        { together: "t" },
      ),
      {},
      "standing",
    ),
    "On 2022's map your side has 50.04% of the valid votes and is ahead by 1 vote. It carried 1 of the 1 constituency reported separately, and was level in the 3 seats reported together.",
  );
  eq(
    "one vote ahead in the seats together",
    line(one, {}, "standing")?.includes("ahead by 1 vote in the 3 seats"),
    true,
  );
  eq(
    "level has no margin to be a figure of",
    seatLines(level)[0]!.figures.map((f) => f.label),
    [
      "Election year",
      "Share of the valid votes",
      "Constituencies carried",
      "Constituencies reported separately",
    ],
  );
  eq(
    "and seats level together have none either",
    seatLines(
      toy(
        [
          ["a", 501, 500, 2000],
          ["t", 100, 100, 500],
        ],
        { together: "t" },
      ),
    )[0]!.figures.map((f) => f.label),
    [
      "Election year",
      "Share of the valid votes",
      "Votes of margin",
      "Constituencies carried",
      "Constituencies reported separately",
      "Seats reported together",
    ],
  );
  eq(
    "one seat together is a seat",
    line(
      toy(
        [
          ["a", 501, 500, 2000],
          ["t", 100, 100, 500],
        ],
        { together: "t", togetherSeats: 1 },
      ),
      {},
      "standing",
    )?.endsWith("was level in the 1 seat reported together."),
    true,
  );
  eq(
    "a level seat among those reported separately is no margin figure in 'closest'",
    seatLines(toy([["a", 10, 10, 100]])).find((l) => l.id === "closest")?.figures.length,
    0,
  );
}

// ------------------------------------------------------------- the votes that would turn it

eq(
  "turn",
  line(nairobi, {}, "turn"),
  "62,939 votes would have to change sides to turn the county.",
);
eq(
  "turn, behind: the same votes the other way",
  line(flipSeat(nairobi), {}, "turn"),
  "62,939 votes would have to change sides to turn the county.",
);
eq(
  "turn, level: one vote",
  line(toy([["a", 500, 500, 2000]]), {}, "turn"),
  "1 vote would have to change sides to turn the county.",
);

// ------------------------------------------------------------- the closest constituencies

eq(
  "closest on 2022's map",
  line(nairobi, {}, "closest"),
  "The closest constituencies: Langata (ahead by 728), Dagoretti North (ahead by 729), Mathare (ahead by 1,334) and Westlands (ahead by 1,389).",
);
eq(
  "closest after a change: Westlands behind by 184",
  line(nairobi, { "nairobi/westlands": MOVE(-1) }, "closest"),
  "The closest constituencies: Westlands (behind by 184), Langata (ahead by 728), Dagoretti North (ahead by 729) and Mathare (ahead by 1,334).",
);
eq(
  "closest for the rival's side",
  line(flipSeat(nairobi), {}, "closest"),
  "The closest constituencies: Langata (behind by 728), Dagoretti North (behind by 729), Mathare (behind by 1,334) and Westlands (behind by 1,389).",
);
eq(
  "closest with fewer than four",
  line(
    toy([
      ["a", 10, 5, 100],
      ["b", 20, 30, 100],
    ]),
    {},
    "closest",
  ),
  "The closest constituencies: A (ahead by 5) and B (behind by 10).",
);
eq(
  "closest with one, level",
  line(toy([["a", 10, 10, 100]]), {}, "closest"),
  "The closest constituency: A (level).",
);
eq(
  "closest with only seats together: none",
  line(toy([["t", 10, 5, 100]], { together: "t" }), {}, "closest"),
  undefined,
);

// ------------------------------------------------------------- the biggest constituency

eq(
  "lever",
  line(nairobi, {}, "lever"),
  "Kasarani is the biggest constituency reported separately, with 88,440 votes between the two main candidates. Five points of share there is worth about 8,800 votes on the margin.",
);
eq(
  "lever is worked out on 2022's map, whatever has been changed",
  line(nairobi, { "nairobi/kasarani": MOVE(-15) }, "lever"),
  line(nairobi, {}, "lever"),
);
eq(
  "lever: equal constituencies go by name",
  line(
    toy([
      ["b", 5000, 5000, 20000],
      ["a", 5000, 5000, 20000],
    ]),
    {},
    "lever",
  )?.startsWith("A is the biggest"),
  true,
);
eq(
  "lever: nothing worth a hundred votes is no lever",
  line(toy([["a", 20, 10, 100]]), {}, "lever"),
  undefined,
);
eq(
  "lever: seats together are never the biggest constituency",
  line(
    toy(
      [
        ["t", 90000, 80000, 500000],
        ["a", 5000, 4000, 20000],
      ],
      { together: "t" },
    ),
    {},
    "lever",
  )?.startsWith("A is the biggest"),
  true,
);

// ------------------------------------------------------------- the turnout lever

eq(
  "turnout",
  line(nairobi, {}, "turnout"),
  "The two main candidates together took 44% of the register in Kamukunji against 53% across Nairobi in 2022. Lifting it to the county's level would add about 11,700 votes, about 1,700 net for your side.",
);
eq("turnout: none for the rival's side", line(flipSeat(nairobi), {}, "turnout"), undefined);
eq(
  "turnout: a lever worth under fifty votes is none",
  line(
    toy([
      ["a", 101, 100, 2000],
      ["b", 400, 100, 1000],
    ]),
    {},
    "turnout",
  ),
  undefined,
);

// ------------------------------------------------------------- the ticket

{
  const ticket = nairobi.president;
  eq("the ticket is on file", ticket !== null, true);
  eq(
    "ticket",
    line(nairobi, {}, "ticket"),
    "Johnson Sakaja polled 137,617 more votes than William Ruto did in Nairobi in 2022; Polycarp Igathe polled 193,879 fewer than Raila Odinga.",
  );
  eq(
    "ticket for the rival's side",
    line(flipSeat(nairobi), {}, "ticket"),
    "Polycarp Igathe polled 193,879 fewer votes than Raila Odinga did in Nairobi in 2022; Johnson Sakaja polled 137,617 more than William Ruto.",
  );
  eq(
    "ticket is 2022's, whatever has been changed",
    line(nairobi, everywhere(-8), "ticket"),
    line(nairobi, {}, "ticket"),
  );
  const flat = toy([["a", 100, 100, 1000]], {
    president: { yours: { name: "Pat", votes: 100 }, rival: { name: "Quin", votes: 100 } },
  });
  eq(
    "ticket: the same votes",
    line(flat, {}, "ticket"),
    "Ann polled as many votes as Pat did in Xland in 2022; Ben polled as many as Quin.",
  );
  const mixed = toy([["a", 100, 100, 1000]], {
    president: { yours: { name: "Pat", votes: 90 }, rival: { name: "Quin", votes: 130 } },
  });
  eq(
    "ticket: more for one, fewer for the other",
    line(mixed, {}, "ticket"),
    "Ann polled 10 more votes than Pat did in Xland in 2022; Ben polled 30 fewer than Quin.",
  );
  eq(
    "ticket: with no presidential source only the governor's is named",
    seatLines(mixed)
      .find((l) => l.id === "ticket")
      ?.figures.map((f) => f.source),
    ["County", "County", "County"],
  );
  eq(
    "ticket: none without a presidential result",
    line(toy([["a", 100, 100, 1000]]), {}, "ticket"),
    undefined,
  );
}

// ------------------------------------------------------------- which lines, in which order

eq(
  "the lines, in order",
  [
    seatLines(nairobi).map((l) => l.id),
    seatLines(flipSeat(nairobi)).map((l) => l.id),
    seatLines(toy([["a", 10, 5, 100]])).map((l) => l.id),
  ],
  [
    ["standing", "turn", "closest", "lever", "turnout", "ticket"],
    ["standing", "turn", "closest", "lever", "ticket"],
    ["standing", "turn", "closest"],
  ],
);

// ------------------------------------------------------------- the hall

eq(
  "the hall",
  [hallName("Nairobi"), hallName("Nyeri"), hallName("Kiambu")],
  ["City Hall", "County Hall", "County Hall"],
);

// ------------------------------------------------------------- every number is a figure

{
  const all = [
    ...seatLines(nairobi),
    ...seatLines(flipSeat(nairobi)),
    ...seatLines(nairobi, { "nairobi/westlands": MOVE(-1) }),
    ...seatLines(nairobi, everywhere(-8)),
    ...seatLines(nairobi, { "nairobi/kamukunji": MOVE(0, 5), "nairobi#together": MOVE(3) }),
    ...seatLines(toy([["a", 500, 500, 2000]])),
    ...seatLines(
      toy(
        [
          ["a", 501, 500, 2000],
          ["t", 100, 100, 500],
        ],
        { together: "t" },
      ),
    ),
    ...seatLines(
      toy([
        ["a", 10, 5, 100],
        ["b", 20, 30, 100],
      ]),
    ),
    ...seatLines(
      toy([["a", 100, 100, 1000]], {
        president: { yours: { name: "Pat", votes: 90 }, rival: { name: "Quin", votes: 130 } },
      }),
    ),
  ];
  eq("there are lines to check", all.length > 25, true);
  eq(
    "every number in every line is a figure",
    all.map((l) => unaccounted(l)).filter((u) => u.length),
    [],
  );
  eq(
    "every figure appears in its line",
    all.flatMap((l) =>
      l.figures.filter((f) => !l.line.includes(f.text)).map((f) => `${l.id}: ${f.text}`),
    ),
    [],
  );
  eq(
    "every figure says what it is, where it came from and when",
    all.flatMap((l) =>
      l.figures
        .filter((f) => !f.label || !f.source || !f.period || !Number.isFinite(f.value))
        .map((f) => `${l.id}: ${f.text}`),
    ),
    [],
  );
  eq(
    "2022's figures cite the atlas's sources; the user's changes say so",
    [
      seatLines(nairobi)[0]!.figures.find((f) => f.text === "125,876")?.source,
      seatLines(nairobi, { "nairobi/westlands": MOVE(-1) })[0]!.figures.find(
        (f) => f.text === "124,303",
      )?.source,
      seatLines(nairobi)[5]!.figures.find((f) => f.text === "137,617")?.source,
    ],
    [
      "The Star: Sakaja declared winner in Nairobi governor race; Provisional results: 2022 Governor result, Nairobi City County",
      "Your changes on the 2022 map",
      "Provisional results: 2022 Governor result, Nairobi City County; IEBC: Declaration of results for the election of President, national tallying centre, by county (Form 34C summary), 2022",
    ],
  );
  eq(
    "the year is a figure only where a line says it",
    [
      seatLines(nairobi)[0]!.figures.some((f) => f.text === "2022"),
      seatLines(nairobi, { "nairobi/westlands": MOVE(-1) })[0]!.figures.some(
        (f) => f.text === "2022",
      ),
      seatLines(nairobi)[4]!.figures.some((f) => f.text === "2022"),
      seatLines(nairobi)[5]!.figures.some((f) => f.text === "2022"),
    ],
    [true, false, true, true],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
