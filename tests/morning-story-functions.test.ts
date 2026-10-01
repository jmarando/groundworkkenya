// Checks for the team's own changes to this morning's story, with a stand-in
// database. Who may change it is checked in tests/sql/mornings.test.sql. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story-functions.test.ts

import { loadStory, saveTeamStory, STORY_DENIED, storyError } from "@/lib/morning-story.functions";

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

const ME = "user-1";
const GROUNDWORK = {
  kind: "written",
  headline: "Rationing hits Eastlands",
  summary: "Water rationing now covers 14 wards.",
  why: null,
  rivals: null,
  line: null,
  figures: [{ value: "14", label: "wards" }],
  sources: [
    {
      title: "Nation",
      url: "https://nation.africa/rationing",
      source: "nation.africa",
      publishedAt: null,
    },
  ],
  also: [],
  picks: [],
  from: 3,
};

async function main() {
  {
    const sb = fakeSupabase({
      morning_stories: [
        {
          id: "s1",
          day: "2026-09-30",
          story: GROUNDWORK,
          written_by: "groundwork",
          created_at: "2026-09-30T03:04:00Z",
          edited_at: null,
          edited_by: null,
        },
      ],
      profiles: [{ user_id: ME, full_name: "Njeri Kamau" }],
    });
    await saveTeamStory(sb as never, ME, "2026-09-30", {
      headline: "Rationing, and our plan",
      summary: "Tankers go out today.",
    });
    const row = sb.tables["morning_stories"]?.[0];
    eq(
      "an edit is the team's, and keeps the sources",
      [
        row?.["written_by"],
        row?.["edited_by"],
        (row?.["story"] as { headline: string; sources: unknown[] }).headline,
        (row?.["story"] as { sources: unknown[] }).sources.length,
      ],
      ["team", ME, "Rationing, and our plan", 1],
    );
    const view = await loadStory(sb as never, "2026-09-30");
    eq("read back with who edited it", [view?.writtenBy, view?.editedBy], ["team", "Njeri Kamau"]);
  }
  {
    const sb = fakeSupabase({ morning_stories: [] });
    await saveTeamStory(sb as never, ME, "2026-09-30", {
      headline: "Our own story",
      summary: "Written before six.",
      links: ["https://ours.test/plan"],
    });
    eq("with no story yet, the team writes one", sb.tables["morning_stories"]?.length, 1);
  }
  eq("no story, nothing to read", await loadStory(fakeSupabase({}) as never, "2026-09-30"), null);
  eq(
    "what the database's refusals mean",
    [storyError({ code: "42501" }), storyError({ code: "23505" })],
    [STORY_DENIED, "Someone saved this morning's story at the same moment. Open Home again."],
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
