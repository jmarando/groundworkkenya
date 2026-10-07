// Checks for Home read out for the car: what Home shows, and nothing invented.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/home-spoken.test.ts

import { spokenHome, spokenTime } from "@/lib/home-spoken";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}`);
  }
}

const text = spokenHome({
  name: "Njeri",
  today: "2026-10-01",
  verdict: "Third, behind Babu Owino and Agnes Kagure.",
  items: [
    {
      title: "2 expenses to approve",
      detail: "Approval needs the supporting document on file.",
      action: { kind: "go", label: "Open Finance", to: "/finance" },
    },
  ],
  story: {
    day: "2026-10-01",
    writtenBy: "groundwork",
    at: "2026-10-01T03:04:00Z",
    editedBy: null,
    story: {
      kind: "written",
      headline: "Rationing hits Eastlands",
      summary: "Water rationing now covers 14 wards.",
      why: null,
      rivals: null,
      line: "Tankers to every ward this week.",
      figures: [],
      sources: [],
      also: [],
      picks: [],
      from: 3,
    },
  },
  plan: [
    {
      id: "d1",
      day: "2026-10-01",
      startsAt: "10:30",
      title: "Kayole water point",
      kind: "visit",
      wardId: null,
      wardName: null,
      note: "Bowsers at noon.",
    },
    {
      id: "d2",
      day: "2026-10-01",
      startsAt: null,
      title: "Sunday service",
      kind: "church",
      wardId: null,
      wardName: null,
      note: null,
    },
  ],
  mind: {
    key: "water",
    label: "Water",
    score: 0.7,
    shares: { news: 0.75, messages: 0.6, door: null, searches: 0.75 },
    examples: [],
  },
});
ok(
  "it greets the person signed in",
  text.startsWith("Good morning, Njeri. Let's get you ready for Thursday 1 October."),
);
ok(
  "where the race stands",
  text.includes("Now, the race. Third, behind Babu Owino and Agnes Kagure."),
);
ok(
  "today's list",
  text.includes(
      "One thing to focus on.\n\nFirst: 2 expenses to approve. Approval needs the supporting document on file.",
  ),
);
ok(
  "the morning's real story",
  text.includes(
    "First, the story making headlines. Rationing hits Eastlands. Water rationing now covers 14 wards.",
  ),
);
ok(
  "top of mind",
  text.includes(
    "On people's minds this week: water. It accounts for 70% of what was raised across news and social, messages to us and searches.",
  ),
);
ok(
  "where to be",
  text.includes(
    "And now, your day on the ground.\n\nAt 10 30 a.m., Kayole water point. Bowsers at noon.\n\nAll day, Sunday service.",
  ),
);
ok("nothing invented", !/sample|invented|Challenger/i.test(text));
const quiet = spokenHome({
  name: "Njeri",
  today: "2026-10-01",
  verdict: "",
  items: [],
  story: null,
  plan: [],
  mind: null,
});
ok(
  "a quiet morning says only what there is",
  !quiet.includes("headlines") && !quiet.includes("priorities") && quiet.endsWith("You're up to speed. Have a good day."),
);
ok("story leads before priorities", text.indexOf("story making headlines") < text.indexOf("today's priorities"));
ok("suggestion is not an established position", text.includes("a suggested line: Tankers to every ward this week."));
ok("closing priority", text.includes("your first priority: 2 expenses to approve."));
ok("spoken times", spokenTime("00:00") === "12 a.m." && spokenTime("13:05") === "1 oh 5 p.m.");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
