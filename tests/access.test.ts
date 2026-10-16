// Checks for which pages each role opens: Voters holds People and Canvassing, and a field agent
// works from the Field app (their walk lists are there). Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/access.test.ts

import { canOpen, homeFor, pageVerdict } from "@/lib/access";

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

eq(
  "an agent opens the Field app, not Voters",
  [canOpen("agent", "/voters"), canOpen("agent", "/field")],
  [false, true],
);
eq("an agent still opens Foundations", canOpen("agent", "/foundations"), true);
eq("an agent's home is the field app", homeFor("agent"), "/field");
eq("everyone else's home is Home", [homeFor("manager"), homeFor("organiser")], ["/home", "/home"]);
eq("an agent's pages no longer name Canvassing", canOpen("agent", "/canvassing"), false);
eq("an agent doesn't open Broadcast", canOpen("agent", "/broadcast"), false);
eq("an organiser opens Voters", canOpen("organiser", "/voters"), true);
eq("someone waiting opens nothing", canOpen("pending", "/voters"), false);
eq(
  "finance stays with the principals",
  [canOpen("manager", "/finance"), canOpen("organiser", "/finance")],
  [true, false],
);

eq(
  "the team opens Elections; agents don't",
  [
    canOpen("organiser", "/elections"),
    canOpen("manager", "/elections"),
    canOpen("agent", "/elections"),
  ],
  [true, true, false],
);

eq(
  "the team opens Strategy; agents and people waiting don't",
  [
    canOpen("organiser", "/strategy"),
    canOpen("candidate", "/strategy"),
    canOpen("agent", "/strategy"),
    canOpen("pending", "/strategy"),
  ],
  [true, true, false, false],
);

// What the signed-in area does with a page: open it, send the person to their own start page, or say it isn't theirs.
eq(
  "an agent who follows an old link to Voters, Home or any page that isn't theirs is sent to the field app",
  [
    pageVerdict("agent", "/voters"),
    pageVerdict("agent", "/voters/anything"),
    pageVerdict("agent", "/home"),
    pageVerdict("agent", "/elections"),
  ],
  ["send-home", "send-home", "send-home", "send-home"],
);
eq(
  "an agent's own pages open",
  [pageVerdict("agent", "/field"), pageVerdict("agent", "/foundations")],
  ["open", "open"],
);
eq(
  "the team's pages open for the team",
  [
    pageVerdict("manager", "/home"),
    pageVerdict("organiser", "/voters"),
    pageVerdict("super", "/campaigns"),
  ],
  ["open", "open", "open"],
);
eq(
  "a page that isn't theirs is said so, not hidden by a redirect, for everyone but agents",
  [
    pageVerdict("organiser", "/finance"),
    pageVerdict("manager", "/campaigns"),
    pageVerdict("pending", "/voters"),
    pageVerdict(null, "/home"),
  ],
  ["denied", "denied", "denied", "denied"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
