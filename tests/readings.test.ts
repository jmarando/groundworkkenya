// Checks for the history the sweeps keep: which rows are worth a reading, that a failing history
// never fails a sweep, and that the database's idea of "off-topic" is the code's.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/readings.test.ts

import { readFileSync } from "node:fs";

import { recordCounts, recordSweepDays, withCounts, type Counted } from "@/lib/readings.server";
import { OFF_TOPIC } from "@/lib/top-of-mind";

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

const C1 = "ca000000-0000-4000-8000-000000000002";
const C2 = "ca000000-0000-4000-8000-000000000003";
const row = (o: Partial<Counted> = {}): Counted => ({
  campaign_id: C1,
  url: "https://x.com/zq/status/1",
  reach: 100,
  shares: null,
  ...o,
});

// ---- withCounts
eq("a row with neither count is dropped", withCounts([row({ reach: null, shares: null })]), []);
eq("a row with only shares stays", withCounts([row({ reach: null, shares: 4 })]), [
  row({ reach: null, shares: 4 }),
]);
eq(
  "two rows for one post keep the highest of each",
  withCounts([row({ reach: 100, shares: 7 }), row({ reach: 150, shares: 3 })]),
  [row({ reach: 150, shares: 7 })],
);
eq(
  "one count and none merge to the one",
  withCounts([row({ reach: null, shares: 2 }), row({ reach: 80, shares: null })]),
  [row({ reach: 80, shares: 2 })],
);
eq(
  "the same url in two campaigns stays two",
  withCounts([row(), row({ campaign_id: C2 })]).map((r) => r.campaign_id),
  [C1, C2],
);
eq(
  "a negative or non-finite count is not a count",
  withCounts([
    row({ reach: -5, shares: Number.NaN }),
    row({ url: "https://x.com/zq/status/2", reach: Infinity }),
  ]),
  [],
);
eq("a fraction is rounded", withCounts([row({ reach: 99.6 })])[0]?.reach, 100);

// ---- recordCounts
type Call = { fn: string; len: number };
function fake(answer: (call: number, len: number) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  return {
    calls,
    sb: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        const rows = args["_rows"];
        const len = Array.isArray(rows) ? rows.length : 0;
        calls.push({ fn, len });
        return Promise.resolve(answer(calls.length, len));
      },
    },
  };
}
const many = (n: number) =>
  Array.from({ length: n }, (_, i) => row({ url: `https://x.com/zq/status/${i}` }));

async function main() {
  {
    const f = fake((_, len) => ({ data: len, error: null }));
    const saved = await recordCounts(f.sb, many(450));
    eq(
      "450 rows go in chunks of 200",
      f.calls.map((c) => c.len),
      [200, 200, 50],
    );
    eq(
      "every call is record_post_counts",
      [...new Set(f.calls.map((c) => c.fn))],
      ["record_post_counts"],
    );
    eq("the readings saved add up", saved, 450);
  }
  {
    const f = fake(() => ({ data: 0, error: null }));
    await recordCounts(f.sb, [row({ reach: null, shares: null })]);
    await recordCounts(f.sb, []);
    eq("no counted rows, no call", f.calls.length, 0);
  }
  {
    const f = fake((call, len) =>
      call === 2 ? { data: null, error: { message: "boom" } } : { data: len, error: null },
    );
    const saved = await recordCounts(f.sb, many(450));
    eq("a chunk that fails does not stop the rest", f.calls.length, 3);
    eq("and only the saved ones count", saved, 250);
  }
  {
    const sb = {
      rpc: () => {
        throw new Error("down");
      },
    };
    eq("a thrown error is swallowed", await recordCounts(sb as never, many(3)), 0);
    eq("a client with no rpc is swallowed", await recordCounts({} as never, many(3)), 0);
  }

  // ---- recordSweepDays
  {
    const f = fake(() => ({ data: 3, error: null }));
    eq("the campaigns swept are reported", await recordSweepDays(f.sb), { swept: 3 });
    eq(
      "through record_sweep_days",
      f.calls.map((c) => c.fn),
      ["record_sweep_days"],
    );
    eq(
      "an error comes back as text, not a throw",
      await recordSweepDays(fake(() => ({ data: null, error: { message: "boom" } })).sb),
      { error: "boom" },
    );
    eq(
      "a thrown error does too",
      await recordSweepDays({
        rpc: () => {
          throw new Error("down");
        },
      }),
      { error: "down" },
    );
    eq(
      "an answer that is not a number is zero swept",
      await recordSweepDays(fake(() => ({ data: null, error: null })).sb),
      { swept: 0 },
    );
  }

  // The day record leaves out posts read as off-topic; the database spells it the same way.
  const migration = readFileSync(
    "supabase/migrations/20261105090000_listening_history.sql",
    "utf8",
  );
  eq("the migration spells off-topic as the code does", migration.includes(`'${OFF_TOPIC}'`), true);

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
