// Checks for a list as the agent's phone runs it (src/lib/walk-list-run.ts): what each door's state
// is when visits wait on the phone, the progress and the words on the screen. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/walk-list-run.test.ts

import type { Ring } from "@/lib/geo";
import {
  agoText,
  doorOutcomes,
  doorTitle,
  footprintM2,
  givenText,
  lastVisitText,
  queueNote,
  runProgress,
  saveLabel,
} from "@/lib/walk-list-run";
import type { ListDoor } from "@/lib/walk-lists.functions";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}

const NOW = Date.parse("2026-10-20T08:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const SENT = iso(2);

const door = (n: number, extra: Partial<ListDoor> = {}): ListDoor => ({
  n,
  pc: `D${n}`,
  at: [36.78, -1.28],
  rings: [],
  wardId: null,
  outcome: null,
  visitedAt: null,
  ...extra,
});

// Each door's state: the server's visits since the list went out, then waiting ones, then those just saved.
const doors = [
  door(1, { outcome: "spoke", visitedAt: iso(1) }),
  door(2, { outcome: "not_home", visitedAt: iso(5) }), // from before the list went out
  door(3),
  door(4, { outcome: "refused", visitedAt: iso(1) }),
];
eq(
  "visits since the list went out count, an older one doesn't",
  [...doorOutcomes(doors, SENT, [], "L1")],
  [
    ["D1", "spoke"],
    ["D4", "refused"],
  ],
);
eq(
  "a visit at the very moment the list went out counts",
  doorOutcomes([door(1, { outcome: "spoke", visitedAt: SENT })], SENT, [], "L1").get("D1"),
  "spoke",
);
eq(
  "a visit waiting to send is the door's state, over the server's",
  [
    ...doorOutcomes(doors, SENT, [{ walkListId: "L1", doorPc: "D1", outcome: "not_home" }], "L1"),
  ].find(([pc]) => pc === "D1"),
  ["D1", "not_home"],
);
eq(
  "and one at a door the server has none for is done",
  [...doorOutcomes(doors, SENT, [{ walkListId: "L1", doorPc: "D3", outcome: "spoke" }], "L1")].map(
    ([pc]) => pc,
  ),
  ["D1", "D4", "D3"],
);
eq(
  "visits waiting for another list, or for no list, are not this one's",
  doorOutcomes(
    doors,
    SENT,
    [{ walkListId: "L2", doorPc: "D3", outcome: "spoke" }, { outcome: "spoke" }],
    "L1",
  ).has("D3"),
  false,
);
eq(
  "the newest of two waiting visits at a door is its state",
  doorOutcomes(
    doors,
    SENT,
    [
      { walkListId: "L1", doorPc: "D3", outcome: "not_home" },
      { walkListId: "L1", doorPc: "D3", outcome: "spoke" },
    ],
    "L1",
  ).get("D3"),
  "spoke",
);
eq(
  "a visit just saved shows at once, before the list is read again",
  doorOutcomes(doors, SENT, [], "L1", new Map([["D3", "refused" as const]])).get("D3"),
  "refused",
);
eq(
  "a visit saved just now is newer than one waiting at the same door",
  doorOutcomes(
    doors,
    SENT,
    [{ walkListId: "L1", doorPc: "D3", outcome: "not_home" }],
    "L1",
    new Map([["D3", "spoke" as const]]),
  ).get("D3"),
  "spoke",
);
eq(
  "a list that never went out has no server visits to count",
  doorOutcomes(doors, null, [], "L1").size,
  0,
);

eq(
  "progress counts the doors done, up to the doors there are",
  [
    runProgress(
      new Map([
        ["a", "spoke" as const],
        ["b", "spoke" as const],
      ]),
      44,
    ),
    runProgress(
      new Map([
        ["a", "spoke" as const],
        ["b", "spoke" as const],
      ]),
      1,
    ),
  ],
  [
    { done: 2, total: 44 },
    { done: 1, total: 1 },
  ],
);

// The words.
eq("which door", [doorTitle(16, 44), doorTitle(1, 1)], ["Door 16 of 44", "Door 1 of 1"]);
eq(
  "the save button says where it goes next",
  [saveLabel(17), saveLabel(null)],
  ["Save · go to door 17", "Save"],
);
eq(
  "the queue, said as the phone has it",
  [
    queueNote(0, true),
    queueNote(3, true),
    queueNote(0, false),
    queueNote(3, false),
    queueNote(1, false),
  ],
  [
    null,
    "3 visits waiting to send",
    "No signal · visits you save stay on the phone and send when it comes back",
    "No signal · 3 visits saved on the phone, they send when it comes back",
    "No signal · 1 visit saved on the phone, they send when it comes back",
  ],
);
eq(
  "how long ago",
  [
    agoText(iso(0), NOW),
    agoText(iso(1), NOW),
    agoText(iso(12), NOW),
    /^10 Sep/.test(agoText(iso(40), NOW)),
    agoText(null, NOW),
    agoText("soon", NOW),
  ],
  ["today", "yesterday", "12 days ago", true, "", ""],
);
eq(
  "a month old is a date, 29 days is not",
  [agoText(iso(29), NOW), /^20 Sep/.test(agoText(iso(29 + 1), NOW))],
  ["29 days ago", true],
);
eq(
  "when a list was given",
  [givenText(iso(0), NOW), givenText(iso(1), NOW), givenText(iso(6), NOW), givenText(null, NOW)],
  ["given today", "given yesterday", "given 6 days ago", ""],
);
eq(
  "the last visit at a door",
  [
    lastVisitText("not_home", iso(1), NOW),
    lastVisitText("spoke", iso(12), NOW),
    lastVisitText(null, null, NOW),
    lastVisitText("refused", null, NOW),
  ],
  ["Not home yesterday", "Spoke 12 days ago", "Not visited yet", "Refused"],
);

// A big outline is a block of flats: its area, less any courtyard.
const square = (side: number, at = 0): Ring => {
  const m = 1 / 111_320; // a metre in degrees of latitude
  return [
    [36.78, -1.28 + at * m],
    [36.78 + (side * m) / Math.cos((1.28 * Math.PI) / 180), -1.28 + at * m],
    [36.78 + (side * m) / Math.cos((1.28 * Math.PI) / 180), -1.28 + (at + side) * m],
    [36.78, -1.28 + (at + side) * m],
    [36.78, -1.28 + at * m],
  ];
};
eq(
  "a house's footprint, in whole square metres",
  Math.round((footprintM2([square(10)]) ?? 0) / 10),
  10,
);
eq("less its courtyard", Math.round((footprintM2([square(20), square(10, 5)]) ?? 0) / 10), 30);
eq("no outline, no footprint", footprintM2([]), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
