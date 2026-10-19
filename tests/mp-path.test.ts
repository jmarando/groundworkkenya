// Checks for Path to Parliament: an MP's race read from the atlas's rows (the
// real Githunguri rows), the scenario sums and the readings. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/mp-path.test.ts

import { unaccounted } from "@/lib/findings/core";
import { flipMpSeat, mpSeatFromAtlas, runMp, type MpSeat } from "@/lib/mp-path";
import { mpLines } from "@/lib/mp-path-lines";

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

const real = atlasFromCsv();
const r = mpSeatFromAtlas(real, "mp", "kiambu/githunguri", "UDA");
if (!r.ok) throw new Error(r.why);
const seat: MpSeat = r.seat;

// The seat as the atlas holds it.
eq("yours", [seat.yours.name, seat.yours.votes], ["Gathoni Wamuchomba", 34646]);
eq("rival", [seat.rival.name, seat.rival.votes], ["Gabriel Kago", 31127]);
eq("not defaulted", seat.defaulted, false);
eq("register", seat.registered, 104592);
eq(
  "wards, biggest first",
  seat.parts.map((p) => p.name),
  ["Githunguri", "Githiga", "Komothai", "Ngewa", "Ikinu"],
);
eq(
  "wards add up to the seat",
  seat.parts.reduce((t, p) => t + p.registered, 0),
  104592,
);
eq(
  "2017 before",
  [seat.before?.year, seat.before?.winner.votes, seat.before?.valid],
  [2017, 76906, 86306],
);
eq(
  "the other bloc starts from Kago",
  mpSeatFromAtlas(real, "mp", "kiambu/githunguri", "Jubilee").ok &&
    (mpSeatFromAtlas(real, "mp", "kiambu/githunguri", "Jubilee") as { seat: MpSeat }).seat.yours
      .name,
  "Gabriel Kago",
);
eq(
  "no bloc: the winner, defaulted",
  (() => {
    const x = mpSeatFromAtlas(real, "mp", "kiambu/githunguri", null);
    return x.ok ? [x.seat.yours.name, x.seat.defaulted] : null;
  })(),
  ["Gathoni Wamuchomba", true],
);
eq(
  "a seat with no result says so",
  (() => {
    const x = mpSeatFromAtlas(real, "mp", "kiambu", null);
    return x.ok ? "" : x.why;
  })(),
  "The 2022 MP result isn't on file for Kiambu.",
);

// The sums.
const base = runMp(seat);
eq("base margin", Math.round(base.margin), 3519);
eq("base votes to turn", base.toTurn, 1760);
eq("base leads", base.leads, true);
const down = runMp(seat, { share: -3, turnout: {} });
eq("three points down loses", down.leads, false);
eq(
  "share moves the margin by 2 × the two × points",
  Math.round(down.margin),
  3519 - Math.round(65773 * 0.06),
);
const out = runMp(seat, { share: 0, turnout: { "kiambu/githunguri/githunguri": 5 } });
eq(
  "five points in Githunguri ward adds 5% of its register",
  Math.round(out.added["kiambu/githunguri/githunguri"] ?? 0),
  1380,
);
eq(
  "turnout can't take a ward below nothing",
  runMp(seat, { share: 0, turnout: { "kiambu/githunguri/ikinu": -100 } }).added[
    "kiambu/githunguri/ikinu"
  ]! >=
    -(65773 * 17450) / 104592 - 1e-6,
  true,
);
eq("flipped: Kago behind", runMp(flipMpSeat(seat)).leads, false);

// The readings: every number accounted for.
const lines = [
  ...mpLines(seat),
  ...mpLines(seat, { share: -3, turnout: { "kiambu/githunguri/ngewa": 4 } }),
  ...mpLines(flipMpSeat(seat)),
];
eq(
  "every number in a reading is a figure",
  lines.map((l) => unaccounted(l)).filter((u) => u.length),
  [],
);
eq(
  "base readings",
  mpLines(seat).map((l) => l.id),
  ["stands", "turn", "lever", "turnout", "before"],
);
eq(
  "stands line",
  mpLines(seat)[0]!.line,
  "In 2022 Gathoni Wamuchomba had 34,646 votes to Gabriel Kago's 31,127: ahead by 3,519, 52.7% of the two together.",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
