// What each seat pays, written once. The home page's seat cards, /pricing, the FAQ, the Offer markup
// and public/llms.txt all say these numbers (tests/seo.test.ts keeps llms.txt in step), so change them
// here. Amounts are Kenya shillings a month for one campaign workspace; null means the card says
// "Talk to us".

export type Tier = {
  id: "ward" | "constituency" | "county" | "national";
  seat: string;
  name: string;
  size: string;
  includes: string[];
  monthly: number | null;
  cta: string;
  highlight?: boolean;
};

export const TIERS: Tier[] = [
  {
    id: "ward",
    seat: "MCA",
    name: "Ward",
    size: "1 ward · up to 60 agents",
    includes: ["People, map & walk lists", "Inbox & SMS broadcast", "Field app & tally"],
    monthly: 50000,
    cta: "Talk to us",
  },
  {
    id: "constituency",
    seat: "MP",
    name: "Constituency",
    size: "Up to 8 wards · 400 agents",
    includes: ["Everything in Ward", "Polling & listening", "Finance & approvals"],
    monthly: 100000,
    cta: "Talk to us",
  },
  {
    id: "county",
    seat: "Governor · Senator · Woman Rep",
    name: "County",
    size: "Every ward in the county · unlimited agents",
    includes: ["Everything in Constituency", "War room & projection", "Paid media & creators"],
    monthly: 200000,
    cta: "Book a demo",
    highlight: true,
  },
  {
    id: "national",
    seat: "Presidential · parties",
    name: "National",
    size: "47 counties · coalition workspaces",
    includes: ["Everything in County", "Multi-county war room", "Dedicated support team"],
    monthly: null,
    cta: "Talk to us",
  },
];

/** 50000 becomes "KSh 50,000". Written by hand so the server and the browser print the same text. */
export const ksh = (amount: number) =>
  `KSh ${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** The monthly price of a priced tier, as text. */
export function priceOf(id: Tier["id"]): string {
  const monthly = TIERS.find((t) => t.id === id)?.monthly;
  if (monthly == null) throw new Error(`tier ${id} has no price`);
  return ksh(monthly);
}

/** The priced seats as schema.org Offers, for the pages that show these prices. */
export function priceOffers(url: string) {
  return TIERS.flatMap((t) =>
    t.monthly === null
      ? []
      : [
          {
            "@type": "Offer",
            name: `${t.name} workspace (${t.seat})`,
            description: t.size,
            url,
            price: t.monthly,
            priceCurrency: "KES",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: t.monthly,
              priceCurrency: "KES",
              unitCode: "MON",
              unitText: "month",
            },
          },
        ],
  );
}
