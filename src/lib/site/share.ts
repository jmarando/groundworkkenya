// How a campaign passes its website on: the words that go with the link, and the WhatsApp link
// that carries them. Pure.

import type { SiteCampaign } from "@/lib/site/render";

/** The line sent with the site's address. */
export function shareWords(
  c: Pick<SiteCampaign, "name" | "candidate" | "seat">,
  url: string,
): string {
  return `${c.candidate ?? c.name} (${c.seat}): see what we will work on, and join the team. ${url}`;
}

/** A link that opens WhatsApp with the words ready to send, to a chat or group the person picks. */
export const whatsappShare = (words: string) => `https://wa.me/?text=${encodeURIComponent(words)}`;
