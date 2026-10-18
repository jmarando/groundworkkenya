// Checks for the Path to City Hall engine: 2022's constituency figures come
// back as the atlas has them, a move in one constituency changes only that
// constituency, the lead is exact, and the seats shown together are never
// counted as a seat. The expected figures were worked out apart from the
// module, from the definitions, on the same rows. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/seat-path.test.ts

import type { Scenario } from "@/lib/path";
import { flipSeat, seatFromAtlas, type Seat, type SeatBucket } from "@/lib/seat";
import { closestSeats, runSeat, seatTurnoutLever, worthSeat } from "@/lib/seat-path";

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

/** Within `eps` of `want`: votes are fractions once a move has scaled them. */
function near(name: string, got: number, want: number, eps: number) {
  if (Math.abs(got - want) <= eps) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${got}\n  want ${want} (±${eps})`);
  }
}

const r = seatFromAtlas(atlasFromCsv(), "nairobi", "Kenya Kwanza");
if (!r.ok) throw new Error(r.why);
const nairobi = r.seat;
const K = (name: string) => `nairobi/${name}`;
const MOVE = (share: number, turnout = 0) => ({ share, turnout });
const everywhere = (share: number, turnout = 0, seat: Seat = nairobi): Scenario =>
  Object.fromEntries(seat.buckets.map((b) => [b.key, MOVE(share, turnout)]));

/** A made-up seat: buckets as [key, yours, rival, registered]. */
function toy(
  buckets: [string, number, number, number][],
  extra: { others?: number; topOther?: number; together?: string } = {},
): Seat {
  const bs: SeatBucket[] = buckets.map(([key, yours, rival, registered]) => ({
    key,
    name: key.toUpperCase(),
    seats: key === extra.together ? 2 : 1,
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
    topOther: extra.topOther ?? others,
    total: { yours: y, rival: v, valid: y + v + others },
    buckets: bs,
    president: null,
    source: { constituencies: "c", county: "k", president: null },
  };
}

// ------------------------------------------------------------- 2022 as the atlas has it

{
  const p = runSeat(nairobi);
  const t = p.totals;
  eq(
    "Nairobi 2022: votes",
    [t.yours, t.rival, t.others, t.valid, t.margin],
    [699392, 573516, 51501, 1324409, 125876],
  );
  near("Nairobi 2022: 52.81% of the valid votes", t.share, 699392 / 1324409, 1e-12);
  eq("Nairobi 2022: leads, and the votes that would turn it", [t.leads, t.toTurn], [true, 62939]);
  eq(
    "Nairobi 2022: 11 of the 13 constituencies reported separately; the four seats together by 25,314",
    [t.carried, t.reported, t.together],
    [11, 13, { seats: 4, margin: 25314 }],
  );
  near(
    "Nairobi 2022: the two main candidates took 52.7% of the register",
    t.turnout,
    1272908 / 2415310,
    1e-12,
  );
  eq(
    "every constituency's margin, in the atlas's order",
    p.buckets.map((b) => [b.name, b.margin]),
    [
      ["Dagoretti North", 729],
      ["Dagoretti South", 24665],
      ["Embakasi West", 7194],
      ["Kamukunji", 8403],
      ["Kasarani", 32716],
      ["Kibra", -10041],
      ["Langata", 728],
      ["Makadara", 4076],
      ["Mathare", 1334],
      ["Roysambu", 38194],
      ["Ruaraka", -23007],
      ["Starehe", 14182],
      ["Westlands", 1389],
      ["Embakasi Central, East, North and South", 25314],
    ],
  );
  const kasarani = p.buckets.find((b) => b.key === K("kasarani"))!;
  near(
    "Kasarani: two-way share 68.5%, turnout 57.0% of its register",
    kasarani.share,
    60578 / 88440,
    1e-12,
  );
  near("Kasarani: turnout", kasarani.turnout, 88440 / 155250, 1e-12);
  eq(
    "with no move, now is 2022",
    p.buckets.every(
      (b) =>
        b.was.margin === b.margin &&
        b.was.yours === b.yours &&
        b.was.rival === b.rival &&
        b.was.share === b.share &&
        b.was.turnout === b.turnout,
    ),
    true,
  );
}
eq("a move of zero changes nothing", runSeat(nairobi, everywhere(0)), runSeat(nairobi));

// ------------------------------------------------------------- a move in one constituency

{
  const p = runSeat(nairobi, { [K("kasarani")]: MOVE(-10) });
  eq(
    "Kasarani −10: votes and margin",
    [p.totals.yours, p.totals.rival, p.totals.margin],
    [690548, 582360, 108188],
  );
  eq(
    "Kasarani −10: still leads, still 11 constituencies",
    [p.totals.leads, p.totals.carried],
    [true, 11],
  );
  const k = p.buckets.find((b) => b.key === K("kasarani"))!;
  near(
    "Kasarani −10: its share is 10 points lower than 2022's",
    k.share - k.was.share,
    -0.1,
    1e-12,
  );
  eq(
    "Kasarani −10: no other constituency moves",
    p.buckets.filter((b) => b.key !== K("kasarani")).map((b) => b.margin),
    runSeat(nairobi)
      .buckets.filter((b) => b.key !== K("kasarani"))
      .map((b) => b.margin),
  );
  eq(
    "Kasarani −10: its 2022 figures are kept in was",
    [k.was.yours, k.was.rival, k.was.margin],
    [60578, 27862, 32716],
  );
}
{
  const p = runSeat(nairobi, { [K("westlands")]: MOVE(-1) });
  near("Westlands −1: the margin", p.totals.margin, 124302.8, 0.05);
  eq("Westlands −1: it is lost, so 10 constituencies", p.totals.carried, 10);
  eq(
    "Westlands −1: the closest are Westlands (behind by 184), Langata, Dagoretti North and Mathare",
    closestSeats(nairobi, { [K("westlands")]: MOVE(-1) }).map((b) => [
      b.name,
      Math.round(b.margin),
    ]),
    [
      ["Westlands", -184],
      ["Langata", 728],
      ["Dagoretti North", 729],
      ["Mathare", 1334],
    ],
  );
}
{
  const p = runSeat(nairobi, { [K("roysambu")]: MOVE(-20), [K("kasarani")]: MOVE(-20) });
  near("Roysambu −20 and Kasarani −20: the margin", p.totals.margin, 55237.6, 0.05);
  eq("Roysambu −20 and Kasarani −20: 10 constituencies", p.totals.carried, 10);
}
{
  const p = runSeat(nairobi, { [K("kamukunji")]: MOVE(0, 5) });
  near("Kamukunji +5 points of turnout: yours", p.totals.yours, 703086.4, 0.05);
  near("Kamukunji +5 points of turnout: the rival", p.totals.rival, 576247.4, 0.05);
  const k = p.buckets.find((b) => b.key === K("kamukunji"))!;
  near("Kamukunji +5: its turnout is 5 points higher", k.turnout - k.was.turnout, 0.05, 1e-12);
  near("Kamukunji +5: its share is as it was", k.share, k.was.share, 1e-12);
}
{
  const p = runSeat(nairobi, { "nairobi#together": MOVE(10) });
  near("the four seats together +10: the margin", p.totals.margin, 187133.6, 0.05);
  eq("and they still count as no seat in carried", [p.totals.carried, p.totals.reported], [11, 13]);
}
{
  const p = runSeat(nairobi, everywhere(-8));
  near("every constituency −8: the margin", p.totals.margin, -77789.3, 0.05);
  eq(
    "every constituency −8: no longer leads, 4 constituencies",
    [p.totals.leads, p.totals.carried],
    [false, 4],
  );
  const q = runSeat(nairobi, everywhere(-30));
  eq("every constituency −30: carries none", q.totals.carried, 0);
}

// ------------------------------------------------------------- the other side

{
  const p = runSeat(flipSeat(nairobi));
  eq(
    "the rival's side: votes, margin, no longer leading",
    [p.totals.yours, p.totals.rival, p.totals.margin, p.totals.leads, p.totals.toTurn],
    [573516, 699392, -125876, false, 62939],
  );
  eq(
    "the rival's side: 2 of the 13 constituencies, the four seats together −25,314",
    [p.totals.carried, p.totals.reported, p.totals.together],
    [2, 13, { seats: 4, margin: -25314 }],
  );
}

// ------------------------------------------------------------- five points

near("Kasarani, five points: yours", worthSeat(nairobi, K("kasarani")).votes, 4422, 1e-9);
near("Kasarani, five points: the margin", worthSeat(nairobi, K("kasarani")).margin, 8844, 1e-9);
near("Roysambu, five points: yours", worthSeat(nairobi, K("roysambu")).votes, 4407.8, 1e-9);
near(
  "Roysambu, ten points: the margin",
  worthSeat(nairobi, K("roysambu"), 10).margin,
  17631.2,
  1e-9,
);
eq("a bucket that isn't there is worth nothing", worthSeat(nairobi, "nairobi/nowhere"), {
  votes: 0,
  margin: 0,
});

// ------------------------------------------------------------- the turnout lever

{
  const l = seatTurnoutLever(nairobi)!;
  eq("the lever is Kamukunji", [l.key, l.name], [K("kamukunji"), "Kamukunji"]);
  near("Kamukunji's turnout", l.turnout, 56075 / 128516, 1e-12);
  near("the county's", l.county, 1272908 / 2415310, 1e-12);
  near("brought up to it adds about 11,655 votes", l.extra, 11655, 0.5);
  near("about 1,747 of them net", l.net, 1746.5, 0.5);
  eq(
    "the other side has none: where it leads (Ruaraka, Kibra) its turnout is above the county's",
    seatTurnoutLever(flipSeat(nairobi)),
    null,
  );
  eq(
    "and a seat where no bucket is led below the county's turnout has none either",
    seatTurnoutLever(
      toy([
        ["a", 100, 50, 200],
        ["b", 100, 150, 400],
      ]),
    ),
    null,
  );
  // Where the rival leads and turnout is above the county's, fewer voters would help yours: that is no lever.
  const lone = seatTurnoutLever(
    toy([
      ["a", 100, 50, 400],
      ["b", 20, 280, 400],
    ]),
  );
  eq("a bucket the rival leads, above the county's turnout, is never the lever", lone?.key, "a");
  near(
    "and the lever's net is its own: lifting a to the county's turnout adds 25 votes of margin",
    lone?.net ?? 0,
    25,
    1e-9,
  );
  eq(
    "the biggest net wins, not the first",
    seatTurnoutLever(
      toy([
        ["a", 110, 100, 1000],
        ["b", 300, 100, 1000],
        ["c", 600, 200, 1000],
        ["d", 900, 300, 1000],
      ]),
    )?.key,
    "b",
  );
}

// ------------------------------------------------------------- the closest seats

eq(
  "on 2022's map, the four closest",
  closestSeats(nairobi).map((b) => [b.name, b.margin]),
  [
    ["Langata", 728],
    ["Dagoretti North", 729],
    ["Mathare", 1334],
    ["Westlands", 1389],
  ],
);
eq(
  "the number asked for",
  closestSeats(nairobi, {}, 2).map((b) => b.name),
  ["Langata", "Dagoretti North"],
);
eq(
  "close means within five points of the votes between the two, by default",
  closestSeats(nairobi, {}, 20).map((b) => b.name),
  ["Langata", "Dagoretti North", "Mathare", "Westlands"],
);
eq(
  "a tighter limit keeps fewer: within one point of a tie",
  closestSeats(nairobi, {}, 4, 0.01).map((b) => b.name),
  ["Langata", "Dagoretti North"],
);
eq("within nothing: none, since no constituency is level", closestSeats(nairobi, {}, 4, 0), []);
eq(
  "exactly at the limit counts, one vote past does not",
  [
    closestSeats(toy([["a", 525, 475, 4000]])).map((b) => b.key),
    closestSeats(toy([["a", 526, 474, 4000]])).map((b) => b.key),
  ],
  [["a"], []],
);
eq(
  "a constituency with no votes between the two is not close, it is empty",
  closestSeats(toy([["a", 0, 0, 1000]])).map((b) => b.key),
  [],
);
eq(
  "the limit is read on the votes as the scenario has them",
  closestSeats(toy([["a", 600, 400, 4000]]), { a: MOVE(-9) }).map((b) => b.key),
  ["a"],
);
eq(
  "a constituency level on votes is carried by nobody",
  [
    runSeat(
      toy([
        ["a", 100, 100, 1000],
        ["b", 101, 100, 1000],
        ["c", 99, 100, 1000],
      ]),
    ).totals.carried,
  ],
  [1],
);
eq(
  "seats together are never listed, however close",
  closestSeats(
    toy(
      [
        ["a", 100, 100, 1000],
        ["t", 50, 50, 500],
      ],
      { together: "t" },
    ),
  ).map((b) => b.key),
  ["a"],
);
eq(
  "a tie in the margin goes by name",
  closestSeats(
    toy([
      ["b", 1100, 1000, 5000],
      ["a", 2100, 2000, 8000],
      ["c", 1000, 1100, 5000],
    ]),
  ).map((b) => b.name),
  ["A", "B", "C"],
);

// ------------------------------------------------------------- votes past the register

{
  // Figures that hold more votes than the register (a typo somewhere) must not be rescaled by a move
  // that is not about turnout, nor by no move at all.
  const odd = toy([["a", 600, 500, 1000]]);
  eq(
    "no move: the votes are the votes, whatever the register says",
    [runSeat(odd).totals.yours, runSeat(odd).totals.rival],
    [600, 500],
  );
  const shifted = runSeat(odd, { a: MOVE(10) }).buckets[0]!;
  near(
    "a share move keeps the two together as they were",
    shifted.yours + shifted.rival,
    1100,
    1e-9,
  );
  near("and moves the share by ten points", shifted.share - shifted.was.share, 0.1, 1e-12);
}

// ------------------------------------------------------------- the ends, ties and the lead

{
  const s = toy([["a", 300, 200, 1000]]);
  const up = runSeat(s, { a: MOVE(100) }).buckets[0]!;
  eq("+100: every vote of the two is yours", [up.yours, up.rival, up.share], [500, 0, 1]);
  const down = runSeat(s, { a: MOVE(-100) }).buckets[0]!;
  eq("−100: none is", [down.yours, down.rival, down.share], [0, 500, 0]);
  const full = runSeat(s, { a: MOVE(0, 100) }).buckets[0]!;
  eq(
    "turnout +100: the two main candidates take the whole register",
    [full.yours + full.rival, full.turnout],
    [1000, 1],
  );
  const none = runSeat(s, { a: MOVE(0, -100) }).buckets[0]!;
  eq(
    "turnout −100: nobody votes",
    [none.yours, none.rival, none.share, none.turnout],
    [0, 0, 0, 0],
  );
  const finite = [everywhere(100, 100, s), everywhere(-100, -100, s), everywhere(50, 50, s)].every(
    (sc) =>
      runSeat(s, sc).buckets.every((b) =>
        [b.yours, b.rival, b.margin, b.share, b.turnout].every((x) => Number.isFinite(x)),
      ),
  );
  eq("nothing is NaN or infinite at the ends", finite, true);
}
{
  const tie = runSeat(toy([["a", 500, 500, 2000]])).totals;
  eq(
    "a tie: nobody leads, and one vote settles it",
    [tie.leads, tie.toTurn, tie.margin],
    [false, 1, 0],
  );
  const behind = runSeat(toy([["a", 499, 500, 2000]])).totals;
  eq("one vote behind: not leading, one vote turns it", [behind.leads, behind.toTurn], [false, 1]);
  const ahead = runSeat(toy([["a", 501, 500, 2000]])).totals;
  eq("one vote ahead: leading, one vote turns it", [ahead.leads, ahead.toTurn], [true, 1]);
  const odd = runSeat(toy([["a", 506, 500, 2000]])).totals;
  eq("six votes ahead: three votes changing sides make a tie, four turn it", odd.toTurn, 4);
  const third = runSeat(toy([["a", 500, 300, 2000]], { others: 650, topOther: 600 })).totals;
  eq(
    "more than the rival but not than a third candidate: ahead on the margin, not leading",
    [third.margin, third.leads],
    [200, false],
  );
  const clear = runSeat(toy([["a", 500, 300, 2000]], { others: 650, topOther: 499 })).totals;
  eq("and more than every other candidate: leading", clear.leads, true);
  const equalOther = runSeat(toy([["a", 500, 300, 2000]], { others: 500, topOther: 500 })).totals;
  eq("equal to the biggest other candidate is not more", equalOther.leads, false);
}
{
  const empty = runSeat(
    toy([
      ["a", 0, 0, 1000],
      ["b", 100, 50, 1000],
    ]),
    { a: MOVE(20, 20) },
  );
  const a = empty.buckets[0]!;
  eq(
    "a constituency with no votes between the two stays at none, with no NaN",
    [a.yours, a.rival, a.share, a.turnout],
    [0, 0, 0, 0],
  );
  const noRegister = runSeat(toy([["a", 100, 50, 0]]), { a: MOVE(10, 10) }).buckets[0]!;
  eq(
    "no register: no turnout to move, no NaN",
    [Number.isFinite(noRegister.yours), noRegister.turnout],
    [true, 0],
  );
}
{
  const noTogether = runSeat(toy([["a", 100, 50, 500]])).totals;
  eq("no seats together: null", noTogether.together, null);
  const withTogether = runSeat(
    toy(
      [
        ["a", 100, 50, 500],
        ["t", 10, 90, 500],
      ],
      { together: "t" },
    ),
  ).totals;
  eq(
    "seats together: their count and margin, and out of carried",
    [withTogether.together, withTogether.carried, withTogether.reported],
    [{ seats: 2, margin: -80 }, 1, 1],
  );
  const others = runSeat(toy([["a", 100, 50, 500]], { others: 25, topOther: 20 })).totals;
  eq(
    "others are held: valid is the two plus them",
    [others.others, others.valid, others.share],
    [25, 175, 100 / 175],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
