// Checks that a WhatsApp broadcast group is on record before any message
// goes, so a retried press never messages anyone twice. Uses a stand-in
// database and stand-in sends; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/wa-broadcast.test.ts

import { sendRecordedGroup, type BroadcastItem } from "@/lib/wa-broadcast.server";

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

type Row = { person_id: string; status: string; id?: string; external_id?: string; error?: string };

function fakeDb({ insertFails = false, upsertFails = false } = {}) {
  const log: string[] = [];
  const upserts: Row[][] = [];
  const db = {
    log,
    upserts,
    from: () => ({
      insert: (rows: Row[]) => ({
        select: () => {
          log.push(`insert ${rows.map((r) => r.status).join(",")}`);
          return Promise.resolve(
            insertFails
              ? { data: null, error: { message: "connection reset" } }
              : {
                  data: rows.map((r, i) => ({ id: `m${i}`, person_id: r.person_id })),
                  error: null,
                },
          );
        },
      }),
      upsert: (rows: Row[]) => {
        log.push("upsert");
        upserts.push(rows);
        return Promise.resolve(upsertFails ? { error: { message: "timeout" } } : { error: null });
      },
    }),
  };
  return db;
}

function item(person: string, outcome: "ok" | "refused" | "throws", log: string[]): BroadcastItem {
  return {
    row: { person_id: person, body: `Hello ${person}`, provider_ref: "wab:key" },
    send: () => {
      log.push(`send ${person}`);
      if (outcome === "throws") return Promise.reject(new Error("socket hang up"));
      return Promise.resolve(
        outcome === "ok"
          ? { ok: true, id: `wamid.${person}` }
          : { ok: false, error: "WhatsApp refused it (400)" },
      );
    },
  };
}

async function main() {
  {
    const db = fakeDb();
    const r = await sendRecordedGroup(db as never, [
      item("p1", "ok", db.log),
      item("p2", "refused", db.log),
      item("p3", "throws", db.log),
    ]);
    eq(
      "everyone is on record as sending before anything is sent",
      db.log[0],
      "insert sending,sending,sending",
    );
    eq("then the three sends, then one write of the outcomes", db.log.slice(1), [
      "send p1",
      "send p2",
      "send p3",
      "upsert",
    ]);
    eq("one sent, two failed", [r.sent, r.failed, r.attempted], [1, 2, true]);
    eq(
      "each outcome lands on its own row",
      db.upserts[0]!.map((x) => [x.id, x.status, x.external_id ?? x.error?.slice(0, 16)]),
      [
        ["m0", "accepted", "wamid.p1"],
        ["m1", "failed", "WhatsApp refused"],
        ["m2", "failed", "Outcome unknown:"],
      ],
    );
  }
  {
    const db = fakeDb({ insertFails: true });
    const r = await sendRecordedGroup(db as never, [item("p1", "ok", db.log)]);
    eq(
      "no record, no send",
      db.log.filter((l) => l.startsWith("send")),
      [],
    );
    eq("and the caller is told to stop", [r.attempted, r.sent], [false, 0]);
  }
  {
    const db = fakeDb({ upsertFails: true });
    const r = await sendRecordedGroup(db as never, [item("p1", "ok", db.log)]);
    eq(
      "a lost outcome still counts what went, and never resends",
      [r.sent, r.attempted],
      [1, true],
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
