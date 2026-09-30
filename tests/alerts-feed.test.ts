// Checks for Google Alert feeds on keywords: which links are accepted, and
// reading a feed into stories. Pure; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/alerts-feed.test.ts

import { cleanAlertFeed } from "@/lib/alerts-feed";

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

function refuses(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

// ---------------------------------------------------------------- the link

const FEED = "https://www.google.com/alerts/feeds/01234567890123456789/12345678901234567890";
const HOW =
  "Paste the feed link from Google Alerts: it starts with https://www.google.com/alerts/feeds/.";
eq("a Google Alert feed", cleanAlertFeed(`  ${FEED} `), FEED);
eq("blank is none", cleanAlertFeed(" "), null);
refuses("plain http", () => cleanAlertFeed(FEED.replace("https", "http")), HOW);
refuses("another site", () => cleanAlertFeed("https://evil.test/alerts/feeds/1/2"), HOW);
refuses("extras after the link", () => cleanAlertFeed(`${FEED}?next=https://evil.test`), HOW);
refuses("Google's page, not the feed", () => cleanAlertFeed("https://www.google.com/alerts"), HOW);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
