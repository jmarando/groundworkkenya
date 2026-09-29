// Checks for SMS sending: reading Africa's Talking's replies, batching, and
// the outbox run against a stand-in database and a stand-in Africa's
// Talking. No request leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/outbox.test.ts

import { interpretAtReply, parseCostKes, phoneKey, sendSmsBatch } from "@/lib/at.server";
import {
  DEFAULT_SMS_DAILY_CAP,
  outcomesFor,
  planSmsBatches,
  processOutbox,
  smsDailyCap,
} from "@/lib/outbox.server";

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

function ok(name: string, cond: boolean, detail = "") {
  eq(detail && !cond ? `${name} (${detail})` : name, cond, true);
}

// ---- stand-ins

type Row = { id: string; channel: string; phone: string | null; body: string };
type Call = { fn: string; args: Record<string, unknown> };

/** Just enough of the Supabase client for processOutbox: rpc() only. */
function fakeDb(
  claimed: Row[],
  tweak: { steal?: string[]; markFails?: boolean; recordFailsOnce?: boolean } = {},
) {
  const calls: Call[] = [];
  let recordFailures = tweak.recordFailsOnce ? 1 : 0;
  const db = {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "process_outbox") {
        const live = args["_live"] === true;
        return Promise.resolve({
          data: live
            ? { claim: "claim-1", staged: 0, blocked: 0, held: 0, unknown: 0, sending: claimed }
            : { claim: null, staged: claimed.length, blocked: 0, held: 0, unknown: 0, sending: [] },
          error: null,
        });
      }
      if (fn === "outbox_mark_submitting") {
        if (tweak.markFails) return Promise.resolve({ data: null, error: { message: "timeout" } });
        const ids = (args["_ids"] as string[]).filter((id) => !tweak.steal?.includes(id));
        return Promise.resolve({ data: ids, error: null });
      }
      if (fn === "outbox_record") {
        if (recordFailures > 0) {
          recordFailures--;
          return Promise.resolve({ data: null, error: { message: "connection reset" } });
        }
        return Promise.resolve({ data: (args["_results"] as unknown[]).length, error: null });
      }
      if (fn === "outbox_release") {
        return Promise.resolve({ data: (args["_ids"] as string[]).length, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
  };
  return db;
}

const recorded = (db: ReturnType<typeof fakeDb>) =>
  db.calls
    .filter((c) => c.fn === "outbox_record")
    .flatMap(
      (c) => c.args["_results"] as { id: string; ok: boolean; ref?: string; error?: string }[],
    );

type AtReply = (numbers: string[], message: string) => { status: number; body: string };

/** Africa's Talking, answering from `reply`. Anything else fails the test. */
function fakeAt(reply: AtReply) {
  const requests: { to: string[]; message: string; username: string }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) !== "https://api.africastalking.com/version1/messaging") {
      throw new Error(`unexpected request to ${String(url)}`);
    }
    const form = new URLSearchParams(String(init?.body ?? ""));
    const to = (form.get("to") ?? "").split(",");
    const message = form.get("message") ?? "";
    requests.push({ to, message, username: form.get("username") ?? "" });
    const r = reply(to, message);
    return new Response(r.body, { status: r.status });
  }) as typeof fetch;
  return requests;
}

const success = (numbers: string[]) => ({
  status: 201,
  body: JSON.stringify({
    SMSMessageData: {
      Message: `Sent to ${numbers.length}/${numbers.length}`,
      Recipients: numbers.map((n, i) => ({
        statusCode: 101,
        number: n,
        status: "Success",
        cost: "KES 0.8000",
        messageId: `ATXid_${i}`,
      })),
    },
  }),
});

function live(on: boolean) {
  if (on) {
    process.env["CHANNELS_LIVE"] = "true";
    // A live account: the "sandbox" account talks to a different server.
    process.env["AT_USERNAME"] = "groundwork";
    process.env["AT_API_KEY"] = "test-key-not-real";
  } else {
    delete process.env["CHANNELS_LIVE"];
  }
}

const sms = (n: number, body = "Rally at noon"): Row => ({
  id: `m${n}`,
  channel: "sms",
  phone: `+2547000000${String(n).padStart(2, "0")}`,
  body,
});

// ---- phone numbers and costs
eq(
  "numbers written three ways match",
  ["0712 345678", "+254712345678", "712345678", "254712345678"].map(phoneKey),
  Array(4).fill("254712345678"),
);
eq("no number, no key", [phoneKey(null), phoneKey("")], ["", ""]);
eq("cost in shillings", parseCostKes("KES 0.8000"), 0.8);
eq("cost in another currency is not recorded", parseCostKes("USD 0.0090"), null);

// ---- reading Africa's Talking's replies
{
  const r = interpretAtReply(
    201,
    JSON.stringify({
      SMSMessageData: {
        Message: "Sent to 1/2 Total Cost: KES 0.8000",
        Recipients: [
          {
            statusCode: 101,
            number: "+254711000001",
            status: "Success",
            cost: "KES 0.8000",
            messageId: "ATXid_a",
          },
          {
            statusCode: 403,
            number: "+25471100",
            status: "InvalidPhoneNumber",
            cost: "0",
            messageId: "None",
          },
        ],
      },
    }),
  );
  eq("answered: one sent, one refused with a reason", r, {
    kind: "answered",
    recipients: [
      {
        number: "+254711000001",
        ok: true,
        id: "ATXid_a",
        costKes: 0.8,
        error: "",
        accountWide: false,
      },
      {
        number: "+25471100",
        ok: false,
        id: null,
        costKes: null,
        error: "InvalidPhoneNumber: not a valid phone number",
        accountWide: false,
      },
    ],
  });
}
eq(
  "queued counts as accepted",
  interpretAtReply(
    201,
    JSON.stringify({
      SMSMessageData: {
        Recipients: [
          { statusCode: 102, number: "+254711000001", status: "Queued", messageId: "ATXid_q" },
        ],
      },
    }),
  ),
  {
    kind: "answered",
    recipients: [
      {
        number: "+254711000001",
        ok: true,
        id: "ATXid_q",
        costKes: null,
        error: "",
        accountWide: false,
      },
    ],
  },
);
eq(
  "bad credentials: refused, nothing sent",
  interpretAtReply(401, "The supplied authentication is invalid").kind,
  "refused",
);
eq("server error: outcome unknown", interpretAtReply(503, "Service Unavailable").kind, "unknown");
eq("unreadable 201: outcome unknown", interpretAtReply(201, "<html>").kind, "unknown");
eq(
  "empty recipient list: refused with Africa's Talking's reason",
  interpretAtReply(
    201,
    JSON.stringify({ SMSMessageData: { Message: "InvalidSenderId", Recipients: [] } }),
  ),
  { kind: "refused", error: "Africa's Talking sent nothing: InvalidSenderId" },
);

// ---- batching
{
  const rows = Array.from({ length: 450 }, (_, i) => ({
    ...sms(i),
    phone: `+254700${String(i).padStart(6, "0")}`,
  }));
  eq(
    "450 texts go in requests of 200, 200 and 50",
    planSmsBatches(rows).map((b) => b.items.length),
    [200, 200, 50],
  );
}
eq(
  "different wording goes in different requests",
  planSmsBatches([sms(1, "a"), sms(2, "b"), sms(3, "a")]).map((b) => [
    b.body,
    b.items.map((i) => i.id),
  ]),
  [
    ["a", ["m1", "m3"]],
    ["b", ["m2"]],
  ],
);
eq(
  "the same number twice is split across requests, so each report maps to one text",
  planSmsBatches([sms(1), { ...sms(1), id: "m1b" }, sms(2)]).map((b) => b.items.map((i) => i.id)),
  [["m1", "m2"], ["m1b"]],
);

// ---- turning a reply into outcomes
{
  const [batch] = planSmsBatches([sms(1), sms(2)]);
  const items = batch!.items;
  eq(
    "a number Africa's Talking did not report on is outcome unknown, not retried",
    outcomesFor(items, {
      kind: "answered",
      recipients: [
        {
          number: "+254700000001",
          ok: true,
          id: "ATXid_1",
          costKes: 0.8,
          error: "",
          accountWide: false,
        },
      ],
    }).map((o) => [o.id, o.ok, (o.error ?? "").split(":")[0]]),
    [
      ["m1", true, ""],
      ["m2", false, "Outcome unknown"],
    ],
  );
  eq(
    "a refusal fails every text in the request with the reason",
    outcomesFor(items, {
      kind: "refused",
      error: "Africa's Talking refused the request (401): bad key",
    }).map((o) => o.error),
    Array(2).fill("Africa's Talking refused the request (401): bad key"),
  );
}

// ---- the outbox run

async function main() {
  // Dry run: nothing is claimed and Africa's Talking is never called.
  live(false);
  {
    const requests = fakeAt(success);
    const db = fakeDb([sms(1)]);
    const r = await processOutbox(db as never, 100);
    eq("dry run stages", [r.live, r.staged, r.sent], [false, 1, 0]);
    eq("dry run asks for no daily limit", db.calls[0]?.args, { _live: false, _limit: 100 });
    eq("dry run sends nothing", requests.length, 0);
  }

  live(true);

  // The daily limit comes from SMS_DAILY_CAP, with a safe default.
  process.env["SMS_DAILY_CAP"] = "500";
  eq("daily limit from the environment", smsDailyCap(), 500);
  process.env["SMS_DAILY_CAP"] = "lots";
  eq("an unreadable limit falls back to the default", smsDailyCap(), DEFAULT_SMS_DAILY_CAP);
  delete process.env["SMS_DAILY_CAP"];
  {
    fakeAt(success);
    const db = fakeDb([]);
    await processOutbox(db as never, 1000);
    eq("live runs pass the limit to the claim", db.calls[0]?.args, {
      _live: true,
      _limit: 1000,
      _daily_cap: DEFAULT_SMS_DAILY_CAP,
    });
  }

  // One request for three texts with the same wording; WhatsApp has no provider.
  {
    const requests = fakeAt((numbers) => {
      const r = JSON.parse(success(numbers).body);
      r.SMSMessageData.Recipients[2] = {
        statusCode: 406,
        number: numbers[2],
        status: "UserInBlacklist",
        messageId: "None",
      };
      return { status: 201, body: JSON.stringify(r) };
    });
    const db = fakeDb([
      sms(1),
      sms(2),
      sms(3),
      { id: "w1", channel: "wa", phone: "+254700000009", body: "hi" },
    ]);
    const r = await processOutbox(db as never, 1000);
    eq(
      "one request carries all three numbers",
      requests.map((q) => q.to),
      [["+254700000001", "+254700000002", "+254700000003"]],
    );
    eq("counts", [r.sent, r.failed, r.unknown, r.released], [2, 2, 0, 0]);
    eq(
      "each text recorded once with its outcome",
      recorded(db).map((x) => [x.id, x.ok, x.ref ?? x.error]),
      [
        [
          "w1",
          false,
          "WhatsApp broadcasts need an approved message template, which is not set up yet.",
        ],
        ["m1", true, "ATXid_0"],
        ["m2", true, "ATXid_1"],
        ["m3", false, "UserInBlacklist: this number has blocked promotional texts"],
      ],
    );
    eq(
      "marked submitting before the request, recorded after",
      db.calls.map((c) => c.fn),
      ["process_outbox", "outbox_record", "outbox_mark_submitting", "outbox_record"],
    );
  }

  // Only rows this worker still holds are sent.
  {
    const requests = fakeAt(success);
    const db = fakeDb([sms(1), sms(2)], { steal: ["m2"] });
    await processOutbox(db as never, 1000);
    eq("a row claimed away is not sent", requests[0]?.to, ["+254700000001"]);
  }

  // If the texts cannot be marked, none are sent and all go back to the queue.
  {
    const requests = fakeAt(success);
    const db = fakeDb([sms(1), sms(2)], { markFails: true });
    const r = await processOutbox(db as never, 1000);
    eq("unmarked texts are not sent", requests.length, 0);
    eq("and are released", r.released, 2);
  }

  // A refusal stops the run; later requests stay queued.
  {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      ...sms(i),
      phone: `+254700${String(i).padStart(6, "0")}`,
    }));
    const requests = fakeAt(() => ({
      status: 401,
      body: "The supplied authentication is invalid",
    }));
    const db = fakeDb(rows);
    const r = await processOutbox(db as never, 1000);
    eq("one request, then stop", requests.length, 1);
    eq("the refused batch fails, the rest go back", [r.failed, r.released], [200, 50]);
  }

  // No answer at all: outcome unknown, and the run stops.
  {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      ...sms(i),
      phone: `+254700${String(i).padStart(6, "0")}`,
    }));
    globalThis.fetch = (async () => {
      throw new Error("connection reset");
    }) as typeof fetch;
    const db = fakeDb(rows);
    const r = await processOutbox(db as never, 1000);
    eq("a lost request is outcome unknown", [r.unknown, r.sent, r.released], [200, 0, 50]);
    eq(
      "and says so on the message",
      recorded(db)[0]?.error?.startsWith(
        "Outcome unknown: Network error reaching Africa's Talking",
      ),
      true,
    );
  }

  // A bad number fails only its own text; running out of credit stops the run.
  {
    const bodies = ["a", "b", "c"];
    const requests = fakeAt((numbers) => ({
      status: 201,
      body: JSON.stringify({
        SMSMessageData: {
          Recipients: numbers.map((n) => ({
            statusCode: 403,
            number: n,
            status: "InvalidPhoneNumber",
            messageId: "None",
          })),
        },
      }),
    }));
    const db = fakeDb(bodies.map((b, i) => sms(i, b)));
    const r = await processOutbox(db as never, 1000);
    eq("bad numbers do not stop the run", [requests.length, r.failed, r.released], [3, 3, 0]);
  }
  {
    const requests = fakeAt((numbers) => ({
      status: 201,
      body: JSON.stringify({
        SMSMessageData: {
          Recipients: numbers.map((n) => ({
            statusCode: 405,
            number: n,
            status: "InsufficientBalance",
            messageId: "None",
          })),
        },
      }),
    }));
    const db = fakeDb([sms(1, "a"), sms(2, "b"), sms(3, "c")]);
    const r = await processOutbox(db as never, 1000);
    eq("no credit stops the run", [requests.length, r.failed, r.released], [1, 1, 2]);
    eq(
      "and says why",
      recorded(db)[0]?.error,
      "InsufficientBalance: the Africa's Talking account is out of credit",
    );
  }

  // Out of time: nothing more is started and the rest go back.
  {
    const requests = fakeAt(success);
    const db = fakeDb([sms(1), sms(2)]);
    const r = await processOutbox(db as never, 1000, { budgetMs: -1 });
    eq("out of time sends nothing", [requests.length, r.released], [0, 2]);
  }

  // Replies are worded one by one; a run makes at most a dozen requests.
  {
    const requests = fakeAt(success);
    const db = fakeDb(Array.from({ length: 15 }, (_, i) => sms(i, `Reply ${i}`)));
    const r = await processOutbox(db as never, 1000);
    eq("a dozen requests, the rest wait", [requests.length, r.sent, r.released], [12, 12, 3]);
    ok(
      "a run stays under forty outbound calls",
      db.calls.length + requests.length <= 40,
      String(db.calls.length + requests.length),
    );
  }

  // Recording the answer is retried once.
  {
    fakeAt(success);
    const db = fakeDb([sms(1)], { recordFailsOnce: true });
    const r = await processOutbox(db as never, 1000);
    eq(
      "results recorded on the second try",
      db.calls.filter((c) => c.fn === "outbox_record").length,
      2,
    );
    eq("and counted as sent", r.sent, 1);
  }

  // A text with no number is failed without reaching Africa's Talking.
  {
    const requests = fakeAt(success);
    const db = fakeDb([{ ...sms(1), phone: null }]);
    const r = await processOutbox(db as never, 1000);
    eq("no number, no request", [requests.length, r.failed], [0, 1]);
  }

  // The Africa's Talking sandbox account ("sandbox") has a server of its own.
  {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      urls.push(String(url));
      return new Response(success(["+254700000001"]).body, { status: 201 });
    }) as typeof fetch;
    process.env["AT_USERNAME"] = " Sandbox ";
    await sendSmsBatch(["+254700000001"], "Rally at noon");
    eq("the sandbox account uses the sandbox server", urls, [
      "https://api.sandbox.africastalking.com/version1/messaging",
    ]);
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
