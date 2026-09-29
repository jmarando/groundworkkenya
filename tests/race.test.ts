// Checks for saving the race: new and changed rivals and polls, removals, and
// what the person is told when the database refuses. Uses a stand-in
// database; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/race.test.ts

import { RACE_DENIED, raceError, removeRow, writePoll, writeRival } from "@/lib/race.functions";

import { fakeSupabase } from "./fake-supabase";

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

async function refuses(name: string, fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const rival = {
  id: null,
  name: "Babu Owino",
  party: "The Mwananchi Party",
  office: "Embakasi East MP",
  isUs: false,
  tone: "a" as const,
  sort: 1,
  facebook: null,
  x: "HEBabuOwino",
  tiktok: null,
};

async function main() {
  {
    const sb = fakeSupabase({ race_rivals: [] });
    const id = await writeRival(sb as never, rival);
    eq(
      "a new rival is added",
      sb.tables["race_rivals"]?.map((r) => [r["id"], r["name"], r["is_us"], r["x"]]),
      [[id, "Babu Owino", false, "HEBabuOwino"]],
    );
    await writeRival(sb as never, { ...rival, id, party: "ODM" });
    eq(
      "and changed",
      sb.tables["race_rivals"]?.map((r) => r["party"]),
      ["ODM"],
    );
    await refuses(
      "an update nobody may make is refused",
      () => writeRival(sb as never, { ...rival, id: "not-theirs" }),
      RACE_DENIED,
    );
    await removeRow(sb as never, "race_rivals", id);
    eq("and removed", sb.tables["race_rivals"]?.length, 0);
    await refuses(
      "a removal nobody may make is refused",
      () => removeRow(sb as never, "race_rivals", id),
      RACE_DENIED,
    );
  }
  {
    const sb = fakeSupabase({ race_polls: [] });
    await writePoll(sb as never, {
      id: null,
      pollster: "Mizani Africa",
      fieldworkFrom: "2026-08-21",
      fieldworkTo: "2026-08-28",
      publishedOn: "2026-09-10",
      sampleSize: 1820,
      margin: 2.3,
      sourceUrl: "https://a.test/ma",
      shares: [
        { name: "Babu Owino", share: 28.4, rivalId: "b" },
        { name: "Dennis Waweru", share: 1.5, rivalId: null },
      ],
      undecided: 8.1,
      approval: null,
      disapproval: null,
    });
    eq(
      "a poll is stored as the database keeps it",
      sb.tables["race_polls"]?.map((r) => [r["pollster"], r["published_on"], r["shares"]]),
      [
        [
          "Mizani Africa",
          "2026-09-10",
          [
            { name: "Babu Owino", share: 28.4, rival_id: "b" },
            { name: "Dennis Waweru", share: 1.5 },
          ],
        ],
      ],
    );
  }
  eq(
    "refused by row security",
    raceError({ code: "42501", message: "new row violates row-level security policy" }),
    RACE_DENIED,
  );
  eq(
    "two candidates of ours",
    raceError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "race_rivals_one_us_idx"',
    }),
    "Only one candidate can be yours.",
  );
  eq(
    "a name twice",
    raceError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "race_rivals_name_idx"',
    }),
    "That candidate is already on the list.",
  );
  eq(
    "a failed check",
    raceError({ code: "23514", message: "violates check constraint" }),
    "The database refused that: check the figures and the link.",
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
