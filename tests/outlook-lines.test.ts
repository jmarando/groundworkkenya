// Checks for the Outlook 2027 readings: the words for 2022 again and for a few
// plans, every number in a reading a figure the line prints, the thresholds the
// new registrations would have to meet, and nothing that sounds like a forecast
// or names a community. The figures were worked out apart from the module, from
// the definitions, on the same rows (scratchpad outlook/ref.py). Pure. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/outlook-lines.test.ts

import { unaccounted } from "@/lib/findings/core";
import {
  addCandidate,
  baselinePlan,
  likeBefore,
  splitPool,
  withBack,
  withGoes,
  type Outlook,
  type Plan,
} from "@/lib/outlook";
import { NAIROBI_NOTES, outlookLines, SENATE_NOTE } from "@/lib/outlook-lines";
import { outlookFor, youthFacts } from "@/lib/outlook-youth";
import { flipSeat, seatFromAtlas, type Seat, type SeatBucket } from "@/lib/seat";
import { seatLines } from "@/lib/seat-lines";

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
const REGISTRATION = {
  count: 276886,
  period: "2026-03-30 to 2026-04-28",
  source: "Capital FM, 1 May 2026 (IEBC mass drive)",
};
const small = toy(
  [
    ["a", 600, 400, 1500],
    ["b", 300, 500, 1200],
    ["c", 200, 100, 400],
  ],
  { others: 100, topOther: 60, together: "c" },
);
const smallOutlook = (count: number | null): Outlook =>
  outlookFor(small, null, count === null ? null : { count, period: "p", source: "s" });

const d = atlasFromCsv();
const r0 = seatFromAtlas(d, "nairobi", null);
if (!r0.ok) throw new Error(r0.why);
const nairobi = r0.seat;
const youth = youthFacts(d, nairobi);
const O = outlookFor(nairobi, youth, REGISTRATION);
const P = baselinePlan(nairobi);
const lines = (o: Outlook, p: Plan) => outlookLines(o, p);
const byId = (o: Outlook, p: Plan) => Object.fromEntries(lines(o, p).map((l) => [l.id, l.line]));

const FORBIDDEN = /will win|predict|forecast|likel|probab|chance/i;
const COMMUNITY =
  /\b(luo|kikuyu|gikuyu|kalenjin|luhya|kamba|mijikenda|maasai|tribe|tribes|tribal|ethnic|ethnicity)\b/i;

// ------------------------------------------------------------- 2022 again

{
  const l = lines(O, P);
  eq(
    "the readings, in order",
    l.map((x) => x.id),
    ["standing", "turn", "closest", "fresh", "ceiling", "ticket", "young"],
  );
  const t = byId(O, P);
  eq(
    "where it stands",
    t["standing"],
    "On 2022's votes, Your candidate has 699,392 votes, 52.8% of the valid votes, and is ahead of Main rival by 125,876 votes.",
  );
  eq(
    "the votes to turn it",
    t["turn"],
    "62,939 votes changing sides from Your candidate to Main rival would put Main rival ahead.",
  );
  eq(
    "the closest constituencies",
    t["closest"],
    "The closest constituencies: Langata (ahead by 728), Dagoretti North (ahead by 729), Mathare (ahead by 1,334) and Westlands (ahead by 1,389).",
  );
  eq(
    "what the new registrations would have to do",
    t["fresh"],
    "The 276,886 new registrations are 21% of 2022's valid votes. For Main rival to pass Your candidate on them alone, Main rival would need about 73% of their votes if all of them voted, or about 91% if 55% of them voted, as the register did in 2022.",
  );
  eq(
    "the most the other side could have had",
    t["ceiling"],
    "On 2022's votes, one candidate who took every vote cast against Johnson Sakaja would have had 625,017 votes, 74,375 behind the 699,392 that Johnson Sakaja polled. The rest would have to come from voters who switch, from new registrations or from people who stayed home.",
  );
  eq(
    "the ticket is City Hall's",
    t["ticket"],
    seatLines(nairobi).find((x) => x.id === "ticket")!.line,
  );
  eq(
    "young adults",
    t["young"],
    "Estimates for 2020 put 2,059,932 of Nairobi's 3,231,692 adults in the young-adult band (64%), and 869,702 adults off the 2022 register. The estimates are of where people live and the register is of where they registered, so read them as a guide.",
  );
  eq(
    "2022 again has no 'your plan'",
    l.some((x) => x.line.includes("your plan")),
    false,
  );
}

// ------------------------------------------------------------- plans

{
  const p = splitPool(P, "rival");
  const t = byId(O, p);
  eq(
    "the rival's side shared by two",
    t["standing"],
    "With your plan, Your candidate has 699,392 votes, 52.8% of the valid votes, and is ahead of Main rival by 412,634 votes.",
  );
  eq(
    "the votes to turn it",
    t["turn"],
    "206,318 votes changing sides from Your candidate to Main rival would put Main rival ahead.",
  );
  eq(
    "a split field helps the leader",
    t["united"],
    "Your candidate leads with 699,392 votes. Main rival and Second rival have 573,516 between them, 125,876 fewer: even with one candidate between them they would not catch Your candidate.",
  );
  eq(
    "the readings that depend on the plan",
    lines(O, p).map((x) => x.id),
    ["standing", "turn", "united", "closest", "fresh", "ceiling", "ticket", "young"],
  );
}
{
  const p = splitPool(P, "yours");
  const t = byId(O, p);
  eq(
    "your side shared by two",
    t["standing"],
    "With your plan, Your candidate has 349,696 votes, 26.4% of the valid votes, and is behind Main rival by 223,820 votes.",
  );
  eq(
    "the votes to turn it, the other way",
    t["turn"],
    "111,911 votes changing sides from Main rival to Your candidate would put Your candidate ahead.",
  );
  eq(
    "together they would be ahead",
    t["united"],
    "Main rival leads with 573,516 votes, but Your candidate and Second rival have 699,392 between them, 125,876 more. With one candidate between them they would be ahead; split, Main rival stays ahead.",
  );
  eq(
    "the thresholds are for you now",
    t["fresh"],
    "The 276,886 new registrations are 21% of 2022's valid votes. For Your candidate to pass Main rival on them alone, Your candidate would need about 90% of their votes if all of them voted, and could not pass Main rival on them alone if only 55% voted, as the register did in 2022.",
  );
}
{
  const p = likeBefore(P, nairobi);
  const t = byId(O, p);
  eq(
    "new registrations vote as the register did",
    t["standing"],
    "With your plan, Your candidate has 779,569 votes, 52.8% of the valid votes, and is ahead of Main rival by 140,306 votes.",
  );
  eq(
    "and the plan says what it assumes",
    t["fresh-plan"],
    "In your plan 55% of the new registrations vote: 151,827 votes, 80,177 for Your candidate and 65,747 for Main rival.",
  );
  eq(
    "the closest constituencies move with it",
    t["closest"],
    "The closest constituencies: Langata (ahead by 728), Dagoretti North (ahead by 1,553), Mathare (ahead by 1,926) and Westlands (ahead by 2,444).",
  );
  eq("the thresholds do not", t["fresh"], byId(O, P)["fresh"]);
  eq(
    "the 2022 facts do not",
    [t["ceiling"], t["young"]],
    [byId(O, P)["ceiling"], byId(O, P)["young"]],
  );
}

// ------------------------------------------------------------- the other side's view

{
  const flipped = outlookFor(flipSeat(nairobi), youthFacts(d, flipSeat(nairobi)), REGISTRATION);
  const t = byId(flipped, baselinePlan(flipSeat(nairobi)));
  eq(
    "behind",
    t["standing"],
    "On 2022's votes, Your candidate has 573,516 votes, 43.3% of the valid votes, and is behind Main rival by 125,876 votes.",
  );
  eq(
    "the votes to turn it, from the other side",
    t["turn"],
    "62,939 votes changing sides from Main rival to Your candidate would put Your candidate ahead.",
  );
  eq(
    "the thresholds are for the one behind",
    t["fresh"],
    "The 276,886 new registrations are 21% of 2022's valid votes. For Your candidate to pass Main rival on them alone, Your candidate would need about 73% of their votes if all of them voted, or about 91% if 55% of them voted, as the register did in 2022.",
  );
  eq("2022's winner is the same", t["ceiling"], byId(O, P)["ceiling"]);
}

// ------------------------------------------------------------- what the new registrations can do

{
  const l = (count: number) => byId(smallOutlook(count), baselinePlan(small))["fresh"];
  eq(
    "too few to matter on their own",
    l(50),
    "The 50 new registrations are 2% of 2022's valid votes. Even if all of them voted for Main rival, that would not be enough to pass Your candidate.",
  );
  eq(
    "enough only if nearly all vote",
    l(120),
    "The 120 new registrations are 5% of 2022's valid votes. For Main rival to pass Your candidate on them alone, Main rival would need about 92% of their votes if all of them voted, and could not pass Your candidate on them alone if only 71% voted, as the register did in 2022.",
  );
  eq(
    "enough at 2022's rate too",
    l(150),
    "The 150 new registrations are 7% of 2022's valid votes. For Main rival to pass Your candidate on them alone, Main rival would need about 83% of their votes if all of them voted, or about 97% if 71% of them voted, as the register did in 2022.",
  );
  eq("a figure that is none", l(0), undefined);
}
eq(
  "no figure for the county, no readings of it",
  lines(smallOutlook(null), baselinePlan(small)).some((x) => x.id.startsWith("fresh")),
  false,
);

// ------------------------------------------------------------- level and thin

{
  const tied = toy(
    [
      ["a", 500, 500, 1200],
      ["b", 500, 500, 1200],
    ],
    { others: 0 },
  );
  const t = byId(outlookFor(tied, null, null), baselinePlan(tied));
  eq(
    "level",
    t["standing"],
    "On 2022's votes, Your candidate has 1,000 votes, 50.0% of the valid votes, and is level with Main rival.",
  );
  eq("one vote settles it", t["turn"], "One vote changing sides would settle it.");
  eq("2022 level, no ceiling", t["ceiling"], undefined);
  eq("no split field, nothing united", t["united"], undefined);
  const s = byId(outlookFor(tied, null, null), splitPool(baselinePlan(tied), "rival"));
  eq(
    "the others together exactly as many as the leader",
    s["united"],
    "Your candidate leads with 1,000 votes. Main rival and Second rival have 1,000 between them, the same: with one candidate between them they would tie.",
  );
  const level = byId(outlookFor(tied, null, null), withBack(baselinePlan(tied), "rival", 99.96));
  eq("level to the whole vote at the top", level["united"], undefined);
}
{
  const t = byId(smallOutlook(null), baselinePlan(small));
  eq("no close constituency, no line", t["closest"], undefined);
  eq("no president on file, no ticket", t["ticket"], undefined);
  eq("no estimates, no young adults", t["young"], undefined);
  eq("what is left", Object.keys(t), ["standing", "turn", "ceiling"]);
  eq(
    "the vote against the winner exactly the winner's",
    t["ceiling"],
    "On 2022's votes, one candidate who took every vote cast against Ann would have had 1,100 votes, level with the 1,100 that Ann polled.",
  );
  const ahead = toy(
    [
      ["a", 400, 300, 1000],
      ["b", 300, 200, 800],
    ],
    { others: 400 },
  );
  eq(
    "the vote against the winner more than the winner's",
    byId(outlookFor(ahead, null, null), baselinePlan(ahead))["ceiling"],
    "On 2022's votes, one candidate who took every vote cast against Ann would have had 900 votes, 200 more than the 700 that Ann polled: Ann won because those votes were split across the field.",
  );
}

// ------------------------------------------------------------- the edges the mutation check found

{
  // Where the figures come from: the atlas for 2022 again, your plan otherwise.
  const o = smallOutlook(null);
  const base = lines(o, baselinePlan(small))[0]!;
  eq(
    "2022 again: the atlas",
    base.figures.map((f) => f.source),
    ["c; k", "c; k", "c; k", "c; k"],
  );
  const plan = lines(o, withBack(baselinePlan(small), "rival", 50))[0]!;
  eq(
    "a plan: yours",
    plan.figures.map((f) => f.source),
    ["Your plan for 2027", "Your plan for 2027", "Your plan for 2027"],
  );
}
{
  // A single vote is a vote.
  const one = toy([["a", 501, 500, 1000]]);
  const t = byId(outlookFor(one, null, null), baselinePlan(one));
  eq(
    "a margin of one vote",
    t["standing"],
    "On 2022's votes, Your candidate has 501 votes, 50.05% of the valid votes, and is ahead of Main rival by 1 vote.",
  );
  eq(
    "and one vote turns it",
    t["turn"],
    "1 vote changing sides from Your candidate to Main rival would put Main rival ahead.",
  );
}
{
  // Level at the top, or a candidate with no votes, is not a split field.
  const tied = toy(
    [
      ["a", 500, 500, 1200],
      ["b", 500, 500, 1200],
    ],
    { others: 0 },
  );
  const o3: Outlook = { seat: tied, youth: null, registration: null, fresh: { a: 150, b: 150 } };
  const three = withGoes(addCandidate(baselinePlan(tied)), "new", 2, 100);
  const level = byId(o3, withBack(three, "new", 100));
  eq("two level at the top", level["united"], undefined);
  eq(
    "a candidate with no votes is not a split",
    byId(smallOutlook(null), addCandidate(baselinePlan(small)))["united"],
    undefined,
  );
}
{
  // The closest constituencies: at most four, the smallest margins first, never the places shown together, never an empty place.
  const six = toy(
    [1, 2, 3, 4, 5, 6].map(
      (i, k) =>
        [String.fromCharCode(97 + k), 1000, 1000 - 10 * i, 5000] as [
          string,
          number,
          number,
          number,
        ],
    ),
  );
  eq(
    "four of six",
    byId(outlookFor(six, null, null), baselinePlan(six))["closest"],
    "The closest constituencies: A (ahead by 10), B (ahead by 20), C (ahead by 30) and D (ahead by 40).",
  );
  const together = toy(
    [
      ["a", 1000, 800, 3000],
      ["c", 100, 100, 400],
    ],
    { together: "c" },
  );
  eq(
    "not the seats shown together",
    byId(outlookFor(together, null, null), baselinePlan(together))["closest"],
    undefined,
  );
  const empty = toy([
    ["a", 1000, 800, 3000],
    ["e", 0, 0, 50],
  ]);
  eq(
    "not a place nobody voted in",
    byId(outlookFor(empty, null, null), baselinePlan(empty))["closest"],
    undefined,
  );
  const edge = toy([["a", 525, 475, 2000]]);
  eq(
    "exactly a twentieth of the votes, and one place",
    byId(outlookFor(edge, null, null), baselinePlan(edge))["closest"],
    "The closest constituency: A (ahead by 50).",
  );
  const names = toy([
    ["b", 510, 490, 2000],
    ["a", 510, 490, 2000],
  ]);
  eq(
    "the same margin: by name",
    byId(outlookFor(names, null, null), baselinePlan(names))["closest"],
    "The closest constituencies: A (ahead by 20) and B (ahead by 20).",
  );
}
{
  // What the new registrations would have to do, at the edges.
  const tied = toy(
    [
      ["a", 500, 500, 1200],
      ["b", 500, 500, 1200],
    ],
    { others: 0 },
  );
  const at = (seat: Seat, count: number, plan: Plan = baselinePlan(seat)) =>
    byId(outlookFor(seat, null, { count, period: "p", source: "s" }), plan)["fresh"];
  const LEVEL =
    "The 100 new registrations are 5% of 2022's valid votes. For Your candidate to pass Main rival on them alone, Your candidate would need about 50% of their votes if all of them voted, or about 50% if 83% of them voted, as the register did in 2022.";
  eq("level: you are the one to pass", at(tied, 100), LEVEL);
  eq(
    "within half a vote is level",
    at(tied, 100, withBack(baselinePlan(tied), "rival", 99.96)),
    LEVEL,
  );
  eq(
    "exactly as many votes as the gap only ties",
    at(small, 100),
    "The 100 new registrations are 5% of 2022's valid votes. Even if all of them voted for Main rival, that would not be enough to pass Your candidate.",
  );
  eq(
    "a few more than the gap",
    at(small, 110),
    "The 110 new registrations are 5% of 2022's valid votes. For Main rival to pass Your candidate on them alone, Main rival would need about 95% of their votes if all of them voted, and could not pass Your candidate on them alone if only 71% voted, as the register did in 2022.",
  );
  const tiny = toy([["a", 11, 9, 100]]);
  eq(
    "a small seat: the share is of 2022's valid votes",
    at(tiny, 3),
    "The 3 new registrations are 15% of 2022's valid votes. For Main rival to pass Your candidate on them alone, Main rival would need about 83% of their votes if all of them voted, and could not pass Your candidate on them alone if only 20% voted, as the register did in 2022.",
  );
  const noRegister = toy([["a", 5, 3, 0]]);
  eq(
    "no register to take the rate from",
    at(noRegister, 4),
    "The 4 new registrations are 50% of 2022's valid votes. For Main rival to pass Your candidate on them alone, Main rival would need about 75% of their votes if all of them voted.",
  );
  const empty = toy([["a", 0, 0, 100]]);
  eq(
    "nobody voted in 2022: no share to speak of",
    Object.keys(
      byId(outlookFor(empty, null, { count: 10, period: "p", source: "s" }), baselinePlan(empty)),
    ),
    ["standing", "turn"],
  );
}
{
  // What the plan assumes of the new registrations.
  const o: Outlook = {
    seat: small,
    youth: null,
    registration: { count: 300, period: "p", source: "s" },
    fresh: { a: 100, b: 100, c: 100 },
  };
  const wild = {
    ...baselinePlan(small),
    takes: {
      ...baselinePlan(small).takes,
      new: { back: 150, goes: baselinePlan(small).takes.new.goes },
    },
  };
  eq(
    "a share of the new registrations past 100 is 100",
    byId(o, wild)["fresh-plan"],
    "In your plan 100% of the new registrations vote: 300 votes, 150 for Your candidate and 136 for Main rival.",
  );
  const three = withBack(
    withGoes(
      withGoes(withGoes(addCandidate(baselinePlan(small)), "new", 2, 50), "new", 1, 20),
      "new",
      0,
      30,
    ),
    "new",
    100,
  );
  const strong = {
    ...three,
    takes: { ...three.takes, rival: { back: 100, goes: [0, 20, 80, 0] } },
  };
  eq(
    "the rival is the strongest of the others",
    byId(o, strong)["fresh-plan"],
    "In your plan 100% of the new registrations vote: 300 votes, 90 for Your candidate and 150 for Second rival.",
  );
}
{
  const nobody = youth && { ...youth, total: { ...youth.total, adults: 0 } };
  eq(
    "no adults, no line about them",
    byId(outlookFor(nairobi, nobody, REGISTRATION), P)["young"],
    undefined,
  );
}
{
  // The line about the new registrations in a plan that uses them.
  const o = outlookFor(nairobi, youth, REGISTRATION);
  const plan = withBack(withGoes(P, "new", 0, 100), "new", 100);
  eq(
    "all of them for you",
    byId(o, plan)["fresh-plan"],
    "In your plan 100% of the new registrations vote: 276,886 votes, 276,886 for Your candidate and 0 for Main rival.",
  );
}

// ------------------------------------------------------------- every number is a figure

{
  const plans: [string, Outlook, Plan][] = [
    ["2022 again", O, P],
    ["split rival", O, splitPool(P, "rival")],
    ["split yours", O, splitPool(P, "yours")],
    ["like 2022", O, likeBefore(P, nairobi)],
    ["new voters all in", O, withGoes(withBack(P, "new", 100), "new", 0, 100)],
    ["a tenth switch", O, withGoes(P, "yours", 1, 10)],
    [
      "three and a half",
      O,
      addCandidate(withGoes(splitPool(P, "rival"), "yours", 2, 5), "Karauri"),
    ],
    ["small, 120 new", smallOutlook(120), baselinePlan(small)],
    ["small, 50 new", smallOutlook(50), withBack(baselinePlan(small), "new", 100)],
    ["small, split", smallOutlook(150), splitPool(baselinePlan(small), "yours")],
  ];
  for (const [name, o, p] of plans)
    for (const x of lines(o, p)) {
      eq(`${name} / ${x.id}: every number is a figure`, unaccounted(x), []);
      eq(
        `${name} / ${x.id}: every figure is in the line`,
        x.figures.every((f) => x.line.includes(f.text)),
        true,
      );
      eq(
        `${name} / ${x.id}: every figure has a source and a period`,
        x.figures.every((f) => f.source && f.period),
        true,
      );
      eq(
        `${name} / ${x.id}: no forecast, no community`,
        [FORBIDDEN.test(x.line), COMMUNITY.test(x.line)],
        [false, false],
      );
    }
}

// ------------------------------------------------------------- the words with no numbers in them

for (const [name, text] of [
  ["the Senate note", SENATE_NOTE],
  ...NAIROBI_NOTES.map((n, i) => [`Nairobi note ${i + 1}`, n] as const),
]) {
  eq(`${name}: there is something`, text.length > 40, true);
  eq(`${name}: no digits`, /[0-9]/.test(text), false);
  eq(
    `${name}: no forecast, no community`,
    [FORBIDDEN.test(text), COMMUNITY.test(text)],
    [false, false],
  );
}
eq(
  "the Senate note says what a Senate bid cannot do",
  SENATE_NOTE.includes("cannot take a vote from a governor candidate"),
  true,
);
eq("the Nairobi notes", NAIROBI_NOTES.length, 4);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
