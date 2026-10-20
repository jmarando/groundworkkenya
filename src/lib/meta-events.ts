// What Meta's webhook says, as events: Messenger and Instagram messages, Page and Instagram
// comments and mentions, and WhatsApp Cloud API messages, each with the account it came to.
/* eslint-disable @typescript-eslint/no-explicit-any -- Meta's payloads are loosely typed JSON */

export type MetaPayload = {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: {
      sender?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string };
    }[];
    changes?: {
      field?: string;
      value?: Record<string, unknown>;
    }[];
  }[];
};

export type SocialEvent = {
  platform: "facebook" | "instagram" | "whatsapp";
  /** The Page, Instagram account or WhatsApp number the event came to: it names the campaign. */
  accountId: string | null;
  kind: "dm" | "comment" | "mention";
  threadId: string;
  externalId: string;
  authorHandle: string | null;
  authorName: string | null;
  phone: string | null;
  body: string;
  permalink: string | null;
  at: string;
};

const iso = (seconds?: number) => new Date(seconds ? seconds * 1000 : Date.now()).toISOString();

export function extractEvents(payload: MetaPayload): SocialEvent[] {
  const out: SocialEvent[] = [];
  const object = payload.object ?? "";
  const base: SocialEvent["platform"] =
    object === "instagram"
      ? "instagram"
      : object === "whatsapp_business_account"
        ? "whatsapp"
        : "facebook";

  for (const entry of payload.entry ?? []) {
    // Messenger / Instagram DMs
    for (const m of entry.messaging ?? []) {
      const text = m.message?.text;
      if (!text) continue;
      const sender = m.sender?.id ?? "unknown";
      out.push({
        platform: base === "whatsapp" ? "facebook" : base,
        accountId: entry.id ?? null,
        kind: "dm",
        threadId: sender,
        externalId: m.message?.mid ?? `${sender}-${m.timestamp ?? Date.now()}`,
        authorHandle: sender,
        authorName: null,
        phone: null,
        body: text,
        permalink: null,
        at: iso(m.timestamp ? Math.floor(m.timestamp / 1000) : undefined),
      });
    }

    for (const change of entry.changes ?? []) {
      const value = (change.value ?? {}) as Record<string, any>;

      // WhatsApp Cloud API
      for (const msg of (value["messages"] as any[]) ?? []) {
        const body = msg?.text?.body;
        if (!body) continue;
        const from = String(msg.from ?? "");
        const contact = ((value["contacts"] as any[]) ?? [])[0];
        out.push({
          platform: "whatsapp",
          accountId: String(value["metadata"]?.display_phone_number ?? "") || null,
          kind: "dm",
          threadId: from,
          externalId: String(msg.id ?? `${from}-${msg.timestamp ?? Date.now()}`),
          authorHandle: from,
          authorName: contact?.profile?.name ?? null,
          phone: from.startsWith("+") ? from : `+${from}`,
          body,
          permalink: null,
          at: iso(msg.timestamp ? Number(msg.timestamp) : undefined),
        });
      }

      // Page / Instagram comments and mentions
      const commentText = value["message"] ?? value["text"];
      if (typeof commentText === "string" && commentText.trim()) {
        const commentId = String(value["comment_id"] ?? value["id"] ?? `${entry.id}-${entry.time}`);
        out.push({
          platform: base === "whatsapp" ? "facebook" : base,
          accountId: entry.id ?? null,
          kind: change.field?.includes("mention") ? "mention" : "comment",
          threadId: commentId,
          externalId: commentId,
          authorHandle: (value["from"] as any)?.username ?? (value["from"] as any)?.id ?? null,
          authorName: (value["from"] as any)?.name ?? null,
          phone: null,
          body: commentText,
          permalink: (value["permalink_url"] as string) ?? null,
          at: iso(entry.time),
        });
      }
    }
  }
  return out;
}
