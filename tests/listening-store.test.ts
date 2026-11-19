// Checks for storing what one Listening keyword found. One upsert takes all its rows or none, so
// when the database refuses a keyword's batch the posts go in one at a time, and a post it can't
// take costs only itself, not the keyword's whole find. Uses a stand-in database that refuses
// what Postgres refuses; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-store.test.ts

import { storeMentions } from "@/lib/listening-store.server";

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

type Row = Record<string, unknown>;

const post = (n: number, extra: Row = {}): Row => ({
  topic_id: "t1",
  source: "tiktok",
  url: `https://posts.test/${n}`,
  title: `Post ${n}`,
  snippet: null,
  ...extra,
});

/** The stand-in database, with each upsert's addresses written down. */
function world(seed: Row[] = [], refuse: Record<string, (r: Row) => string | null> = {}) {
  const sb = fakeSupabase(
    {
      listening_topics: [{ id: "t1", campaign_id: "c1", label: "Water" }],
      listening_mentions: seed,
    },
    {},
    refuse,
  );
  const batches: string[][] = [];
  const client = {
    ...sb,
    from(table: string) {
      const q = sb.from(table);
      const upsert = q.upsert;
      q.upsert = (v: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        batches.push((Array.isArray(v) ? v : [v]).map((r) => String(r["url"])));
        return upsert(v, o);
      };
      return q;
    },
  };
  const urls = () => (sb.tables["listening_mentions"] ?? []).map((m) => m["url"]);
  return { client, batches, urls };
}

const url = (n: number) => `https://posts.test/${n}`;

async function main() {
  {
    const w = world();
    const out = await storeMentions(w.client, [post(1), post(2)]);
    eq("a find the database takes is stored in one go", out, {
      stored: 2,
      skipped: 0,
      reason: null,
    });
    eq("one statement", w.batches, [[url(1), url(2)]]);
    eq("under the keyword's campaign", w.urls().length, 2);
  }
  {
    const w = world();
    const out = await storeMentions(w.client, [
      post(1),
      post(2, { title: "Shule \ud83d" }),
      post(3),
    ]);
    eq(
      "half an emoji makes the database refuse the batch: the posts go in one at a time",
      w.batches,
      [[url(1), url(2), url(3)], [url(1)], [url(2)], [url(3)]],
    );
    eq("and only the post it refuses is lost, with the database's words", out, {
      stored: 2,
      skipped: 1,
      reason: "invalid input syntax for type json",
    });
    eq("the others are stored", w.urls(), [url(1), url(3)]);
  }
  {
    const w = world([], {
      listening_mentions: (r) =>
        r["url"] === url(2)
          ? 'new row for relation "listening_mentions" violates check constraint'
          : null,
    });
    const out = await storeMentions(w.client, [post(1), post(2), post(3)]);
    eq(
      "a post refused for another reason costs only itself too",
      [out, w.urls()],
      [
        {
          stored: 2,
          skipped: 1,
          reason: 'new row for relation "listening_mentions" violates check constraint',
        },
        [url(1), url(3)],
      ],
    );
  }
  {
    const w = world([{ id: "m1", campaign_id: "c1", url: url(1), source: "tiktok" }]);
    const out = await storeMentions(w.client, [post(1), post(2)]);
    eq("a post already held is not counted as new, nor as refused", out, {
      stored: 1,
      skipped: 0,
      reason: null,
    });
  }
  {
    const w = world();
    const out = await storeMentions(w.client, []);
    eq(
      "nothing found: the database is not asked",
      [out, w.batches],
      [{ stored: 0, skipped: 0, reason: null }, []],
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
