// Checks for the individual poll recipients: Kenyan numbers and email addresses
// normalised and deduplicated, a bad entry refused rather than dropped, and the
// list's size. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/poll-recipients.test.ts

import { parsePollRecipients } from "@/lib/poll-recipients";

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
/** Whether calling `f` throws an error whose message holds `part`. */
function throws(f: () => unknown, part: string): boolean {
  try {
    f();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(part);
  }
}

eq(
  "Kenyan numbers are normalised and deduplicated",
  parsePollRecipients("0725252542\n+254 725 252542", "whatsapp"),
  ["+254725252542"],
);
eq(
  "email addresses are lower-cased and deduplicated, split on commas and semicolons",
  parsePollRecipients("Justin@example.com, JUSTIN@example.com; other@example.com", "email"),
  ["justin@example.com", "other@example.com"],
);
eq(
  "a bad address or number is refused, not silently dropped",
  [
    throws(() => parsePollRecipients("not-an-email", "email"), "Check this email"),
    throws(() => parsePollRecipients("123", "whatsapp"), "Check this phone"),
  ],
  [true, true],
);
eq(
  "an empty list and more than 20 recipients are refused",
  [
    throws(() => parsePollRecipients("", "email"), "at least one"),
    throws(
      () =>
        parsePollRecipients(
          Array.from({ length: 21 }, (_, i) => `person${i}@example.com`).join("\n"),
          "email",
        ),
      "up to 20",
    ),
  ],
  [true, true],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
