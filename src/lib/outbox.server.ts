// The outbox. Every outbound message is written to public.messages as
// 'queued' first; process_outbox() then re-checks consent at send time and
// decides what happens to it.
//
// Nothing is delivered unless CHANNELS_LIVE is "true" AND Africa's Talking
// credentials are set. Until then queued messages become 'staged': composed,
// addressed and visible in the console, never sent. Dry run is the default so
// a misconfigured deploy cannot text a constituency by accident.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

export type OutboxKind =
  "poll_invite" | "poll_thanks" | "reply" | "broadcast" | "reward" | "consent_check";

export type QueueItem = {
  personId: string;
  phone: string;
  channel: "sms" | "wa" | "airtime" | "mpesa";
  body: string;
  kind: OutboxKind;
  pollId?: string | null;
  conversationId?: string | null;
};

export function channelsAreLive(): boolean {
  return (
    process.env["CHANNELS_LIVE"] === "true" &&
    Boolean(process.env["AT_USERNAME"] && process.env["AT_API_KEY"])
  );
}

/** Write messages to the outbox as 'queued'. */
export async function queueMessages(sb: Sb, items: QueueItem[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map((i) => ({
    person_id: i.personId,
    poll_id: i.pollId ?? null,
    conversation_id: i.conversationId ?? null,
    phone: i.phone,
    channel: i.channel,
    direction: "out",
    body: i.body,
    status: "queued",
    outbox_kind: i.kind,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("messages").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`Could not queue messages: ${error.message}`);
  }
}

export type OutboxResult = {
  live: boolean;
  staged: number;
  blocked: number;
  sent: number;
  failed: number;
};

type Claimed = { id: string; channel: string; phone: string; body: string };

/**
 * Work through the queue. Needs the service-role client: process_outbox()
 * is not callable by console users.
 */
export async function processOutbox(admin: Sb, limit = 5000): Promise<OutboxResult> {
  const live = channelsAreLive();
  const { data, error } = await admin.rpc("process_outbox", { _live: live, _limit: limit });
  if (error) throw new Error(`Could not process the outbox: ${error.message}`);

  const r = (data ?? {}) as { staged?: number; blocked?: number; sending?: Claimed[] };
  const claimed = r.sending ?? [];

  for (const m of claimed) {
    // Delivery lands here once a provider is wired to the credentials. Until
    // then, fail loudly rather than let a claimed message vanish.
    await admin
      .from("messages")
      .update({ status: "failed", error: `No ${m.channel} provider is connected yet.` })
      .eq("id", m.id);
  }

  return {
    live,
    staged: r.staged ?? 0,
    blocked: r.blocked ?? 0,
    sent: 0,
    failed: claimed.length,
  };
}

/**
 * In dry run, process straight away so the console shows what would have
 * gone out — and what the consent check held back — without waiting on a
 * scheduler. Live, the scheduled drain does the sending.
 */
export async function settleIfDryRun(admin: Sb): Promise<void> {
  if (channelsAreLive()) return;
  await processOutbox(admin, 50000);
}
