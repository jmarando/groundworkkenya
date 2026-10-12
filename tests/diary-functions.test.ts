// Checks for reading and changing the diary as the signed-in person, with a
// stand-in database. Row level security itself is checked in
// tests/sql/mornings.test.sql. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/diary-functions.test.ts

import {
  DIARY_DENIED,
  diaryError,
  loadDiary,
  loadWeek,
  removeEntry,
  writeEntry,
} from "@/lib/diary.functions";

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

async function rejects(name: string, p: Promise<unknown>, message: string) {
  try {
    await p;
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const row = (id: string, day: string, starts: string | null, extra = {}) => ({
  id,
  campaign_id: "c2",
  day,
  starts_at: starts,
  title: id,
  kind: "visit",
  ward_id: null,
  note: null,
  ...extra,
});

async function main() {
  const sb = fakeSupabase({
    diary_entries: [
      row("later", "2026-10-05", "15:00:00"),
      row("first", "2026-10-05", "08:00:00", { ward_id: "w1", wards: { name: "Kayole North" } }),
      row("next-week", "2026-10-12", "08:00:00"),
      row("sunday", "2026-10-11", null),
    ],
    wards: [
      {
        id: "w2",
        campaign_id: "c2",
        name: "Umoja I",
        slug: "umoja-i",
        constituency: "Embakasi West",
      },
      {
        id: "w1",
        campaign_id: "c2",
        name: "Kayole North",
        slug: "kayole-north",
        constituency: "Embakasi Central",
      },
    ],
  });

  eq(
    "a week's entries, by day then time, with ward names",
    (await loadDiary(sb as never, "2026-10-05", "2026-10-11")).map((e) => [
      e.id,
      e.startsAt,
      e.wardName,
    ]),
    [
      ["first", "08:00", "Kayole North"],
      ["later", "15:00", null],
      ["sunday", null, null],
    ],
  );

  const week = await loadWeek(sb as never, "2026-10-07");
  eq("the week runs Monday to Sunday", [week.days[0], week.days[6]], ["2026-10-05", "2026-10-11"]);
  eq(
    "the campaign's wards, by name",
    week.wards.map((w) => w.name),
    ["Kayole North", "Umoja I"],
  );
  eq(
    "the wards say where they are, for the atlas's brief",
    week.wards.map((w) => [w.slug, w.constituency]),
    [
      ["kayole-north", "Embakasi Central"],
      ["umoja-i", "Embakasi West"],
    ],
  );

  const id = await writeEntry(sb as never, {
    id: null,
    day: "2026-10-06",
    startsAt: "10:30",
    title: "Kayole water point",
    kind: "visit",
    wardId: null,
    note: null,
  });
  eq(
    "an entry is added",
    sb.tables["diary_entries"]?.find((r) => r["id"] === id)?.["starts_at"],
    "10:30",
  );
  await rejects(
    "a change that reaches no entry is refused",
    writeEntry(sb as never, {
      id: "gone",
      day: "2026-10-06",
      startsAt: null,
      title: "Nothing",
      kind: "visit",
      wardId: null,
      note: null,
    }),
    DIARY_DENIED,
  );
  await removeEntry(sb as never, id);
  eq(
    "an entry is removed",
    sb.tables["diary_entries"]?.some((r) => r["id"] === id),
    false,
  );
  await rejects("removing what isn't there is refused", removeEntry(sb as never, id), DIARY_DENIED);

  eq(
    "what the database's refusals mean",
    [diaryError({ code: "42501" }), diaryError({ code: "23503" }), diaryError({ code: "23514" })],
    [
      DIARY_DENIED,
      "That ward isn't one of the campaign's.",
      "The database refused that: check the time, title and note.",
    ],
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
