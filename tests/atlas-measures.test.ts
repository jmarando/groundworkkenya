// Checks for the election atlas's result measures: turnout, valid votes, each bloc's
// share, our share, the margin, lean and swing. Pure; nothing leaves this process.
// A missing figure is null and never zero. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-measures.test.ts

import {
  blocShares,
  lean,
  margin,
  ourShare,
  swing,
  turnoutPct,
  validVotes,
} from "@/lib/atlas/measures";
import type { Turnout, Vote } from "@/lib/atlas/types";

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

const T = (over: Partial<Turnout> = {}): Turnout => ({
  registered: 1000,
  cast: 412,
  rejected: null,
  valid: null,
  ...over,
});

// Turnout is cast over registered, in percent; missing when either is.
eq("turnout", turnoutPct(T()), 41.2);
eq("turnout with no cast", turnoutPct(T({ cast: null })), null);
eq("turnout with no register", turnoutPct(T({ registered: null })), null);
eq("turnout over an empty register", turnoutPct(T({ registered: 0 })), null);
eq("turnout with no row at all", [turnoutPct(null), turnoutPct(undefined)], [null, null]);
eq("a real zero turnout is not missing", turnoutPct(T({ cast: 0 })), 0);

// Valid votes: what the document gives, else the candidates' votes added up.
const VOTES: Vote[] = [
  { bloc: "Alpha", votes: 600 },
  { bloc: "Beta", votes: 300 },
  { bloc: "Alpha", votes: 100 },
];
eq("valid votes as published", validVotes(T({ valid: 950 }), VOTES), 950);
eq("valid votes added up", validVotes(T(), VOTES), 1000);
eq("valid votes with no turnout row", validVotes(null, VOTES), 1000);
eq("valid votes with nothing to go on", validVotes(T(), []), null);

// Shares: a bloc's votes over the valid votes, biggest first, ties by name.
eq("bloc shares", blocShares(VOTES, 1000), [
  { bloc: "Alpha", votes: 700, share: 70 },
  { bloc: "Beta", votes: 300, share: 30 },
]);
eq(
  "a tie is listed by name",
  blocShares(
    [
      { bloc: "Zed", votes: 5 },
      { bloc: "Abe", votes: 5 },
    ],
    10,
  ),
  [
    { bloc: "Abe", votes: 5, share: 50 },
    { bloc: "Zed", votes: 5, share: 50 },
  ],
);
eq("shares with no total", blocShares(VOTES, null), []);
eq("shares over a zero total", blocShares(VOTES, 0), []);

// Our share uses the campaign's side.
const SHARES = blocShares(VOTES, 1000);
eq("our share", ourShare(SHARES, "Alpha"), 70);
eq("a bloc that did not stand has no votes", ourShare(SHARES, "Gamma"), 0);
eq("no side set", ourShare(SHARES, null), null);
eq("no shares to read", ourShare([], "Alpha"), null);

// Margin: our share minus the strongest other bloc's.
eq("margin when ahead", margin(SHARES, "Alpha"), 40);
eq("margin when behind", margin(SHARES, "Beta"), -40);
const THREE = blocShares(
  [
    { bloc: "Alpha", votes: 450 },
    { bloc: "Beta", votes: 300 },
    { bloc: "Gamma", votes: 250 },
  ],
  1000,
);
eq("margin against the strongest other bloc", margin(THREE, "Alpha"), 15);
eq("margin of the middle bloc", margin(THREE, "Beta"), -15);
eq("margin when unopposed", margin(blocShares([{ bloc: "Alpha", votes: 80 }], 80), "Alpha"), 100);
eq("margin when we did not stand", margin(SHARES, "Gamma"), -70);
eq("margin with no side", margin(SHARES, null), null);
eq("margin with no shares", margin([], "Alpha"), null);

// Lean is the margin read as a side.
eq("lean ours", lean(40), { side: "ours", points: 40 });
eq("lean theirs", lean(-15.5), { side: "theirs", points: 15.5 });
eq("level", lean(0), { side: "even", points: 0 });
eq("floating point noise is level", lean(1e-12), { side: "even", points: 0 });
eq("no margin, no lean", lean(null), null);

// Swing is our share now minus our share at the election before, in points.
eq("swing towards us", swing(52.3, 48.1), 4.2);
eq("swing away from us", swing(40, 51.5), -11.5);
eq("swing with no earlier share", swing(52.3, null), null);
eq("swing with no later share", swing(null, 48.1), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
