// Checks for briefing a voice: the three lines Daraja Pulse's creators always work under, why a
// voice is worth a brief (only facts from its own public posts), and the invitation to edit. Plain
// code, no AI. Invented accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/outreach.test.ts

import type { BigVoice } from "@/lib/big-voices";
import { invitation, STANDING_LINES, whyThem } from "@/lib/outreach";

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
function ok(name: string, cond: boolean, shown = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${shown ? `\n  in ${shown}` : ""}`);
  }
}

const voice = (o: Partial<BigVoice> = {}): BigVoice => ({
  key: "tiktok:@mtaani_reels",
  platform: "tiktok",
  name: "@mtaani_reels",
  url: "https://www.tiktok.com/@mtaani_reels",
  kind: "account",
  followers: 38_000,
  posts: 12,
  seen: 41_000,
  topIssues: ["water", "roads"],
  read: 6,
  warm: 3,
  angry: 1,
  towardsWarm: 0.5,
  towardsAngry: 1 / 6,
  move: "recruit",
  angryPostId: null,
  postIds: [],
  last: "2026-10-29T10:00:00.000Z",
  ...o,
});
const campaign = { candidate: "Test Candidate", seat: "Testville" };

// ---- the standing lines
eq("three of them", STANDING_LINES.length, 3);
ok(
  "the first is the paid-partnership label with the Paid for by line",
  /paid partnership/i.test(STANDING_LINES[0]!) && STANDING_LINES[0]!.includes("Paid for by"),
  STANDING_LINES[0],
);
ok(
  "the second is no appeals by tribe or community",
  /tribe or community/.test(STANDING_LINES[1]!),
  STANDING_LINES[1],
);
ok(
  "the third is that the creator approves a draft",
  /approves a draft/.test(STANDING_LINES[2]!),
  STANDING_LINES[2],
);

// ---- why them
{
  const lines = whyThem(voice(), "seat", 30);
  ok(
    "the posts, the window and where they were found",
    lines.some((l) => l.includes("12 posts in the last 30 days") && l.includes("your race")),
    lines.join(" | "),
  );
  ok(
    "the views and the followers",
    lines.some((l) => l.includes("41,000") && l.includes("38k followers")),
    lines.join(" | "),
  );
  ok(
    "the warm and angry shares towards you, with the posts read",
    lines.some(
      (l) => l.includes("6 posts read") && l.includes("50% warm") && l.includes("17% angry"),
    ),
    lines.join(" | "),
  );
  ok(
    "the top issues",
    lines.some((l) => l.includes("water and roads")),
    lines.join(" | "),
  );
  ok(
    "the column says whether they are local",
    whyThem(voice(), "county", 7)[0]!.includes("county") &&
      whyThem(voice(), "country", 90)[0]!.includes("national"),
    "",
  );
  ok(
    "the window is the one asked for",
    whyThem(voice(), "seat", 7)[0]!.includes("last 7 days"),
    "",
  );
}
{
  const bare = whyThem(
    voice({
      followers: null,
      seen: null,
      read: 0,
      warm: 0,
      angry: 0,
      towardsWarm: null,
      towardsAngry: null,
      topIssues: [],
      posts: 1,
    }),
    "country",
    30,
  );
  ok(
    "a voice with no numbers says only what it has",
    bare.length >= 1 &&
      bare[0]!.includes("1 post in the last 30 days") &&
      !bare.join(" ").includes("followers") &&
      !bare.join(" ").includes("seen"),
    bare.join(" | "),
  );
  ok(
    "and says the mood is not read",
    bare.join(" ").includes("Mood not read yet"),
    bare.join(" | "),
  );
  ok("nothing broken", !/NaN|undefined|null|Infinity/.test(bare.join(" ")), bare.join(" | "));
}
{
  // Places, never people: nothing here may name or guess anyone's community.
  const all = [
    ...whyThem(voice(), "seat", 30),
    ...whyThem(voice({ topIssues: [] }), "county", 90),
    invitation(campaign, voice()),
    invitation({ candidate: null, seat: "Testville" }, voice({ topIssues: [] })),
  ].join(" ");
  ok(
    "no word about anyone's community, tribe or ethnicity",
    !/tribe|communit|ethnic|religio|clan/i.test(all),
    all,
  );
}

// ---- the invitation
{
  const text = invitation(campaign, {
    name: "@mtaani_reels",
    platform: "tiktok",
    topIssues: ["water", "roads"],
  });
  ok(
    "names the candidate and the seat",
    text.includes("Test Candidate") && text.includes("Testville"),
    text,
  );
  ok("names the first issue", text.includes("water") && !text.includes("roads"), text);
  ok(
    "says it is paid and clearly labelled, and that the rate comes through Daraja Pulse",
    /paid, clearly labelled posts/.test(text) && text.includes("Daraja Pulse"),
    text,
  );
  ok("says account for an account", text.includes("your account"), text);
  ok(
    "says page for a Facebook page",
    invitation(campaign, {
      name: "Mama Njeri Talks",
      platform: "facebook",
      topIssues: [],
    }).includes("your page"),
    "",
  );
  ok(
    "says channel for YouTube",
    invitation(campaign, { name: "Mama Njeri Talks", platform: "youtube", topIssues: [] }).includes(
      "your channel",
    ),
    "",
  );
  ok("under 2,000 characters", text.length < 2000, String(text.length));
}
{
  const none = invitation(campaign, { name: "@mtaani_reels", platform: "x", topIssues: [] });
  ok(
    "with no issue the sentence about it is left out",
    !/what you say about|undefined|null|\bnull\b| {2}/.test(none) &&
      none.includes("Test Candidate"),
    none,
  );
  ok("and still reads as a whole", /\.$/.test(none.trim()) && none.split(". ").length >= 3, none);
  const nobody = invitation(
    { candidate: null, seat: "Testville" },
    { name: "@a", platform: "x", topIssues: ["water"] },
  );
  ok(
    "with no candidate name it speaks of the campaign team in the seat",
    nobody.includes("the campaign team in Testville") && !/null|undefined/.test(nobody),
    nobody,
  );
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
