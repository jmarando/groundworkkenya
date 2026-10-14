// Checks for the screens with no signal: the pages that open (the same list as
// public/sw.js keeps), the sign-in gate, and the offline bar's time. Pure. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-screens.test.ts

import { readFileSync } from "node:fs";

import { gateState, lastLoadedText, needsSignal, OFFLINE_PAGES } from "@/lib/offline/screens";

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

// ---------------------------------------------------------------- pages

eq(
  "the same offline pages as the background file",
  OFFLINE_PAGES,
  JSON.parse(
    /const OFFLINE_PAGES = (\[[^\]]*\])/
      .exec(readFileSync("public/sw.js", "utf8"))![1]!
      .replace(/'/g, '"'),
  ),
);
eq(
  "with no signal, pages off the list need signal, saved data or not",
  ["/inbox", "/finance", "/homework", "/fieldwork", "/home/x"].map((p) =>
    needsSignal(p, () => true),
  ),
  [true, true, true, true, false],
);
eq(
  "pages on the list open when what they show was saved",
  [
    needsSignal("/home", (key) => key === "home"),
    needsSignal("/diary", (key) => key === "diary"),
    needsSignal("/voters", (key) => key === "voters"),
    needsSignal("/field", (key) => key === "voters"),
    needsSignal("/elections", (key) => key === "atlas"),
    needsSignal("/strategy", (key) => key === "atlas"),
  ],
  [false, false, false, false, false, false],
);
eq(
  "and need signal when nothing was saved for them",
  OFFLINE_PAGES.map((p) => needsSignal(p, () => false)),
  OFFLINE_PAGES.map(() => true),
);

// ---------------------------------------------------------------- the gate

const gate = (o: Partial<Parameters<typeof gateState>[0]>) =>
  gateState({ ready: true, loading: false, failed: false, hasAccess: false, online: true, ...o });
eq(
  "saved access lets the person in, signal or not, even when the check fails",
  [gate({ hasAccess: true, online: false }), gate({ hasAccess: true, failed: true })],
  ["in", "in"],
);
eq(
  "no saved access and no signal: open it once with signal",
  [gate({ online: false, loading: true }), gate({ online: false, failed: true })],
  ["first-visit", "first-visit"],
);
eq(
  "until saved data is back, checking",
  gate({ ready: false, online: false, loading: true }),
  "checking",
);
eq(
  "with signal, as before",
  [gate({ loading: true }), gate({ failed: true }), gate({})],
  ["checking", "failed", "in"],
);

// ---------------------------------------------------------------- the bar's time

{
  const now = Date.parse("2026-10-14T12:00:00Z"); // 15:00 in Nairobi
  eq(
    "today, a time; before, a day and time; nothing loaded, nothing",
    [
      lastLoadedText(Date.parse("2026-10-14T05:40:00Z"), now),
      lastLoadedText(Date.parse("2026-10-12T05:40:00Z"), now),
      lastLoadedText(Date.parse("2026-10-13T21:30:00Z"), now),
      lastLoadedText(0, now),
    ],
    ["at 08:40", "on 12 Oct at 08:40", "at 00:30", null],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
