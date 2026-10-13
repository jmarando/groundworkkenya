// Checks for the rivals-and-polls rules: the biggest recent poll move, ours
// included, and a rival suddenly taking more of the news. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-rivals.test.ts

import { unaccounted } from "@/lib/findings/core";
import { pollMove, rivalInNews } from "@/lib/findings/rivals";

import { FULL, input, poll } from "./findings-fixture";

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

// ---------------------------------------------------------------- 11. poll move

{
  const out = pollMove(FULL);
  eq(
    "the biggest move in one pollster's last two polls",
    out.map((x) => [x.id, x.place, x.line]),
    [
      [
        "poll-move:campaign",
        null,
        "Challenger A up 4.0 points in Pollster B's latest poll, from 31% to 35%.",
      ],
    ],
  );
  eq("see the race", out[0]?.next, { label: "See the race", to: "/home", hash: "race" });
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
{
  const ours = pollMove(
    input({
      polls: [
        poll("older", "2026-08-15", [
          ["us", 36],
          ["r-a", 31],
        ]),
        poll(
          "newer",
          "2026-10-01",
          [
            ["us", 33],
            ["r-a", 32],
          ],
          2.5,
        ),
      ],
    }),
  );
  eq(
    "our own move counts",
    ours.map((x) => x.line),
    ["We're down 3.0 points in Pollster B's latest poll, from 36% to 33%."],
  );
}
{
  const small = pollMove(
    input({
      polls: [
        poll("older", "2026-08-15", [
          ["us", 33],
          ["r-a", 31],
        ]),
        poll(
          "newer",
          "2026-10-01",
          [
            ["us", 33],
            ["r-a", 33],
          ],
          2.5,
        ),
      ],
    }),
  );
  eq(
    "a move inside the margin of error says so",
    small.map((x) => x.line),
    [
      "Challenger A up 2.0 points in Pollster B's latest poll, from 31% to 33%, within the poll's margin of error (±2.5).",
    ],
  );
  eq("every number is a figure", small.map(unaccounted), [[]]);
}
eq(
  "no margin given: no note",
  pollMove(
    input({
      polls: [
        poll("older", "2026-08-15", [["r-a", 31]]),
        poll("newer", "2026-10-01", [["r-a", 33]]),
      ],
    }),
  ).map((x) => x.line),
  ["Challenger A up 2.0 points in Pollster B's latest poll, from 31% to 33%."],
);
eq("the newer poll over 30 days old: quiet", pollMove(input({ today: "2026-11-15" })), []);
eq("one poll: quiet", pollMove(input({ polls: FULL.polls.slice(1) })), []);

// ---------------------------------------------------------------- 12. rival in the news

{
  const out = rivalInNews(FULL);
  eq(
    "a rival's share of the news well up",
    out.map((x) => [x.id, x.line]),
    [
      [
        "rival-in-news:r-a",
        "Challenger A was in 42% of news and social mentions this week, up from 18% over the previous four weeks.",
      ],
    ],
  );
  eq("open Listening", out[0]?.next, { label: "Open Listening", to: "/listening" });
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "under 20 mentions this week: quiet",
  rivalInNews(
    input({
      rivalWeeks: FULL.rivalWeeks!.map((r) =>
        r.rivalId === "r-a" && r.week === 0 ? { ...r, n: 19 } : r,
      ),
    }),
  ),
  [],
);
eq(
  "too few mentions before to compare: quiet",
  rivalInNews(input({ rivalWeeks: FULL.rivalWeeks!.filter((r) => r.week === 0) })),
  [],
);
eq(
  "our own candidate isn't a rival",
  rivalInNews(input({ rivals: FULL.rivals.filter((r) => r.isUs) })),
  [],
);
eq("before the update: quiet", rivalInNews(input({ rivalWeeks: null })), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
