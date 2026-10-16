// Checks for a visit at a walk list's door (src/lib/field.ts, src/lib/field.functions.ts): the
// reference a visit carries to its list and door, what the server accepts without a person, what it
// sends the database, and that the queue on the phone keeps the reference through a sync. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/field-lists.test.ts

import { cleanListRef, syncQueue, type Queued, type Visit } from "@/lib/field";
import { cleanVisit, visitArgs } from "@/lib/field.functions";

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

/** The message of whatever a call throws, or null if it doesn't. */
function thrown(call: () => unknown): string | null {
  try {
    call();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const UUID = "0b9a3f56-4a53-4f86-bb64-1f0a6a7d2a11";
const NOT_ON_A_LIST = "That door isn't on a list.";

const visit = (extra: Partial<Visit> = {}): Visit => ({
  clientId: "11111111-2222-4333-8444-555555555555",
  personId: null,
  newPerson: null,
  outcome: "not_home",
  support: null,
  issue: null,
  consent: { sms: false, whatsapp: false, call: false },
  consentSource: "",
  visitedAt: "2026-10-20T09:00:00Z",
  label: "Door 3",
  ...extra,
});

// The reference a visit carries to its list and door.
eq("no list reference is fine", cleanListRef({}), null);
eq("nulls are no reference either", cleanListRef({ walkListId: null, doorPc: null }), null);
eq("a list reference is kept", cleanListRef({ walkListId: UUID, doorPc: "6GCRQ2XQ+22" }), {
  walkListId: UUID,
  doorPc: "6GCRQ2XQ+22",
});
eq(
  "one without the other is refused",
  [
    thrown(() => cleanListRef({ walkListId: UUID })),
    thrown(() => cleanListRef({ doorPc: "6GCRQ2XQ+22" })),
  ],
  [NOT_ON_A_LIST, NOT_ON_A_LIST],
);
eq(
  "a bad plus code is refused",
  thrown(() => cleanListRef({ walkListId: UUID, doorPc: "no good" })),
  NOT_ON_A_LIST,
);
eq(
  "a plus code in small letters is no house of ours",
  thrown(() => cleanListRef({ walkListId: UUID, doorPc: "6gcrq2xq+22" })),
  NOT_ON_A_LIST,
);
eq(
  "so is a list that isn't an id, or either that isn't text",
  [
    thrown(() => cleanListRef({ walkListId: "L1", doorPc: "6GCRQ2XQ+22" })),
    thrown(() => cleanListRef({ walkListId: 7, doorPc: "6GCRQ2XQ+22" })),
    thrown(() => cleanListRef({ walkListId: UUID, doorPc: 22 })),
  ],
  [NOT_ON_A_LIST, NOT_ON_A_LIST, NOT_ON_A_LIST],
);

// The queue on the phone keeps the reference: the sender is given the visit as queued.
{
  const seen: Visit[] = [];
  const out = await syncQueue([visit({ walkListId: UUID, doorPc: "A+B2" })], async (v) => {
    seen.push(v);
  });
  eq("a queued list visit is sent and nothing is left", out.queue, []);
  eq(
    "and the sender saw its list and door",
    seen.map((v) => [v.walkListId, v.doorPc]),
    [[UUID, "A+B2"]],
  );
  const kept: Queued[] = [visit({ walkListId: UUID, doorPc: "A+B2" })];
  const waiting = await syncQueue(kept, async () => {
    throw new TypeError("Failed to fetch");
  });
  eq(
    "one that couldn't be sent keeps both through the wait",
    waiting.queue.map((v) => [v.walkListId, v.doorPc]),
    [[UUID, "A+B2"]],
  );
}

// What the server accepts.
eq(
  "a visit with no person and no list asks who it was to",
  thrown(() => cleanVisit(visit())),
  "Who was this visit to?",
);
eq(
  "at a list's door a person isn't needed: nobody home, a refusal, or no name given",
  (() => {
    const v = cleanVisit(visit({ walkListId: UUID, doorPc: "6GCRQ2XQ+22" }));
    return [v.personId, v.newPerson, v.walkListId, v.doorPc];
  })(),
  [null, null, UUID, "6GCRQ2XQ+22"],
);
eq(
  "half a reference is refused before anything else",
  thrown(() => cleanVisit(visit({ walkListId: UUID }))),
  NOT_ON_A_LIST,
);
eq(
  "each visit still needs its own id",
  thrown(() => cleanVisit(visit({ clientId: "" }))),
  "Each visit needs its own id.",
);
eq(
  "a new person at a list's door has their number made international",
  cleanVisit(
    visit({
      outcome: "spoke",
      walkListId: UUID,
      doorPc: "6GCRQ2XQ+22",
      newPerson: {
        phone: "0712 345 678",
        name: "Mercy",
        ward_id: null,
        segment: null,
        language: "sw",
      },
    }),
  ).newPerson?.phone,
  "+254712345678",
);
eq(
  "a visit with no list is as it was: its list and door are none",
  (() => {
    const v = cleanVisit(visit({ personId: "p1" }));
    return [v.walkListId, v.doorPc];
  })(),
  [null, null],
);
eq(
  "a place the phone sent is cleaned, a bad one dropped",
  [
    cleanVisit(
      visit({
        personId: "p1",
        place: { lat: -1.28, lng: 36.78, accuracy: 8.4, buildingId: "6GCRQ2XQ+22" },
      }),
    ).place,
    cleanVisit(visit({ personId: "p1", place: { lat: 99, lng: 0, accuracy: 1, buildingId: null } }))
      .place,
  ],
  [{ lat: -1.28, lng: 36.78, accuracy: 8, buildingId: "6GCRQ2XQ+22" }, null],
);

// What the database function is called with: its argument names are the contract.
eq(
  "record_door's arguments, with the list and door",
  visitArgs(cleanVisit(visit({ walkListId: UUID, doorPc: "6GCRQ2XQ+22", issue: "Water" }))),
  {
    _client_id: "11111111-2222-4333-8444-555555555555",
    _person_id: null,
    _new: null,
    _outcome: "not_home",
    _support: null,
    _issue: "Water",
    _consent: { sms: false, whatsapp: false, call: false },
    _consent_source: "",
    _visited_at: "2026-10-20T09:00:00Z",
    _place: null,
    _walk_list_id: UUID,
    _door_pc: "6GCRQ2XQ+22",
  },
);
eq(
  "and with none the two aren't sent at all, so an app ahead of its database still records plain visits",
  (() => {
    const a = visitArgs(cleanVisit(visit({ personId: "p1" }))) as Record<string, unknown>;
    return [
      Object.keys(a).includes("_walk_list_id"),
      Object.keys(a).includes("_door_pc"),
      a["_issue"],
      a["_person_id"],
    ];
  })(),
  [false, false, "", "p1"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
