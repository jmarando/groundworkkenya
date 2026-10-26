import { priceOf } from "@/lib/pricing";

export type Faq = { q: string; a: string };

// The questions asked on every first call. The home page, /faq and the FAQPage markup all read this
// one list, and every answer restates the site's own copy (the prices come from src/lib/pricing.ts).
export const FAQ: Faq[] = [
  {
    q: "Do our supporters need smartphones?",
    a: "No. Polls and sign-ups work by SMS reply and by USSD on any phone. The web link and WhatsApp are there for people who prefer them. Agents use the field app on a low-cost Android phone, and it keeps working without data.",
  },
  {
    q: "Can we message supporters on WhatsApp?",
    a: "Your team can run WhatsApp from their own phones and log conversations in the Groundwork inbox. Meta's WhatsApp Business Policy doesn't allow political campaigns on its automated Business Platform, so SMS and USSD carry the automated sends. We'll walk you through what works best for your seat.",
  },
  {
    q: "Does it work in Kiswahili?",
    a: "Yes. Polls go out in English and Kiswahili and count replies in either, USSD menus and campaign websites come in both, and the inbox reads the mood and issue of a message in English, Kiswahili or Sheng.",
  },
  {
    q: "What does social listening cover?",
    a: "News and the open web, TikTok, YouTube and Reddit by keyword, your rivals' own posts, Google Alerts and Google Trends, swept on a schedule. Each sweep says what it could not reach, so a gap never passes for silence.",
  },
  {
    q: "Where do the supporter records come from?",
    a: "From your own campaign: door knocks, rallies, polls, sign-ups, events and your existing lists. Every record carries its source and consent, and we don't sell or supply contact lists.",
  },
  {
    q: "Is the parallel tally an official result?",
    a: "No. Only the IEBC declares results. Groundwork records the forms your agents observe and shows you where you stand, how much of the register you've covered, and where the forms disagree.",
  },
  {
    q: "What does it cost?",
    a: `Priced by the ground you cover, per campaign workspace: ${priceOf("ward")} a month for an MCA (one ward, up to 60 agents), ${priceOf("constituency")} for an MP (up to 8 wards, 400 agents) and ${priceOf("county")} for a governor, senator or woman rep (every ward in the county, unlimited agents). For presidential and party workspaces, talk to us. Messaging, airtime and M-Pesa payouts are billed at cost, with nothing added on top.`,
  },
  {
    q: "How long does it take to get started?",
    a: "A workspace with your wards and your first team can be live within a week. The more time before polling day, the more doors you'll have on the map.",
  },
  {
    q: "Do you work with every party?",
    a: "Groundwork is a product, not a political consultancy. Each campaign gets its own workspace, and nothing is shared between them.",
  },
];

export const faq = (question: string): Faq => {
  const found = FAQ.find((f) => f.q === question);
  if (!found) throw new Error(`no FAQ entry: ${question}`);
  return found;
};
