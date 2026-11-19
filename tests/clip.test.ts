// Checks for cutting text before it is stored. A cut made with .slice() can split an emoji's two
// UTF-16 halves; supabase-js then sends the lone half as "\ud83d", and Postgres refuses the whole
// statement ("invalid input syntax for type json"; NUL fails it too). Daraja Pulse lost whole
// keyword scans this way. Every reader that cuts a post's text for storing cuts with clip().
// Stand-ins answer instead of ScrapeCreators; nothing leaves this process. Invented accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/clip.test.ts

import { parseAlertFeed } from "@/lib/alerts-feed";
import { clip } from "@/lib/clip";
import { parseFeed, serperStories } from "@/lib/news-feeds";
import { scSearchReddit, scSearchTikTok, scSearchYouTube } from "@/lib/scrapecreators.server";
import { readScXSearch, readXSearch } from "@/lib/x-read";

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

// clip itself: Daraja Pulse's, the same checks.
eq("cut to the limit, an emoji that would not fit left out", clip("ab😀cd", 3), "ab");
eq("an emoji that fits is kept whole", clip("ab😀cd", 4), "ab😀");
eq("plain text cut as before", clip("abcdef", 4), "abcd");
eq(
  "text within the limit kept as it is, emoji, skin tones and Kiswahili included",
  clip("Asante sana 🙏🏾 #Nairobi", 300),
  "Asante sana 🙏🏾 #Nairobi",
);
eq(
  "half an emoji that arrived already cut is dropped, and so is NUL",
  clip("Shule \ud83d bora\u0000", 300),
  "Shule  bora",
);
eq("a lone second half is dropped too", clip("\ude00tail", 300), "tail");
eq(
  "null for empty text or anything that isn't text",
  [clip("", 10), clip("\u0000", 10), clip(null, 10), clip(undefined, 10), clip(42, 10)],
  [null, null, null, null, null],
);

// 299 letters, an emoji across the 300 cut (a title), 898 letters, an emoji across the 1,200 cut
// (a text).
const CAPTION = `${"a".repeat(299)}😀${"b".repeat(898)}😀 tail`;
const TITLE = "a".repeat(299);
const TEXT = `${"a".repeat(299)}😀${"b".repeat(898)}`;

function answer(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
}

async function main() {
  process.env["SCRAPECREATORS_API_KEY"] = "test-key";

  answer({
    search_item_list: [
      {
        aweme_info: {
          aweme_id: "7500000000000000001",
          desc: CAPTION,
          author: { unique_id: "maji.watch254" },
          create_time: 1790640000,
        },
      },
    ],
  });
  const [tiktok] = await scSearchTikTok("Nairobi water");
  eq(
    "TikTok: title and text cut without half an emoji",
    [tiktok?.title, tiktok?.snippet],
    [TITLE, TEXT],
  );

  answer({ posts: [{ permalink: "/r/Kenya/comments/1/a/", title: CAPTION, selftext: CAPTION }] });
  const [reddit] = await scSearchReddit("Nairobi water");
  eq(
    "Reddit: title and text cut without half an emoji",
    [reddit?.title, reddit?.snippet],
    [TITLE, TEXT],
  );

  answer({
    posts: [{ permalink: "/r/Kenya/comments/2/b/", title: "Maji \ud83d leo", selftext: "" }],
  });
  const [half] = await scSearchReddit("Nairobi water");
  eq("half an emoji sent by the platform is dropped", half?.title, "Maji  leo");

  answer({ videos: [{ url: "https://www.youtube.com/watch?v=abc", title: CAPTION }], shorts: [] });
  const [youtube] = await scSearchYouTube("Nairobi water");
  eq("YouTube: title cut without half an emoji", youtube?.title, TITLE);

  delete process.env["SCRAPECREATORS_API_KEY"];

  const [x] = readXSearch({
    tweets: [{ id: "1848000000000000001", text: CAPTION, author: { userName: "kiambu_voice" } }],
  });
  eq(
    "X (TwitterAPI.io): title and text cut without half an emoji",
    [x?.title, x?.snippet],
    [TITLE, TEXT],
  );

  const [scX] = readScXSearch({
    tweets: [
      { rest_id: "1848000000000000002", full_text: CAPTION, user: { screen_name: "kiambu_voice" } },
    ],
  });
  eq(
    "X (ScrapeCreators): title and text cut without half an emoji",
    [scX?.title, scX?.snippet],
    [TITLE, TEXT],
  );

  const [feed] = parseFeed(
    `<rss><channel><item><title>${CAPTION}</title><link>https://outlet.test/a</link>` +
      `<description>${CAPTION}</description></item></channel></rss>`,
  );
  eq(
    "an outlet's feed: title and text cut without half an emoji",
    [feed?.title, feed?.snippet],
    [TITLE, TEXT],
  );

  const [serper] = serperStories({
    news: [
      { link: "https://courier.test/a", title: CAPTION, snippet: CAPTION, source: "Test Courier" },
    ],
  });
  eq(
    "the news search: title and text cut without half an emoji",
    [serper?.title, serper?.snippet],
    [TITLE, TEXT],
  );

  const [alert] = parseAlertFeed(
    `<feed><entry><title type="html">${CAPTION}</title><link href="https://outlet.test/b"></link>` +
      `<content type="html">${CAPTION}</content></entry></feed>`,
  );
  eq(
    "a Google Alert: title and text cut without half an emoji",
    [alert?.title, alert?.snippet],
    [TITLE, TEXT],
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
