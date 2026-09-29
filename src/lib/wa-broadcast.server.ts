// Sending one group of WhatsApp broadcast messages without ever sending one
// twice. A message row for the broadcast is what stops the next press of
// "send" from messaging that person again, so the row is written before the
// message goes, not after:
//
//   1. insert a 'sending' row for everyone in the group; if that fails, send
//      nothing (the next press will pick them up);
//   2. send each message;
//   3. write each outcome over its row in one call. If that write fails, the
//      rows stay 'sending': shown as unconfirmed, and never resent on their own.
//
// Recording after sending, a failed write or a request that died part way
// through left people with no row, and the next press messaged them again.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { WaSendResult } from "@/lib/whatsapp.server";

type Sb = SupabaseClient<Database>;
type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];

export type BroadcastItem = {
  /** The message as it will be recorded, without a status. */
  row: Omit<MessageInsert, "status"> & { person_id: string };
  send: () => Promise<WaSendResult>;
};

export type GroupResult = {
  sent: number;
  failed: number;
  lastError: string | null;
  /** False when the rows could not be written first, so nothing was sent. */
  attempted: boolean;
};

export async function sendRecordedGroup(admin: Sb, items: BroadcastItem[]): Promise<GroupResult> {
  if (!items.length) return { sent: 0, failed: 0, lastError: null, attempted: true };

  const rows = items.map((it) => ({ ...it.row, status: "sending" }));
  const { data: claimed, error: claimError } = await admin
    .from("messages")
    .insert(rows)
    .select("id, person_id");
  if (claimError || !claimed || claimed.length !== rows.length) {
    return {
      sent: 0,
      failed: 0,
      lastError: "Could not record the next messages, so they were not sent. Press send again.",
      attempted: false,
    };
  }
  const idOf = new Map(claimed.map((r) => [r.person_id, r.id]));

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  const finals = await Promise.all(
    items.map(async (it, k) => {
      const r: WaSendResult = await it.send().catch((e: unknown) => ({
        ok: false as const,
        error: `Outcome unknown: ${(e as Error).message}`.slice(0, 500),
      }));
      if (r.ok) sent++;
      else {
        failed++;
        lastError = r.error;
      }
      return {
        ...rows[k]!,
        id: idOf.get(it.row.person_id)!,
        ...(r.ok
          ? { status: "accepted", external_id: r.id, sent_at: new Date().toISOString() }
          : { status: "failed", error: r.error }),
      };
    }),
  );

  const { error } = await admin.from("messages").upsert(finals);
  if (error) console.error(`Could not record WhatsApp broadcast outcomes: ${error.message}`);
  return { sent, failed, lastError, attempted: true };
}
