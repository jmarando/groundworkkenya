// Checks for reading the week's issues from a campaign's own records and its
// latest reads of search interest, with a stand-in database. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/search-interest-functions.test.ts

import { loadMindInputs, loadSearch } from "@/lib/search-interest.functions";

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

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

async function main() {
  const sb = fakeSupabase({
    listening_mentions: [
      {
        id: "m1",
        campaign_id: "c2",
        issue: "water",
        title: "Taps dry",
        url: "https://a.test/1",
        found_at: daysAgo(1),
        rival_id: null,
      },
      {
        id: "m2",
        campaign_id: "c2",
        issue: "water",
        title: "Old",
        url: "https://a.test/2",
        found_at: daysAgo(9),
        rival_id: null,
      },
      {
        id: "m3",
        campaign_id: "c2",
        issue: "water",
        title: "A rival's post",
        url: "https://a.test/3",
        found_at: daysAgo(1),
        rival_id: "r1",
      },
      {
        id: "m4",
        campaign_id: "c3",
        issue: "tea",
        title: "Mathira",
        url: "https://a.test/4",
        found_at: daysAgo(1),
        rival_id: null,
      },
    ],
    conversations: [
      { id: "v1", campaign_id: "c2", issue: "garbage", last_message_at: daysAgo(2) },
      { id: "v2", campaign_id: "c2", issue: null, last_message_at: daysAgo(2) },
      { id: "v3", campaign_id: "c2", issue: "water", last_message_at: daysAgo(10) },
    ],
    person_events: [
      { id: "e1", campaign_id: "c2", kind: "door_spoke", detail: "Water", created_at: daysAgo(3) },
      { id: "e2", campaign_id: "c2", kind: "door_not_home", detail: null, created_at: daysAgo(3) },
    ],
    search_interest: [
      {
        id: "s1",
        campaign_id: "c2",
        day: "2026-09-29",
        kind: "candidates",
        geo: "KE",
        series: [],
        created_at: "2026-09-29T03:05:00Z",
      },
      {
        id: "s2",
        campaign_id: "c2",
        day: "2026-09-30",
        kind: "candidates",
        geo: "KE-110",
        series: [{ term: "Sakaja", ref: "s", points: [{ day: "2026-09-30", value: 40 }] }],
        created_at: "2026-09-30T03:05:00Z",
      },
      {
        id: "s3",
        campaign_id: "c2",
        day: "2026-09-30",
        kind: "issues",
        geo: "KE",
        series: "bad",
        created_at: "2026-09-30T03:05:00Z",
      },
    ],
  });

  const inp = await loadMindInputs(sb as never, "c2", daysAgo(7));
  eq(
    "the week's news, rivals' posts aside, this campaign's only",
    inp.news.map((n) => n.title),
    ["Taps dry"],
  );
  eq("the week's messages with an issue", inp.messages, ["garbage"]);
  eq("doors where the person spoke", inp.door, ["Water"]);

  const read = await loadSearch(sb as never, "candidates");
  eq(
    "the newest read",
    [read?.day, read?.geo, read?.series[0]?.term],
    ["2026-09-30", "KE-110", "Sakaja"],
  );
  eq(
    "a read that isn't a list has no lines",
    (await loadSearch(sb as never, "issues"))?.series,
    [],
  );
  eq(
    "none of a kind",
    await loadSearch(fakeSupabase({ search_interest: [] }) as never, "issues"),
    null,
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
