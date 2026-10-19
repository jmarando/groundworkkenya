// Checks for paid media, step 1: the checks a buy passes before it reaches the database,
// the totals by platform and the cost per thousand reached. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/media.test.ts

import { byPlatform, checkBuy, costPerThousand, platformInfo, type BuyRow } from "@/lib/media";

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
  platform: "meta",
  name: "  Bursary reminder, Komothai ",
  wardId: "",
  startsOn: "2026-10-20",
  endsOn: "2026-10-27",
  amountKes: "25000.4",
  paidForBy: "Paid for by the Friends of the candidate",
  externalId: "",
};
const why = (x: object) => {
  const r = checkBuy({ ...good, ...x });
  return r.ok ? "" : r.why;
};

eq("a good buy, trimmed and rounded", checkBuy(good), {
  ok: true,
  buy: {
    platform: "meta",
    name: "Bursary reminder, Komothai",
    wardId: null,
    startsOn: "2026-10-20",
    endsOn: "2026-10-27",
    amountKes: 25000,
    paidForBy: "Paid for by the Friends of the candidate",
    externalId: null,
  },
});
eq(
  "TikTok takes no political ads",
  why({ platform: "tiktok" }),
  "TikTok doesn't take paid political ads.",
);
eq("an unknown platform", why({ platform: "myspace" }), "Choose where the ad runs.");
eq("no name", why({ name: " " }), "Give the buy a name of up to 120 letters.");
eq("ends before it starts", why({ endsOn: "2026-10-19" }), "It can't end before it starts.");
eq("a bad date", why({ startsOn: "20/10/2026" }), "Give the dates it runs.");
eq("no amount", why({ amountKes: 0 }), "Give the amount in shillings.");
eq("no disclosure", why({ paidForBy: "x" }), 'Give the "Paid for by" line the ad carries.');
eq("a ward that isn't an id", why({ wardId: "komothai" }), "That isn't one of your wards.");
eq("nothing at all", checkBuy(null).ok, false);

const row = (platform: string, amountKes: number, reach: number | null): BuyRow => ({
  id: platform + amountKes,
  platform,
  name: "x",
  wardName: null,
  startsOn: "2026-10-20",
  endsOn: "2026-10-21",
  amountKes,
  paidForBy: "Paid for by x",
  impressions: null,
  reach,
  clicks: null,
  resultsOn: null,
  expenseStatus: "pending",
});
eq(
  "totals by platform, biggest first",
  byPlatform([row("radio", 60000, null), row("meta", 25000, 12000), row("meta", 40000, 30000)]).map(
    (t) => [t.platform, t.buys, t.amountKes, t.reach],
  ),
  [
    ["meta", 2, 65000, 42000],
    ["radio", 1, 60000, 0],
  ],
);
eq("cost per thousand reached", costPerThousand(25000, 12500), 2000);
eq("none without results", costPerThousand(25000, null), null);
eq("an unknown platform reads as other", platformInfo("fax").key, "other");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
