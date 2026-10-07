// Checks for what the election atlas says to do in an area and why, and for the votes within
// reach: every rule, where each one starts, which wins when two apply, what happens when a figure
// is missing, and the reason line that goes with each answer. Pure; nothing leaves this process.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-advice.test.ts

import { nearestRank, votesWithinReach, whatToDo, type AdviceInput } from "@/lib/atlas/advice";

let pass = 0;
let fail = 0;

// JSON.stringify writes NaN and Infinity as null. Spell them out, so that a figure that came out
// as NaN or Infinity never passes for a missing one.
const spell = (_key: string, v: unknown) =>
  typeof v === "number" && !Number.isFinite(v) ? String(v) : v;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got, spell);
  const w = JSON.stringify(want, spell);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

// A side is set, turnout is level with the area above, and we lead by 20 on 55%.
const A = (over: Partial<AdviceInput> = {}) =>
  whatToDo({
    side: "Alpha",
    ourShare: 55,
    margin: 20,
    swing: null,
    turnout: 44,
    parentTurnout: 44,
    parentName: "Nairobi",
    ...over,
  });
const act = (over: Partial<AdviceInput>) => A(over).action;
const why = (over: Partial<AdviceInput>) => A(over).reason;

// 1. Mobilise: half the vote or more, and turnout more than 3 points below the area above.
eq("mobilise", A({ ourShare: 54.2, margin: 8.4, turnout: 38, parentTurnout: 44 }), {
  action: "mobilise",
  label: "Mobilise",
  reason: "54.2% to us, but turnout was 38%, 6.0 points below Nairobi's 44%",
});
eq("3 points below is not low enough", act({ turnout: 41, parentTurnout: 44 }), "lean-ours");
eq(
  "a gap of exactly 3 is not over 3, in floating point too",
  act({ turnout: 30.2, parentTurnout: 33.2 }),
  "lean-ours",
);
eq("mobilise starts at half the vote", act({ ourShare: 50, margin: 0, turnout: 34 }), "mobilise");
eq("just over 3 points below is", act({ turnout: 40.9, parentTurnout: 44 }), "mobilise");
eq(
  "the reason for a gap just over 3",
  why({ turnout: 40.9, parentTurnout: 44 }),
  "55.0% to us, but turnout was 41%, 3.1 points below Nairobi's 44%",
);
eq("mobilise needs half the vote", act({ ourShare: 49.9, margin: 3, turnout: 34 }), "persuade");
eq("no turnout, no mobilise", act({ ourShare: 65, margin: 40, turnout: null }), "hold");
eq("no turnout above, no mobilise", act({ ourShare: 65, margin: 40, parentTurnout: null }), "hold");
eq("mobilise comes before hold", A({ ourShare: 65, margin: 40, turnout: 36 }), {
  action: "mobilise",
  label: "Mobilise",
  reason: "65.0% to us, but turnout was 36%, 8.0 points below Nairobi's 44%",
});

// 2. Hold: 60% or more.
eq("hold", A({ ourShare: 60, margin: 25 }), {
  action: "hold",
  label: "Hold",
  reason: "60.0% to us",
});
eq("59.9% is not a stronghold", act({ ourShare: 59.9, margin: 25 }), "lean-ours");

// 3. Cut the gap: trailing the strongest other bloc by more than 10 points.
eq("cut the gap", A({ ourShare: 35, margin: -15 }), {
  action: "cut-the-gap",
  label: "Cut the gap",
  reason: "35.0% to us, 15.0 points behind",
});
eq("10 points behind is still a contest", A({ ourShare: 45, margin: -10 }), {
  action: "persuade",
  label: "Persuade",
  reason: "45.0% to us, 10.0 points behind",
});
eq("just over 10 behind is not", A({ ourShare: 44.9, margin: -10.1 }), {
  action: "cut-the-gap",
  label: "Cut the gap",
  reason: "44.9% to us, 10.1 points behind",
});
eq(
  "cut the gap comes before a swing",
  act({ ourShare: 35, margin: -15, swing: 12 }),
  "cut-the-gap",
);

// 4. Persuade: within 10 points either way, or the last swing was 10 points or more.
eq("persuade, ahead", A({ ourShare: 53, margin: 6 }), {
  action: "persuade",
  label: "Persuade",
  reason: "53.0% to us, 6.0 points ahead",
});
eq("persuade, level", why({ ourShare: 50, margin: 0 }), "50.0% to us, level");
eq(
  "10 points ahead is still a contest",
  why({ ourShare: 55, margin: 10 }),
  "55.0% to us, 10.0 points ahead",
);
eq("floating point noise at 10", act({ ourShare: 55, margin: 10.000000000000002 }), "persuade");
eq("a swing away makes it a contest", A({ ourShare: 58, margin: 16, swing: -12 }), {
  action: "persuade",
  label: "Persuade",
  reason: "58.0% to us, swung 12.0 points away from us since last time",
});
eq(
  "a swing of exactly 10 counts",
  why({ ourShare: 58, margin: 16, swing: 10 }),
  "58.0% to us, swung 10.0 points to us since last time",
);
eq("a swing of 9.9 does not", act({ ourShare: 58, margin: 16, swing: 9.9 }), "lean-ours");
eq(
  "margin and swing together",
  why({ ourShare: 48, margin: -4, swing: 11 }),
  "48.0% to us, 4.0 points behind, swung 11.0 points to us since last time",
);

// 5. Lean ours: ahead by more than 10 points, short of a stronghold.
eq("lean ours", A({ ourShare: 58, margin: 16 }), {
  action: "lean-ours",
  label: "Lean ours",
  reason: "58.0% to us, 16.0 points ahead",
});
eq(
  "a crowded race: 45% to 30% leans ours",
  why({ ourShare: 45, margin: 15 }),
  "45.0% to us, 15.0 points ahead",
);
eq(
  "a narrow lead on a small share: 38% to 30% is a contest",
  why({ ourShare: 38, margin: 8 }),
  "38.0% to us, 8.0 points ahead",
);

// Missing figures.
eq("no side", A({ side: null }), { action: "set-side", label: "Set your side first", reason: "" });
eq("no result", A({ ourShare: null, margin: null }), {
  action: "no-result",
  label: "No result",
  reason: "not found yet",
});
eq("no side beats no result", act({ side: null, ourShare: null, margin: null }), "set-side");

// The 75th percentile by nearest rank.
eq("nearest rank of four", nearestRank([10, 20, 30, 40], 75), 30);
eq("nearest rank sorts first", nearestRank([50, 10, 40, 20, 30], 75), 40);
eq("nearest rank of one", nearestRank([5], 75), 5);
eq("nearest rank of none", nearestRank([], 75), null);
eq(
  "nearest rank at the ends",
  [nearestRank([10, 20, 30], 100), nearestRank([10, 20, 30], 0)],
  [30, 10],
);

// Votes within reach: turnout up to the top quarter of its siblings, and a 5-point swing to us.
const R = (over: Partial<Parameters<typeof votesWithinReach>[0]> = {}) =>
  votesWithinReach({
    turnout: 40,
    siblingTurnouts: [40, 50, 60, 70],
    registered: 10000,
    ourShare: 55,
    valid: 4000,
    ...over,
  });
eq("votes within reach", R(), { turnout: 1100, persuasion: 200, total: 1300 });
eq("already in the top quarter", R({ turnout: 70 }), { turnout: 0, persuasion: 200, total: 200 });
eq("too few siblings to say", R({ siblingTurnouts: [40, 50, 60] }), {
  turnout: null,
  persuasion: 200,
  total: 200,
});
eq("no register", R({ registered: null }), { turnout: null, persuasion: 200, total: 200 });
eq("no share", R({ ourShare: null }), { turnout: null, persuasion: 200, total: 200 });
eq("no own turnout", R({ turnout: null }), { turnout: null, persuasion: 200, total: 200 });
eq("no valid votes", R({ valid: null }), { turnout: 1100, persuasion: null, total: 1100 });
eq("nothing to go on", R({ turnout: null, valid: null }), {
  turnout: null,
  persuasion: null,
  total: null,
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
