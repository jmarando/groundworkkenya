// Checks for the Daraja Pulse link: the brief's checks, reading Pulse's report without trusting
// it, the totals, and which payouts go to Finance. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/pulse.test.ts

import { checkBrief, payoutsForFinance, readReport, reportTotals } from "@/lib/pulse";

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

const good = {
  campaign_name: " Githunguri 2027 ",
  objective: "Young voters know the bursary forms are open",
  brief: "Forms are at the NG-CDF office.",
  tone: "Warm",
  hashtags: "Githunguri2027, #Fresha",
  mandatory_mentions: "@office\n\n",
  dos: "Film at the market\nSay the dates",
  donts: "",
  start_date: "2026-10-27",
  end_date: "2026-11-30",
  budget_kes: "600000",
  paid_for_by: "Paid for by the Friends of the candidate",
};
const why = (x: object) => {
  const r = checkBrief({ ...good, ...x });
  return r.ok ? "" : r.why;
};
const b = checkBrief(good);
eq(
  "a good brief",
  b.ok && [
    b.brief.campaign_name,
    b.brief.hashtag,
    b.brief.hashtags_extra,
    b.brief.mandatory_mentions,
    b.brief.dos,
    b.brief.donts,
    b.brief.budget_kes,
  ],
  [
    "Githunguri 2027",
    "#Githunguri2027",
    ["#Fresha"],
    ["@office"],
    ["Film at the market", "Say the dates"],
    [],
    600000,
  ],
);
eq("no name", why({ campaign_name: "" }), "Give the brief a name.");
eq("no message", why({ brief: " " }), "Say what the creators should achieve, and the message.");
eq("backwards dates", why({ end_date: "2026-10-01" }), "It can't end before it starts.");
eq("no budget", why({ budget_kes: "" }), "Give the budget in shillings.");
eq("no disclosure", why({ paid_for_by: "" }), 'Give the "Paid for by" line every post carries.');

const report = readReport({
  pulse_campaign_id: "pc1",
  status: "live",
  creators: [
    {
      id: "c1",
      name: "Amina",
      handle: "@amina",
      platform: "tiktok",
      followers: 120000,
      fee_kes: 40000,
      status: "confirmed",
    },
    { id: "c2", name: "Brian", fee_kes: 25000 },
    { name: "no id" },
    "junk",
  ],
  posts: [
    { id: "p1", creator_id: "c1", url: "https://www.tiktok.com/@amina/video/1", views: 51000 },
    { id: "p2", creator_id: "c1", url: "javascript:alert(1)", views: 1000 },
    { id: "p3", creator_id: "c2", views: "lots" },
  ],
  payouts: [
    {
      id: "o1",
      creator_id: "c1",
      gross_kes: 40000,
      status: "paid",
      paid_at: "2026-10-10T09:00:00Z",
    },
    { id: "o2", creator_id: "c2", gross_kes: 25000, status: "pending" },
    { id: "o3", creator_id: "c2", gross_kes: -5, status: "paid" },
  ],
});
eq(
  "malformed creators are dropped",
  report?.creators.map((c) => c.id),
  ["c1", "c2"],
);
eq(
  "only https links survive",
  report?.posts.map((p) => p.url),
  ["https://www.tiktok.com/@amina/video/1", null, null],
);
eq("a non-number count is none", report?.posts[2]?.views, null);
eq(
  "a negative payout is dropped",
  report?.payouts.map((p) => p.id),
  ["o1", "o2"],
);
eq("totals", report && reportTotals(report), {
  creators: 2,
  posts: 1,
  views: 52000,
  fees: 65000,
  paid: 40000,
});
eq(
  "only paid payouts go to Finance, with the creator's name",
  report && payoutsForFinance(report),
  [{ id: "o1", creator: "Amina", gross_kes: 40000, paid_at: "2026-10-10T09:00:00Z" }],
);
eq("no campaign id, no report", readReport({ creators: [] }), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
