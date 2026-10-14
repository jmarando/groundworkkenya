// Checks for the candidate's-time rules: a place that matters with no stop in
// the diary, and stops spent in seats already ours. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-time.test.ts

import { unaccounted } from "@/lib/findings/core";
import { notVisited, timeInSafeSeats } from "@/lib/findings/time";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

const stop = (day: string, wardId: string | null, kind: "visit" | "watch" = "visit") => ({
  id: `s-${day}-${wardId}`,
  day,
  startsAt: null,
  title: "A stop",
  kind,
  wardId,
  wardName: null,
  note: null,
});
const NO_SIDE = { ...ATLAS, sides: {} };

// ---------------------------------------------------------------- 1. not visited

{
  const [k, ...rest] = notVisited(FULL);
  eq(
    "a governor: the top quarter of the seats to win, with no stop",
    [k?.id, rest.length],
    ["not-visited:nairobi/kasarani", 0],
  );
  eq(
    "its line",
    k?.line,
    "Kasarani: no diary stop in the last 60 days and none planned, with about 26,603 votes within reach.",
  );
  eq("plan a visit to its biggest ward", k?.next, {
    label: "Plan a visit",
    to: "/diary",
    search: { add: "w-mwiki" },
  });
  eq(
    "weighed by votes within reach",
    [k?.weight, k?.decision, k?.place],
    [26_603, "time", "nairobi/kasarani"],
  );
  eq("every number is a figure", k ? unaccounted(k) : null, []);
}
eq(
  "a stop in the seat in the window: visited",
  notVisited(input({ diary: [stop("2026-10-20", "w-mwiki")] })),
  [],
);
eq(
  "'To watch', no ward, 61 days ago or 15 ahead don't count",
  notVisited(
    input({
      diary: [
        stop("2026-10-14", "w-mwiki", "watch"),
        stop("2026-10-14", null),
        stop("2026-08-13", "w-mwiki"),
        stop("2026-10-28", "w-mwiki"),
      ],
    }),
  ).map((x) => x.id),
  ["not-visited:nairobi/kasarani"],
);
eq("no side, no seats to weigh", notVisited(input({ atlas: NO_SIDE })), []);
eq(
  "a presidential race with no county results: quiet",
  notVisited(input({ home: "kenya", race: "president" })),
  [],
);
{
  const mp = input({
    home: "nairobi/dagoretti-north",
    wards: FULL.wards.filter((w) => w.constituency === "Dagoretti North"),
    diary: [],
  });
  const out = notVisited(mp);
  eq(
    "an MP: the bigger half of the wards, by registered voters",
    out.map((x) => [x.id, x.line]),
    [
      [
        `not-visited:${KEYS.kawangware}`,
        "Kawangware: no diary stop in the last 60 days and none planned, with 52,000 registered voters.",
      ],
    ],
  );
  eq(
    "an MP's ward visited",
    notVisited({ ...mp, diary: [stop("2026-10-01", "w-kawangware")] }),
    [],
  );
  eq("every number is a figure", out.map(unaccounted), [[]]);
}

// ---------------------------------------------------------------- 2. time in safe seats

{
  const out = timeInSafeSeats(FULL);
  eq(
    "most stops in seats already ours",
    out.map((x) => [x.id, x.place, x.line]),
    [
      [
        "time-in-safe-seats:campaign",
        null,
        "4 of your 6 stops (last 30 days and next 14) are in Hold or Lean ours seats, which hold 11% of the votes within reach.",
      ],
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[]]);
  eq("next: the diary", out[0]?.next, { label: "Open the diary", to: "/diary" });
}
eq(
  "fewer than six stops: quiet",
  timeInSafeSeats(input({ diary: FULL.diary.filter((e) => e.id !== "d4") })),
  [],
);
eq(
  "exactly half in safe seats still counts",
  timeInSafeSeats(
    input({
      diary: [...FULL.diary, stop("2026-10-11", "w-mwiki"), stop("2026-10-12", "w-utawala")],
    }),
  ).map((x) => x.line),
  [
    "4 of your 8 stops (last 30 days and next 14) are in Hold or Lean ours seats, which hold 11% of the votes within reach.",
  ],
);
eq(
  "under half in safe seats: quiet",
  timeInSafeSeats(
    input({
      diary: [
        ...FULL.diary,
        stop("2026-10-11", "w-mwiki"),
        stop("2026-10-12", "w-utawala"),
        stop("2026-10-16", "w-kileleshwa"),
      ],
    }),
  ),
  [],
);
eq("not for an MP", timeInSafeSeats(input({ home: "nairobi/westlands" })), []);
eq("no side: quiet", timeInSafeSeats(input({ atlas: NO_SIDE })), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
