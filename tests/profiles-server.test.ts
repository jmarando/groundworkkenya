// Checks for looking up followers each hour: who is asked about, what is saved, that the day's
// budget and a refusal stop the work, and that a failed lookup is remembered. No network: the
// platform's answer is handed in. Invented accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/profiles-server.test.ts

import { runProfileLookups, saveAccounts } from "@/lib/profiles.server";
import type { ProfileRequest } from "@/lib/profiles";
import { ScrapeCreatorsCreditError } from "@/lib/scrapecreators.server";

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
let n = 0;
const mention = (handle: string, o: Record<string, unknown> = {}) => ({
  id: `m${++n}`,
  campaign_id: "c1",
  topic_id: "t1",
  source: "x",
  domain: null,
  url: `https://x.com/${handle}/status/${n}`,
  published_at: "2026-10-29T10:00:00Z",
  found_at: "2026-10-29T11:00:00Z",
  sentiment: null,
  sentiment_score: null,
  issue: null,
  status: "new",
  rival_id: null,
  author: `@${handle}`,
  reach: 1000,
  shares: null,
  comments_read: null,
  comments_positive: null,
  comments_negative: null,
  ...o,
});

function world(
  posts: Record<string, unknown>[],
  extra: Record<string, Record<string, unknown>[]> = {},
  cap = 20,
) {
  const used = { n: 0 };
  const sb = fakeSupabase(
    {
      listening_topics: [
        { id: "t1", campaign_id: "c1", label: "Githunguri", kind: "campaign", active: true },
      ],
      listening_mentions: posts,
      race_rivals: [],
      listening_accounts: [],
      ...extra,
    },
    {
      take_social_credits: (a) => {
        if (a["_budget"] !== "profiles") return false;
        if (used.n + Number(a["_n"]) > cap) return false;
        used.n += Number(a["_n"]);
        return true;
      },
    },
  );
  return { sb, used };
}

const asked: ProfileRequest[] = [];
const answer = (req: ProfileRequest): Promise<unknown> => {
  asked.push(req);
  return Promise.resolve({ followers_count: 12_000 });
};

async function main() {
  // ---- the ordinary hour
  {
    asked.length = 0;
    const { sb } = world([mention("big", { reach: 90_000 }), mention("mid", { reach: 4_000 })]);
    const r = await runProfileLookups(sb as never, { fetch: answer, now: NOW });
    eq(
      "both asked about, the bigger first",
      asked.map((a) => a.params["handle"]),
      ["big", "mid"],
    );
    eq("the run says what it did", [r.ran, r.looked, r.failed], [true, 2, 0]);
    const saved = sb.tables["listening_accounts"]!.map((a) => [
      a["voice_key"],
      a["followers"],
      a["platform"],
      a["name"],
    ]);
    eq("what was saved", saved, [
      ["x:@big", 12_000, "x", "@big"],
      ["x:@mid", 12_000, "x", "@mid"],
    ]);
    eq(
      "with a time and no failure",
      [
        typeof sb.tables["listening_accounts"]![0]!["checked_at"],
        sb.tables["listening_accounts"]![0]!["failed_at"],
      ],
      ["string", null],
    );
  }

  // ---- who is not asked about
  {
    asked.length = 0;
    const { sb } = world(
      [
        mention("fresh"),
        mention("stale"),
        mention("Rival_One", { reach: 99_000 }),
        mention("a_rival_post", { rival_id: "r1" }),
      ],
      {
        race_rivals: [
          {
            id: "r1",
            campaign_id: "c1",
            name: "Rival",
            is_us: false,
            x: "Rival_One",
            tiktok: null,
            facebook: null,
          },
        ],
        listening_accounts: [
          {
            voice_key: "x:@fresh",
            followers: 5,
            checked_at: new Date(NOW - 2 * 86_400_000).toISOString(),
            failed_at: null,
          },
          {
            voice_key: "x:@stale",
            followers: 5,
            checked_at: new Date(NOW - 9 * 86_400_000).toISOString(),
            failed_at: null,
          },
        ],
      },
    );
    await runProfileLookups(sb as never, { fetch: answer, now: NOW });
    eq(
      "a count under a week old and a candidate's own account are left alone",
      asked.map((a) => a.params["handle"]),
      ["stale"],
    );
  }
  {
    asked.length = 0;
    const { sb } = world([mention("elsewhere", { campaign_id: "c2" })]);
    await runProfileLookups(sb as never, { fetch: answer, now: NOW });
    eq("a campaign with no active keyword is not looked at", asked.length, 0);
  }

  // ---- the hour's cap
  {
    asked.length = 0;
    const { sb, used } = world(
      Array.from({ length: 10 }, (_, i) => mention(`acct${i}`, { reach: 9_000 - i })),
    );
    const r = await runProfileLookups(sb as never, { fetch: answer, now: NOW });
    eq("six an hour", [asked.length, r.looked, used.n], [6, 6, 6]);
  }

  // ---- the day's budget
  {
    asked.length = 0;
    const { sb } = world(
      Array.from({ length: 4 }, (_, i) => mention(`acct${i}`, { reach: 9_000 - i })),
      {},
      2,
    );
    const r = await runProfileLookups(sb as never, { fetch: answer, now: NOW });
    eq("it stops when the day's budget is used", [asked.length, r.looked], [2, 2]);
    eq(
      "and says so",
      r.notes.some((t) => /profile lookups/i.test(t)),
      true,
    );
  }

  // ---- a refusal, and an answer that holds no count
  {
    const { sb } = world([mention("a", { reach: 9_000 }), mention("b", { reach: 8_000 })]);
    const r = await runProfileLookups(sb as never, {
      fetch: () =>
        Promise.reject(new ScrapeCreatorsCreditError("ScrapeCreators is out of credits.")),
      now: NOW,
    });
    eq(
      "out of credits stops the run and says so",
      [r.looked, r.failed, r.notes],
      [0, 0, ["ScrapeCreators is out of credits."]],
    );
    eq("and marks no one as failed", sb.tables["listening_accounts"]!.length, 0);
  }
  {
    const { sb } = world([mention("odd", { reach: 9_000 })]);
    const r = await runProfileLookups(sb as never, {
      fetch: () => Promise.resolve({ nothing: true }),
      now: NOW,
    });
    eq("an answer with no count is a failure", [r.looked, r.failed], [0, 1]);
    const row = sb.tables["listening_accounts"]![0]!;
    eq(
      "remembered, so it is not asked again for a week",
      [row["voice_key"], row["followers"] ?? null, typeof row["failed_at"]],
      ["x:@odd", null, "string"],
    );
  }
  {
    const { sb } = world([mention("flaky", { reach: 9_000 })]);
    const r = await runProfileLookups(sb as never, {
      fetch: () => Promise.reject(new Error("timeout")),
      now: NOW,
    });
    eq(
      "another error is a failure with its reason",
      [r.failed, r.notes.some((t) => t.includes("timeout"))],
      [1, true],
    );
  }
  {
    const { sb } = world([mention("a", { reach: 9_000 })]);
    const key = process.env["SCRAPECREATORS_API_KEY"];
    delete process.env["SCRAPECREATORS_API_KEY"]; // never let a test reach the real service
    const r = await runProfileLookups(sb as never, { now: NOW });
    if (key !== undefined) process.env["SCRAPECREATORS_API_KEY"] = key;
    eq("with no key and no fetch it does nothing", [r.ran, r.looked], [false, 0]);
  }

  // ---- accounts seen for free
  {
    const { sb } = world([]);
    await saveAccounts(sb as never, [
      {
        voice_key: "x:@free",
        platform: "x",
        name: "@free",
        url: "https://x.com/free",
        followers: 31_000,
      },
      { voice_key: "x:@nocount", platform: "x", name: "@nocount", url: null, followers: null },
      {
        voice_key: "x:@free",
        platform: "x",
        name: "@free",
        url: "https://x.com/free",
        followers: 32_000,
      },
    ]);
    eq(
      "only accounts with a count, each once, the latest",
      sb.tables["listening_accounts"]!.map((a) => [a["voice_key"], a["followers"]]),
      [["x:@free", 32_000]],
    );
    await saveAccounts(sb as never, []);
    eq("nothing to save is fine", sb.tables["listening_accounts"]!.length, 1);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
