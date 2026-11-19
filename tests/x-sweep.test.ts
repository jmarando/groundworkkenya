// Checks for the hourly X pass storing what each keyword found: an emoji at the cut loses no post,
// and a post the database refuses costs only itself, not the keyword's whole find. Stand-ins
// answer instead of TwitterAPI.io and the database; nothing leaves this process. Invented
// accounts only. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/x-sweep.test.ts

import { runXSweep } from "@/lib/x-sweep.server";

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

const id = (n: number) => `184800000000000000${n}`;
const url = (n: number) => `https://x.com/kiambu_voice/status/${id(n)}`;
const tweet = (n: number, text: string) => ({
  id: id(n),
  text,
  author: { userName: "kiambu_voice" },
});

function world(refuse: Record<string, (r: Row) => string | null> = {}) {
  return fakeSupabase(
    {
      listening_topics: [
        {
          id: "t1",
          campaign_id: "c1",
          label: "Water",
          query: "Nairobi water",
          active: true,
          x_scanned_at: null,
        },
      ],
      listening_mentions: [],
    },
    { take_social_credits: () => true },
    refuse,
  );
}

/** TwitterAPI.io answering every search with these posts. */
function answer(tweets: unknown[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ tweets }), { status: 200 })) as typeof fetch;
}

async function main() {
  process.env["TWITTERAPI_IO_KEY"] = "test-key";

  {
    const sb = world();
    answer([tweet(1, `${"a".repeat(299)}😀 maji`), tweet(2, "Maji yamefika 💧")]);
    const r = await runXSweep(sb as never);
    eq(
      "an emoji at the cut loses no post",
      [r.found, sb.tables["listening_mentions"]?.map((m) => m["title"])],
      [2, ["a".repeat(299), "Maji yamefika 💧"]],
    );
    eq("and nothing is said to be lost", r.notes, []);
  }
  {
    const CONSTRAINT = 'new row for relation "listening_mentions" violates check constraint';
    const sb = world({ listening_mentions: (r) => (r["url"] === url(2) ? CONSTRAINT : null) });
    answer([tweet(1, "moja"), tweet(2, "mbili"), tweet(3, "tatu")]);
    const r = await runXSweep(sb as never);
    eq(
      "a refused post leaves the keyword's other posts stored",
      sb.tables["listening_mentions"]?.map((m) => m["url"]),
      [url(1), url(3)],
    );
    eq("and the sweep says how many were lost, and why", r.notes, [
      `Water: 1 of 3 X posts could not be stored (${CONSTRAINT}).`,
    ]);
  }

  delete process.env["TWITTERAPI_IO_KEY"];
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
