// Checks for reading TikTok keyword results out of ScrapeCreators' answer: each video comes
// wrapped as { aweme_info: {...} }, and a bare one is read too. A stand-in answers instead of
// ScrapeCreators; nothing leaves this process. Invented accounts only. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/tiktok-search.test.ts

import { scSearchTikTok } from "@/lib/scrapecreators.server";

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

function answer(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
}

/** What a search gives back, or what it fails with. */
async function outcome(search: Promise<unknown>): Promise<unknown> {
  try {
    return await search;
  } catch (e) {
    return `threw: ${(e as Error).message}`;
  }
}

const id = (n: number) => `750000000000000000${n}`;

// ScrapeCreators documents /v1/tiktok/search/keyword as one { aweme_info: {...} } per video. The
// video's id and a create_time also sit inside nested objects (statistics, music), so reading the
// wrong level would give the wrong link or date.
const video = (videoId: string) => ({
  aweme_id: videoId,
  desc: "Tankers are late again on our street",
  create_time: 1790640000,
  author: { unique_id: "maji.watch254", nickname: "Maji Watch" },
  statistics: { aweme_id: videoId, play_count: 31677, share_count: 22 },
  music: { create_time: 1600000000 },
  share_url: `https://www.tiktok.com/@maji.watch254/video/${videoId}?is_from_webapp=1`,
});
const found = (videoId: string) => ({
  url: `https://www.tiktok.com/@maji.watch254/video/${videoId}`,
  title: "Tankers are late again on our street",
  snippet: "Tankers are late again on our street",
  publishedAt: "2026-09-29T00:00:00.000Z",
  author: "@maji.watch254",
  reach: 31677,
  shares: 22,
});
const wrapped = (v: unknown) => ({ aweme_info: v });

async function main() {
  process.env["SCRAPECREATORS_API_KEY"] = "test-key";

  answer({ success: true, search_item_list: [wrapped(video(id(1)))] });
  eq("a video wrapped in aweme_info is read", await scSearchTikTok("water"), [found(id(1))]);

  answer({ success: true, search_item_list: [video(id(1))] });
  eq("a bare video is still read", await scSearchTikTok("water"), [found(id(1))]);

  answer({
    success: true,
    search_item_list: [
      wrapped({
        desc: "No id",
        share_url: `https://www.tiktok.com/@someone/video/${id(2)}`,
      }),
    ],
  });
  eq("a wrapped video with no id keeps its share link", await scSearchTikTok("water"), [
    {
      url: `https://www.tiktok.com/@someone/video/${id(2)}`,
      title: "No id",
      snippet: "No id",
      publishedAt: null,
      author: null,
      reach: null,
      shares: null,
    },
  ]);

  answer({
    success: true,
    search_item_list: [
      wrapped({ desc: "No id, no link" }),
      wrapped(video(id(1))),
      wrapped(video(id(2))),
      wrapped(video(id(3))),
    ],
  });
  eq(
    "results that cannot be read do not use up the limit",
    (await scSearchTikTok("water", 2)).map((h) => h.url.slice(-1)),
    ["1", "2"],
  );

  // Results that all fail to read mean the answer's shape changed, not that nobody posted.
  answer({
    success: true,
    search_item_list: [wrapped({ desc: "No id, no link" }), { unexpected: true }],
  });
  eq(
    "results that all fail to read are said so, with what the first one held",
    await outcome(scSearchTikTok("water")),
    "threw: TikTok search returned results that could not be read (first result: desc).",
  );
  answer({ success: true, search_item_list: [null] });
  eq(
    "and when the first holds nothing to name, only that they could not be read",
    await outcome(scSearchTikTok("water")),
    "threw: TikTok search returned results that could not be read.",
  );
  answer({
    success: true,
    search_item_list: [wrapped({ desc: "No id, no link" }), wrapped(video(id(1)))],
  });
  eq(
    "one readable result is enough: the others are dropped quietly",
    await outcome(scSearchTikTok("water")),
    [found(id(1))],
  );

  answer({ success: true, search_item_list: [] });
  eq("no results is an empty list", await scSearchTikTok("water"), []);
  answer({ success: true });
  eq("an answer with no list is an empty list", await scSearchTikTok("water"), []);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
