// Checks for the console's menu: every page it used to open is still reachable, each from one
// place, and a page finds its section's tabs.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/sections.test.ts

import { isCurrent, menuPages, MENU, sectionOf } from "@/lib/sections";

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

const BEFORE = [
  "/home",
  "/plan",
  "/roadmap",
  "/diary",
  "/voters",
  "/elections",
  "/strategy",
  "/polling",
  "/field-plan",
  "/agents",
  "/inbox",
  "/broadcast",
  "/website",
  "/listening",
  "/finance",
  "/warroom",
  "/field",
  "/team",
  "/campaigns",
];
const pages = menuPages();
eq(
  "every page still in the menu",
  BEFORE.filter((p) => !pages.includes(p)),
  [],
);
eq("each page in one place", pages.length, BEFORE.length);
eq("fewer menu items", MENU.flatMap((g) => g.items).length, 13);
eq("the roadmap is under Strategy", sectionOf("/roadmap")?.label, "Strategy");
eq("the atlas is under Strategy", sectionOf("/elections/kiambu")?.label, "Strategy");
eq("polls sit with Listening", sectionOf("/polling")?.label, "Listening & polls");
eq("agents sit with Field", sectionOf("/agents")?.label, "Field");
eq("a single page has no tabs", sectionOf("/inbox"), null);
const strategy = MENU[0]!.items.find((i) => i.label === "Strategy")!;
eq(
  "the Strategy item is current on its tabs",
  ["/plan", "/strategy", "/home"].map((p) => isCurrent(strategy, p)),
  [true, true, false],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
