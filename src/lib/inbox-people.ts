// The Inbox by person: a person's conversations on every channel (their SMS, WhatsApp, Facebook
// thread…) read as one row and one thread, each message marked with its channel. A conversation
// with no person (a social comment from an account not yet on file) stays a row of its own. Pure.

export type InboxMessage = {
  id: string;
  direction: string;
  body: string;
  at: string;
  status: string;
  channel?: string;
  error?: string | null;
};

export type InboxConvo = {
  id: string;
  personId: string | null;
  name: string;
  phone: string | null;
  ward: string | null;
  platform: string;
  sentiment: string | null;
  issue: string | null;
  subject: string | null;
  snippet: string | null;
  status: string;
  tags: string[];
  unread: boolean;
  lastMessageAt: string;
  thread: InboxMessage[];
};

export type PersonRow = {
  key: string;
  personId: string | null;
  name: string;
  phone: string | null;
  ward: string | null;
  /** The person's conversations, newest first; the first is where a reply goes by default. */
  convos: InboxConvo[];
  platforms: string[];
  unread: boolean;
  /** Open, and the last word was theirs. */
  needsReply: boolean;
  lastAt: string;
  snippet: string | null;
  sentiment: string | null;
  issue: string | null;
  tags: string[];
  /** Every message on every channel, oldest first, each with its channel. */
  thread: (InboxMessage & { platform: string; convoId: string })[];
};

const time = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);

export function byPerson(convos: InboxConvo[]): PersonRow[] {
  const groups = new Map<string, InboxConvo[]>();
  for (const c of convos) {
    const key = c.personId ? `p:${c.personId}` : `c:${c.id}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => time(b.lastMessageAt) - time(a.lastMessageAt));
      const top = sorted[0]!;
      const seen = new Set<string>();
      const thread = sorted
        .flatMap((c) =>
          c.thread.map((m) => ({ ...m, platform: m.channel ?? c.platform, convoId: c.id })),
        )
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
        .sort((a, b) => time(a.at) - time(b.at));
      const last = thread[thread.length - 1];
      return {
        key,
        personId: top.personId,
        name: top.name,
        phone: sorted.find((c) => c.phone)?.phone ?? null,
        ward: sorted.find((c) => c.ward)?.ward ?? null,
        convos: sorted,
        platforms: [...new Set(sorted.map((c) => c.platform))],
        unread: sorted.some((c) => c.unread),
        needsReply:
          sorted.some((c) => c.status === "open") &&
          (last ? last.direction === "in" : sorted.some((c) => c.unread)),
        lastAt: sorted.map((c) => c.lastMessageAt).reduce((a, b) => (time(b) > time(a) ? b : a)),
        snippet: last?.body ?? top.snippet ?? top.subject,
        sentiment: sorted.find((c) => c.sentiment)?.sentiment ?? null,
        issue: sorted.find((c) => c.issue)?.issue ?? null,
        tags: [...new Set(sorted.flatMap((c) => c.tags))],
        thread,
      };
    })
    .sort((a, b) => time(b.lastAt) - time(a.lastAt));
}

/** A message's state, in words. */
export function statusWords(m: Pick<InboxMessage, "direction" | "status" | "error">): string {
  if (m.direction === "in") return "";
  switch (m.status) {
    case "queued":
    case "sending":
      return "Sending…";
    case "staged":
      return "Held: sending is switched off";
    case "sent":
    case "accepted":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
      return m.error ? `Not sent: ${m.error}` : "Not sent";
    default:
      return m.status;
  }
}

/** WhatsApp lets a free reply go only within 24 hours of the person's last message. */
export function whatsappWindowOpen(row: Pick<PersonRow, "thread">, now = Date.now()): boolean {
  const lastIn = [...row.thread]
    .reverse()
    .find((m) => m.direction === "in" && m.platform === "whatsapp");
  return Boolean(lastIn && now - time(lastIn.at) < 24 * 3600_000);
}
