// Checks for the Inbox by person: one row and one thread across a person's channels.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/inbox-people.test.ts

import { byPerson, statusWords, whatsappWindowOpen, type InboxConvo } from "@/lib/inbox-people";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  }
}

const base = (o: Partial<InboxConvo>): InboxConvo => ({
  id: "c",
  personId: "p1",
  name: "Justin",
  phone: "+254725252542",
  ward: null,
  platform: "sms",
  sentiment: null,
  issue: null,
  subject: null,
  snippet: null,
  status: "open",
  tags: [],
  unread: false,
  lastMessageAt: "2026-10-20T10:00:00Z",
  thread: [],
  ...o,
});

const rows = byPerson([
  base({
    id: "sms",
    platform: "sms",
    lastMessageAt: "2026-10-07T10:00:00Z",
    thread: [
      {
        id: "m1",
        direction: "out",
        body: "Jibu START",
        at: "2026-10-07T10:00:00Z",
        status: "staged",
      },
    ],
  }),
  base({
    id: "wa",
    platform: "whatsapp",
    unread: true,
    lastMessageAt: "2026-10-20T18:30:00Z",
    thread: [
      {
        id: "m2",
        direction: "out",
        body: "Invitation",
        at: "2026-10-20T18:21:00Z",
        status: "read",
      },
      {
        id: "m3",
        direction: "in",
        body: "I'll come",
        at: "2026-10-20T18:30:00Z",
        status: "received",
      },
    ],
  }),
  base({
    id: "fb",
    personId: null,
    name: "Auma",
    platform: "facebook",
    lastMessageAt: "2026-09-22T10:00:00Z",
  }),
]);
eq(
  "one row per person, newest first",
  rows.map((r) => [r.name, r.platforms]),
  [
    ["Justin", ["whatsapp", "sms"]],
    ["Auma", ["facebook"]],
  ],
);
eq(
  "one thread across channels, oldest first",
  rows[0]!.thread.map((m) => [m.id, m.platform]),
  [
    ["m1", "sms"],
    ["m2", "whatsapp"],
    ["m3", "whatsapp"],
  ],
);
eq("replies go to the newest conversation by default", rows[0]!.convos[0]!.id, "wa");
eq("needs a reply when they spoke last", rows[0]!.needsReply, true);
eq("snippet is the last message", rows[0]!.snippet, "I'll come");
eq(
  "WhatsApp window open within 24h",
  whatsappWindowOpen(rows[0]!, Date.parse("2026-10-21T10:00:00Z")),
  true,
);
eq(
  "WhatsApp window shut after 24h",
  whatsappWindowOpen(rows[0]!, Date.parse("2026-10-22T10:00:00Z")),
  false,
);
eq(
  "status in words",
  [
    statusWords({ direction: "out", status: "staged" }),
    statusWords({ direction: "out", status: "failed", error: "Re-engagement message" }),
    statusWords({ direction: "in", status: "received" }),
  ],
  ["Held: sending is switched off", "Not sent: Re-engagement message", ""],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
