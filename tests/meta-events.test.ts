// Checks for reading Meta's webhook: each event names the account it came to, so it can be filed
// under the campaign that owns that account.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/meta-events.test.ts

import { extractEvents } from "@/lib/meta-events";

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

const page = extractEvents({
  object: "page",
  entry: [
    {
      id: "PAGE-1",
      time: 1_760_000_000,
      messaging: [
        {
          sender: { id: "U1" },
          timestamp: 1_760_000_000_000,
          message: { mid: "m1", text: "Habari" },
        },
      ],
      changes: [
        {
          field: "feed",
          value: { message: "Great rally!", comment_id: "c1", from: { id: "U2", name: "Achieng" } },
        },
      ],
    },
  ],
});
eq(
  "a Page's message and comment carry the Page",
  page.map((e) => [e.platform, e.kind, e.accountId, e.threadId]),
  [
    ["facebook", "dm", "PAGE-1", "U1"],
    ["facebook", "comment", "PAGE-1", "c1"],
  ],
);

const ig = extractEvents({
  object: "instagram",
  entry: [{ id: "IG-9", messaging: [{ sender: { id: "U3" }, message: { text: "Hi" } }] }],
});
eq("Instagram names its account", [ig[0]?.platform, ig[0]?.accountId], ["instagram", "IG-9"]);

const wa = extractEvents({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { display_phone_number: "254182668723" },
            contacts: [{ profile: { name: "Kamau" } }],
            messages: [
              { from: "254712345678", id: "w1", timestamp: "1760000000", text: { body: "Ndio" } },
            ],
          },
        },
      ],
    },
  ],
});
eq(
  "WhatsApp names the number it came to, and the sender's",
  [wa[0]?.platform, wa[0]?.accountId, wa[0]?.phone, wa[0]?.authorName],
  ["whatsapp", "254182668723", "+254712345678", "Kamau"],
);
eq(
  "empty text is skipped",
  extractEvents({ object: "page", entry: [{ id: "P", messaging: [{ message: {} }] }] }),
  [],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
