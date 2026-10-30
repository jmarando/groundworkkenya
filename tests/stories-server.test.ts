// Checks for the hourly story job: posts that match become one story per campaign, a saved story
// keeps its id and its name, posts that no longer match are let go, and a name that cannot be had
// from the AI falls back to the first headline. No network: the namer is handed in. Invented posts
// only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/stories-server.test.ts

import { headlineOf, runStories, type Namer } from "@/lib/stories.server";

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

const NOW = Date.parse("2026-10-30T12:00:00Z");
const article = "https://paper.example.test/water/taps-dry-nine-days";
const none: Namer = () => Promise.resolve(null);

const post = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  campaign_id: "c1",
  topic_id: "t1",
  url: `https://x.com/${id}/status/${id.length}${id}`,
  source: "x",
  domain: null,
  author: `@${id}`,
  title: "Something else entirely about football fixtures",
  snippet: null,
  published_at: "2026-10-29T14:05:00Z",
  found_at: "2026-10-29T14:05:00Z",
  refers_to: null,
  story_id: null,
  reach: null,
  sentiment: null,
  issue: null,
  rival_id: null,
  ...o,
});
const first = (id = "p1", o: Record<string, unknown> = {}) =>
  post(id, { title: `Taps dry for nine days ${article}`, reach: 900, ...o });
const paper = (id = "p2", o: Record<string, unknown> = {}) =>
  post(id, {
    url: article,
    source: "news",
    domain: "paper.example.test",
    author: null,
    title: "Taps dry for nine days in Githunguri",
    published_at: "2026-10-29T19:05:00Z",
    found_at: "2026-10-29T19:05:00Z",
    reach: null,
    ...o,
  });

function world(
  posts: Record<string, unknown>[],
  stories: Record<string, unknown>[] = [],
  topics: Record<string, unknown>[] = [
    { id: "t1", campaign_id: "c1", kind: "campaign", label: "Githunguri", active: true },
    { id: "t2", campaign_id: "c2", kind: "campaign", label: "Mathira", active: true },
  ],
) {
  return fakeSupabase({
    listening_topics: topics,
    listening_mentions: posts,
    listening_stories: stories,
  });
}
const storiesOf = (sb: ReturnType<typeof world>) => sb.tables["listening_stories"] ?? [];
const storyOf = (sb: ReturnType<typeof world>, id: string) =>
  sb.tables["listening_mentions"]!.find((m) => m["id"] === id)!["story_id"];

async function main() {
  // ---- a new story
  {
    const sb = world([first(), paper(), post("lone")]);
    const r = await runStories(sb as never, { now: NOW, name: none });
    const rows = storiesOf(sb);
    eq("one story from two posts, the loner left out", rows.length, 1);
    const s = rows[0]!;
    eq(
      "its campaign, counts and times",
      [s["campaign_id"], s["posts"], s["voices"], s["views"]],
      ["c1", 2, 2, 900],
    );
    eq(
      "first seen is the earliest post",
      [s["first_mention_id"], s["first_seen_at"], s["last_post_at"]],
      ["p1", "2026-10-29T14:05:00.000Z", "2026-10-29T19:05:00.000Z"],
    );
    eq(
      "with no name to be had, the first headline stands in, with no link in it",
      s["title"],
      "Taps dry for nine days",
    );
    eq("both posts belong to it", [storyOf(sb, "p1"), storyOf(sb, "p2")], [s["id"], s["id"]]);
    eq("the loner belongs to nothing", storyOf(sb, "lone"), null);
    eq("the run says so", [r.ran, r.created, r.named], [true, 1, 0]);
  }

  // ---- naming
  {
    const sb = world([first(), paper()]);
    const seen: unknown[] = [];
    const r = await runStories(sb as never, {
      now: NOW,
      name: (posts) => {
        seen.push(posts.map((p) => p.title));
        return Promise.resolve("Taps dry in Githunguri");
      },
    });
    eq("the AI's name is kept", storiesOf(sb)[0]!["title"], "Taps dry in Githunguri");
    eq(
      "it was asked with the first posts' words",
      (seen[0] as string[])[0],
      `Taps dry for nine days ${article}`,
    );
    eq("and counted", r.named, 1);
  }
  {
    const sb = world([first(), paper()]);
    const r = await runStories(sb as never, {
      now: NOW,
      name: () => Promise.reject(new Error("AI is down")),
    });
    eq(
      "a name that cannot be had falls back, and the run goes on",
      [r.ran, storiesOf(sb)[0]!["title"]],
      [true, "Taps dry for nine days"],
    );
  }
  {
    const sb = world([first(), paper()]);
    await runStories(sb as never, {
      now: NOW,
      name: () =>
        Promise.resolve(
          '  "A  very   long name that has far more than eight words in it indeed yes"  ',
        ),
    });
    eq(
      "a name is tidied and cut to eight words",
      storiesOf(sb)[0]!["title"],
      "A very long name that has far more",
    );
  }
  {
    const sb = world([first(), paper()]);
    await runStories(sb as never, { now: NOW, name: () => Promise.resolve("   ") });
    eq("an empty name is no name", storiesOf(sb)[0]!["title"], "Taps dry for nine days");
  }

  // ---- a saved story is kept
  {
    const tiktok = post("p3", {
      url: "https://www.tiktok.com/@c/video/3",
      source: "tiktok",
      author: "@c",
      title: `More on it ${article}`,
      published_at: "2026-10-29T20:05:00Z",
      found_at: "2026-10-29T20:05:00Z",
    });
    const sb = world(
      [first("p1", { story_id: "s1" }), paper("p2", { story_id: "s1" }), tiktok],
      [
        {
          id: "s1",
          campaign_id: "c1",
          title: "Taps dry in Githunguri",
          first_mention_id: "p1",
          status: "new",
          created_at: "2026-10-29T15:00:00Z",
          posts: 2,
          voices: 2,
        },
      ],
    );
    let asked = 0;
    await runStories(sb as never, { now: NOW, name: () => (asked++, Promise.resolve("Renamed")) });
    eq(
      "it keeps its id and its name",
      [storiesOf(sb).length, storiesOf(sb)[0]!["id"], storiesOf(sb)[0]!["title"]],
      [1, "s1", "Taps dry in Githunguri"],
    );
    eq("and is not named again", asked, 0);
    eq(
      "a new post joins it, and its counts follow",
      [storiesOf(sb)[0]!["posts"], storiesOf(sb)[0]!["voices"], storyOf(sb, "p3")],
      [3, 3, "s1"],
    );
  }

  // ---- a post that no longer matches is let go
  {
    const sb = world(
      [
        first("p1", { story_id: "s1" }),
        paper("p2", { story_id: "s1" }),
        post("p3", { story_id: "s1" }),
      ],
      [
        {
          id: "s1",
          campaign_id: "c1",
          title: "Taps dry in Githunguri",
          first_mention_id: "p1",
          status: "new",
          created_at: "2026-10-29T15:00:00Z",
          posts: 3,
          voices: 3,
        },
      ],
    );
    await runStories(sb as never, { now: NOW, name: none });
    eq("it leaves the story", [storyOf(sb, "p3"), storyOf(sb, "p1")], [null, "s1"]);
    eq("and the counts say two", storiesOf(sb)[0]!["posts"], 2);
  }
  {
    const sb = world(
      [
        post("a", { story_id: "s1" }),
        post("b", { story_id: "s1", title: "Quite unrelated words about the weather in Nairobi" }),
      ],
      [
        {
          id: "s1",
          campaign_id: "c1",
          title: "Gone",
          first_mention_id: "a",
          status: "new",
          created_at: "2026-10-29T15:00:00Z",
          posts: 2,
          voices: 2,
        },
      ],
    );
    await runStories(sb as never, { now: NOW, name: none });
    eq(
      "a story whose posts stopped matching lets them all go",
      [storyOf(sb, "a"), storyOf(sb, "b")],
      [null, null],
    );
    eq(
      "and counts none, though the row stays",
      [storiesOf(sb)[0]!["posts"], storiesOf(sb)[0]!["voices"]],
      [0, 0],
    );
  }

  // ---- campaigns stay apart
  {
    const sb = world([
      first("p1"),
      paper("p2"),
      first("q1", { campaign_id: "c2", topic_id: "t2" }),
      paper("q2", { campaign_id: "c2", topic_id: "t2" }),
    ]);
    await runStories(sb as never, { now: NOW, name: none });
    eq(
      "one story each",
      storiesOf(sb)
        .map((s) => s["campaign_id"])
        .sort(),
      ["c1", "c2"],
    );
    eq(
      "never mixing posts",
      [storyOf(sb, "p1") === storyOf(sb, "q1"), storyOf(sb, "p1") === storyOf(sb, "p2")],
      [false, true],
    );
  }

  // ---- what is left out
  {
    const sb = world([first(), paper("p2", { issue: "off-topic" })]);
    await runStories(sb as never, { now: NOW, name: none });
    eq("an off-topic post makes no story", storiesOf(sb).length, 0);
  }
  {
    const sb = world([
      first(),
      paper("p2", { found_at: "2026-10-20T19:05:00Z", published_at: "2026-10-20T19:05:00Z" }),
    ]);
    await runStories(sb as never, { now: NOW, name: none });
    eq("a post older than a week makes none", storiesOf(sb).length, 0);
  }
  {
    const sb = world(
      [first(), paper()],
      [],
      [{ id: "t1", campaign_id: "c1", kind: "campaign", label: "x", active: false }],
    );
    const r = await runStories(sb as never, { now: NOW, name: none });
    eq(
      "a campaign with no active keyword is not looked at",
      [r.campaigns, storiesOf(sb).length],
      [0, 0],
    );
  }

  // ---- the cap on names an hour
  {
    const posts = Array.from({ length: 10 }, (_, i) => [
      post(`u${i}`, { title: `Story ${i} https://paper.example.test/s/${i}` }),
      post(`v${i}`, {
        url: `https://paper.example.test/s/${i}`,
        source: "news",
        domain: "paper.example.test",
        author: null,
        title: `Story ${i} headline`,
      }),
    ]).flat();
    const sb = world(posts);
    let asked = 0;
    const r = await runStories(sb as never, {
      now: NOW,
      name: () => (asked++, Promise.resolve(`Named ${asked}`)),
    });
    eq("ten stories, eight names an hour", [storiesOf(sb).length, asked, r.named], [10, 8, 8]);
    eq(
      "the rest wait with their headlines",
      storiesOf(sb).filter((s) => String(s["title"]).startsWith("Story")).length,
      2,
    );
  }
  {
    // The two left unnamed are named on the next run.
    const posts = Array.from({ length: 10 }, (_, i) => [
      post(`u${i}`, { title: `Story ${i} https://paper.example.test/s/${i}` }),
      post(`v${i}`, {
        url: `https://paper.example.test/s/${i}`,
        source: "news",
        domain: "paper.example.test",
        author: null,
        title: `Story ${i} headline`,
      }),
    ]).flat();
    const sb = world(posts);
    let asked = 0;
    const namer: Namer = () => (asked++, Promise.resolve(`Named ${asked}`));
    await runStories(sb as never, { now: NOW, name: namer });
    await runStories(sb as never, { now: NOW, name: namer });
    eq(
      "the next run names the ones that waited",
      [asked, storiesOf(sb).filter((s) => String(s["title"]).startsWith("Story")).length],
      [10, 0],
    );
  }

  // ---- headlines
  eq(
    "a headline loses its links and is cut at 60",
    headlineOf({
      title: `Taps dry ${article} for very many days indeed and the water company says nothing at all`,
      snippet: null,
    }),
    "Taps dry for very many days indeed and the water company…",
  );
  eq(
    "a headline is its first line",
    headlineOf({ title: "First line\nSecond line", snippet: null }),
    "First line",
  );
  eq(
    "with no title the text stands in",
    headlineOf({ title: null, snippet: "Words of the post" }),
    "Words of the post",
  );
  eq(
    "with nothing at all there is still a name",
    headlineOf({ title: null, snippet: null }),
    "A story we are following",
  );

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
