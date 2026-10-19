// Paid media, step 1: the platforms a campaign can book on, what each requires of a
// political ad in Kenya, and the checks a buy passes before it reaches the database
// (which checks again). Pure. The server side is src/lib/media.functions.ts.

export type Platform =
  "meta" | "google" | "youtube" | "tiktok" | "x" | "radio" | "tv" | "print" | "outdoor" | "other";

export type PlatformInfo = {
  key: Platform;
  /** The badge on the card. */
  code: string;
  /** The badge's colour class. */
  cls: string;
  name: string;
  /** What a political ad there needs, in one line. */
  rule: string;
  /** False where the platform doesn't take paid political ads at all. */
  bookable: boolean;
};

export const PLATFORMS: PlatformInfo[] = [
  {
    key: "meta",
    code: "M",
    cls: "ch--fb",
    name: "Meta · Facebook + Instagram",
    rule: 'The page must be authorised for ads about elections or politics, and every ad carries a "Paid for by" line.',
    bookable: true,
  },
  {
    key: "google",
    code: "G",
    cls: "ch--gg",
    name: "Google Search + Display",
    rule: "Check Google's election ads policy for Kenya before booking; the advertiser may need verifying.",
    bookable: true,
  },
  {
    key: "youtube",
    code: "YT",
    cls: "ch--yt",
    name: "YouTube",
    rule: "Bought through Google Ads, under the same rules. Cut long video to 15-second bumpers.",
    bookable: true,
  },
  {
    key: "tiktok",
    code: "TT",
    cls: "ch--tt",
    name: "TikTok",
    rule: "Doesn't take paid political ads. Check its branded content rules before paying any creator for political posts.",
    bookable: false,
  },
  {
    key: "x",
    code: "X",
    cls: "ch--x",
    name: "X",
    rule: "Political ads follow X's own country rules; check before booking.",
    bookable: true,
  },
  {
    key: "radio",
    code: "FM",
    cls: "ch--sms",
    name: "Radio",
    rule: "Ask the station for its rate card and the slot times in writing.",
    bookable: true,
  },
  {
    key: "tv",
    code: "TV",
    cls: "ch--sms",
    name: "TV",
    rule: "Ask the station for its rate card and the slot times in writing.",
    bookable: true,
  },
  {
    key: "print",
    code: "PR",
    cls: "ch--sms",
    name: "Print",
    rule: "Keep a copy of each insertion with its invoice.",
    bookable: true,
  },
  {
    key: "outdoor",
    code: "OD",
    cls: "ch--sms",
    name: "Billboards and outdoor",
    rule: "Keep the site list and photos of each board.",
    bookable: true,
  },
  {
    key: "other",
    code: "…",
    cls: "ch--sms",
    name: "Other",
    rule: "Keep the invoice and a copy of what ran.",
    bookable: true,
  },
];

export const platformInfo = (p: string): PlatformInfo =>
  PLATFORMS.find((x) => x.key === p) ?? PLATFORMS[PLATFORMS.length - 1]!;

export type BuyInput = {
  platform: string;
  name: string;
  wardId: string | null;
  startsOn: string;
  endsOn: string;
  amountKes: number;
  paidForBy: string;
  externalId: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A buy as the database takes it, or the sentence saying what's wrong. */
export function checkBuy(raw: unknown): { ok: true; buy: BuyInput } | { ok: false; why: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const platform = text(r["platform"]);
  const info = PLATFORMS.find((p) => p.key === platform);
  if (!info) return { ok: false, why: "Choose where the ad runs." };
  if (!info.bookable) return { ok: false, why: `${info.name} doesn't take paid political ads.` };
  const name = text(r["name"]);
  if (!name || name.length > 120)
    return { ok: false, why: "Give the buy a name of up to 120 letters." };
  const startsOn = text(r["startsOn"]);
  const endsOn = text(r["endsOn"]);
  if (!DATE.test(startsOn) || !DATE.test(endsOn))
    return { ok: false, why: "Give the dates it runs." };
  if (endsOn < startsOn) return { ok: false, why: "It can't end before it starts." };
  const amountKes = Number(r["amountKes"]);
  if (!Number.isFinite(amountKes) || amountKes <= 0 || amountKes > 1e10)
    return { ok: false, why: "Give the amount in shillings." };
  const paidForBy = text(r["paidForBy"]);
  if (paidForBy.length < 3 || paidForBy.length > 160)
    return { ok: false, why: 'Give the "Paid for by" line the ad carries.' };
  const ward = text(r["wardId"]);
  if (ward && !UUID.test(ward)) return { ok: false, why: "That isn't one of your wards." };
  const ext = text(r["externalId"]);
  return {
    ok: true,
    buy: {
      platform,
      name,
      wardId: ward || null,
      startsOn,
      endsOn,
      amountKes: Math.round(amountKes),
      paidForBy,
      externalId: ext ? ext.slice(0, 120) : null,
    },
  };
}

export type BuyRow = {
  id: string;
  platform: string;
  name: string;
  wardName: string | null;
  startsOn: string;
  endsOn: string;
  amountKes: number;
  paidForBy: string;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  resultsOn: string | null;
  expenseStatus: string | null;
};

/** Each platform's buys added up: spend, and what they delivered where it's known. */
export function byPlatform(rows: BuyRow[]) {
  const out = new Map<
    string,
    { platform: string; buys: number; amountKes: number; impressions: number; reach: number }
  >();
  for (const r of rows) {
    const t = out.get(r.platform) ?? {
      platform: r.platform,
      buys: 0,
      amountKes: 0,
      impressions: 0,
      reach: 0,
    };
    t.buys += 1;
    t.amountKes += r.amountKes;
    t.impressions += r.impressions ?? 0;
    t.reach += r.reach ?? 0;
    out.set(r.platform, t);
  }
  return [...out.values()].sort((a, b) => b.amountKes - a.amountKes);
}

/** Shillings per thousand people reached; null until results are in. */
export const costPerThousand = (amountKes: number, reach: number | null) =>
  reach && reach > 0 ? (amountKes / reach) * 1000 : null;
