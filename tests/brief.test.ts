// Checks for the Next two weeks page: a stored brief read without trust, the fortnight's bands,
// open diary days and what the records flag.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/brief.test.ts

import { bands, diaryGaps, liveActions, moveDate, readBrief, readSources } from "@/lib/brief";

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
  "sources: https links only, bad dates dropped",
  readSources([
    { label: "The Star", url: "https://the-star.co.ke/x", date: "2026-10-08" },
    { label: "A blog", url: "javascript:alert(1)", date: "yesterday" },
    { url: "https://no-label.example" },
  ]),
  [
    { label: "The Star", url: "https://the-star.co.ke/x", date: "2026-10-08" },
    { label: "A blog", url: null, date: null },
  ],
);

const row = {
  id: "b1",
  starts_on: "2026-10-21",
  ends_on: "2026-11-03",
  headline: "Own the farm vote before DCP picks its man",
  written_by: "Groundwork",
  created_at: "2026-10-20T10:00:00Z",
  the_read: [
    { title: "DCP owns the mountain", body: "33% to UDA's 9%.", stance: "threat", sources: [] },
    { title: "", body: "no title, dropped" },
    { title: "Odd stance", body: "kept as context", stance: "wobbly" },
  ],
  moves: [
    {
      from: 4,
      to: 6,
      title: "Dairy tour",
      why: "Milk is the economy.",
      how: ["Komothai", ""],
      where: ["Komothai"],
      diary: { kind: "visit" },
    },
    { from: 1, title: "Name the party", diary: { kind: "media", title: "Press briefing" } },
    { from: 15, title: "out of range" },
    { from: 3, to: 2, title: "backwards" },
  ],
  watch: [{ title: "DCP primary", body: "Kago or Mabati." }, { title: "no body" }],
};
const b = readBrief(row)!;
eq("headline", b.headline, "Own the farm vote before DCP picks its man");
eq(
  "read: titled sections, unknown stance as context",
  b.read.map((s) => [s.title, s.stance]),
  [
    ["DCP owns the mountain", "threat"],
    ["Odd stance", "context"],
  ],
);
eq(
  "moves: in order, bad ones dropped",
  b.moves.map((m) => [m.from, m.to, m.title]),
  [
    [1, 1, "Name the party"],
    [4, 6, "Dairy tour"],
  ],
);
eq(
  "a move's diary entry takes its title or the move's",
  b.moves.map((m) => m.diary),
  [
    { kind: "media", title: "Press briefing" },
    { kind: "visit", title: "Dairy tour" },
  ],
);
eq("empty how lines dropped", b.moves[1]?.how, ["Komothai"]);
eq("watch: complete ones only", b.watch.length, 1);
eq("not a brief", readBrief({ id: "x", headline: "" }), null);

eq(
  "bands with dates",
  bands(b).map((x) => [x.label, x.from, x.to, x.moves.length]),
  [
    ["Days 1–3", "2026-10-21", "2026-10-23", 1],
    ["Days 4–7", "2026-10-24", "2026-10-27", 1],
    ["Days 8–10", "2026-10-28", "2026-10-30", 0],
    ["Days 11–14", "2026-10-31", "2026-11-03", 0],
  ],
);
eq("a move's date", moveDate("2026-10-21", { from: 4 }), "2026-10-24");

eq(
  "open days: only public appearances fill a day",
  diaryGaps(
    [
      { day: "2026-10-21", kind: "market" },
      { day: "2026-10-22", kind: "watch" },
    ],
    "2026-10-21",
    3,
  ),
  ["2026-10-22", "2026-10-23"],
);

const acts = liveActions({
  today: "2026-10-21",
  diary: [{ day: "2026-10-21", kind: "rally" }],
  lists: [
    { status: "out", dueOn: null, givenTo: "u1", wardName: "Ikinu" },
    { status: "draft", dueOn: "2026-10-22", givenTo: null, wardName: "Ngewa" },
    { status: "done", dueOn: null, givenTo: null, wardName: "Githiga" },
  ],
  wards: [
    { name: "Komothai", targetVotes: 7669, doorsPlanned: 0, doorsKnocked: 0 },
    { name: "Ikinu", targetVotes: 6674, doorsPlanned: 100, doorsKnocked: 20 },
  ],
});
eq(
  "what the records flag",
  acts.map((a) => [a.key, a.headline]),
  [
    ["diary-gaps", "13 days of the next 14 have no public appearance booked"],
    ["lists-unplanned", "1 walk list with no day, 1 with nobody to walk it"],
    ["wards-bare", "No doors planned in Komothai"],
    ["doors", "20 of 100 planned doors knocked this fortnight"],
  ],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
