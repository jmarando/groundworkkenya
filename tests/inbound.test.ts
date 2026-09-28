// Checks for what the public can trigger: who is paid a poll reward, and the
// per-visitor key for rate limits. Uses a stand-in database; nothing leaves
// this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/inbound.test.ts

import { recordResponse, type PersonRef } from "@/lib/inbound.server";
import type { EnginePoll } from "@/lib/polls.engine";
import { visitorKey } from "@/lib/rate-limit.server";

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

/**
 * Just enough of the Supabase query builder for recordResponse: every chain
 * resolves to what the table would answer, and inserts are kept for checking.
 */
function fakeDb({ firstAnswer, invited }: { firstAnswer: boolean; invited: boolean }) {
  const inserts: { table: string; rows: unknown }[] = [];
  const from = (table: string) => {
    const answer = () => {
      if (table === "poll_responses")
        return { data: firstAnswer ? [{ id: "r1" }] : [], error: null };
      if (table === "poll_invites") return { data: null, count: invited ? 1 : 0, error: null };
      return { data: null, error: null };
    };
    const q = {
      upsert: () => q,
      select: () => q,
      update: () => q,
      eq: () => q,
      insert: (rows: unknown) => {
        inserts.push({ table, rows });
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: unknown) => void) => resolve(answer()),
    };
    return q;
  };
  return { from, inserts };
}

const poll: EnginePoll = {
  id: "poll-1",
  code: "P1",
  question: "What matters most?",
  questionSw: null,
  kind: "single_choice",
  lang: "sw",
  options: [
    { key: "1", label: "Water" },
    { key: "2", label: "Roads" },
  ],
  weighting: false,
  rewardMethod: "airtime",
  rewardAmount: 20,
};

const person: PersonRef = {
  id: "person-1",
  phone: "+254712345678",
  wardId: null,
  segment: null,
  optedOut: false,
};

const rewardsQueued = (db: ReturnType<typeof fakeDb>) =>
  db.inserts
    .filter((i) => i.table === "messages")
    .flatMap((i) => i.rows as { outbox_kind: string }[])
    .filter((r) => r.outbox_kind === "reward").length;

async function main() {
  const answer = { optionKey: "1", freeText: null };

  // ---- poll rewards
  {
    const db = fakeDb({ firstAnswer: true, invited: false });
    const r = await recordResponse(db as never, poll, person, "web", answer);
    eq(
      "a number typed into the web form, not invited: recorded, not paid",
      [r.recorded, r.rewarded],
      [true, false],
    );
    eq("and nothing queued to pay", rewardsQueued(db), 0);
  }
  {
    const db = fakeDb({ firstAnswer: true, invited: true });
    const r = await recordResponse(db as never, poll, person, "web", answer);
    eq(
      "an invited number answering on the web is paid",
      [r.rewarded, rewardsQueued(db)],
      [true, 1],
    );
  }
  for (const channel of ["sms", "ussd", "wa"]) {
    const db = fakeDb({ firstAnswer: true, invited: false });
    const r = await recordResponse(db as never, poll, person, channel, answer);
    eq(`an answer by ${channel} is paid`, [r.rewarded, rewardsQueued(db)], [true, 1]);
  }
  {
    const db = fakeDb({ firstAnswer: false, invited: true });
    const r = await recordResponse(db as never, poll, person, "sms", answer);
    eq(
      "a second answer is never paid twice",
      [r.alreadyAnswered, r.rewarded, rewardsQueued(db)],
      [true, false, 0],
    );
  }
  {
    const db = fakeDb({ firstAnswer: false, invited: true });
    const r = await recordResponse(db as never, poll, person, "web", answer);
    eq(
      "the web form cannot overwrite an earlier answer",
      [r.recorded, r.alreadyAnswered],
      [false, true],
    );
  }

  // ---- visitor keys
  const req = (headers: Record<string, string>) =>
    new Request("https://groundwork.ke/p/P1", { headers });
  const k = visitorKey(req({ "cf-connecting-ip": "197.248.1.10" }));
  eq("the key is a hash, not the address", [k?.length, k?.includes("197")], [32, false]);
  eq(
    "the same connection gives the same key",
    visitorKey(req({ "cf-connecting-ip": "197.248.1.10" })),
    k,
  );
  eq(
    "no trusted header, no key (so no shared bucket)",
    visitorKey(req({ "x-forwarded-for": "197.248.1.10" })),
    null,
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
