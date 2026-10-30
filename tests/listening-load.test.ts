// Checks for reading a window of Listening's posts a thousand at a time: only the campaign asked
// for, only the window, newest first, off-topic posts left out, and a note when there were more.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-load.test.ts

import { loadWindow } from "@/lib/listening-load.server";

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

const post = (i: number, o: Record<string, unknown> = {}) => ({
  id: `m${String(i).padStart(5, "0")}`,
  campaign_id: "c1",
  topic_id: null,
  source: "x",
  domain: null,
  url: `https://x.com/a/status/${i}`,
  // newest first as i falls: i = 1 is the newest
  published_at: null,
  found_at: new Date(Date.parse("2026-10-30T00:00:00Z") - i * 60_000).toISOString(),
  sentiment: null,
  sentiment_score: null,
  issue: null,
  status: "new",
  rival_id: null,
  author: "@a",
  reach: null,
  shares: null,
  comments_read: null,
  comments_positive: null,
  comments_negative: null,
  title: "words that are not loaded",
  snippet: "nor these",
  ...o,
});
const since = "2026-10-01T00:00:00.000Z";

async function main() {
  const mine = Array.from({ length: 2300 }, (_, i) => post(i + 1));
  const sb = fakeSupabase({
    listening_mentions: [
      ...mine,
      post(5000, { campaign_id: "c2" }),
      post(5001, { found_at: "2026-09-01T00:00:00Z" }),
      post(5002, { issue: "off-topic" }),
    ],
  });

  const all = await loadWindow(sb as never, { since, campaignId: "c1" });
  // 2,300 posts in the window, over three pages; one more is off-topic and one is before the window.
  eq("all of it", all.rows.length, 2300);
  eq("not truncated", all.truncated, false);
  eq("newest first", [all.rows[0]!.id, all.rows[1]!.id], ["m00001", "m00002"]);
  eq(
    "only this campaign",
    all.rows.some((r) => r.id === "m05000"),
    false,
  );
  eq("the words are not loaded", [all.rows[0]!.title, all.rows[0]!.snippet], [null, null]);
  eq(
    "the old post is outside the window",
    all.rows.some((r) => r.id === "m05001"),
    false,
  );
  eq(
    "the off-topic post is left out",
    all.rows.some((r) => r.id === "m05002"),
    false,
  );

  const capped = await loadWindow(sb as never, { since, campaignId: "c1", cap: 1500 });
  eq("a cap cuts the list", capped.rows.length, 1500);
  eq("and says so", capped.truncated, true);
  eq("keeping the newest", capped.rows[1499]!.id, "m01500");

  const exact = await loadWindow(
    fakeSupabase({ listening_mentions: mine.slice(0, 1000) }) as never,
    { since },
  );
  eq("a full page followed by an empty one is complete", exact.truncated, false);

  const everyone = await loadWindow(sb as never, { since });
  eq(
    "with no campaign named, whatever the client may see",
    everyone.rows.some((r) => r.id === "m05000"),
    true,
  );

  const bounded = await loadWindow(sb as never, {
    since,
    until: new Date(Date.parse("2026-10-30T00:00:00Z") - 100 * 60_000).toISOString(),
    campaignId: "c1",
  });
  // m00100 was found at exactly the bound, and "before" leaves it out; m00101 is the newest kept.
  eq(
    "an upper bound leaves out what is newer",
    [bounded.rows.length, bounded.rows[0]!.id],
    [2200, "m00101"],
  );
  eq(
    "and the post found at the bound itself",
    bounded.rows.some((r) => r.id === "m00100"),
    false,
  );

  const broken = {
    from: () => ({
      select: () => ({
        gte: () => ({
          order: () => ({
            order: () => ({
              range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    }),
  };
  let message = "";
  try {
    await loadWindow(broken as never, { since });
  } catch (e) {
    message = (e as Error).message;
  }
  eq("a database error is said plainly", message, "The posts could not be read.");

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
