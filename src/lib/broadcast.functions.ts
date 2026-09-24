// Sending a broadcast from the console.
//
// The audience is rebuilt in the database from the same filters the screen
// shows — the browser's own list is only for looking at — and queue_broadcast
// records the send and queues it through the outbox in one transaction. Only
// admins and managers can send; that is enforced by row level security.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { smsParts } from "@/lib/sms";

export type SupportBand = "strong" | "undecided";

export type BroadcastAudience = {
  wardIds: string[];
  segments: string[];
  support: SupportBand[];
};

/** Six parts is already a long SMS; beyond it, people stop reading. */
export const MAX_PARTS = 6;

function cleanAudience(a: Partial<BroadcastAudience> | undefined): BroadcastAudience {
  return {
    wardIds: [...new Set((a?.wardIds ?? []).map(String))].slice(0, 500),
    segments: [...new Set((a?.segments ?? []).map(String))].slice(0, 100),
    support: [...new Set(a?.support ?? [])].filter((b): b is SupportBand =>
      ["strong", "undecided"].includes(b),
    ),
  };
}

export const estimateBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<BroadcastAudience>) => cleanAudience(input))
  .handler(async ({ data, context }) => {
    const { channelsAreLive } = await import("@/lib/outbox.server");
    const { data: est, error } = await context.supabase.rpc("broadcast_estimate", {
      _audience: data,
    });
    if (error) throw new Error("Could not count the audience.");
    const e = (est ?? {}) as { matched?: number; reachable?: number };
    return { matched: e.matched ?? 0, reachable: e.reachable ?? 0, live: channelsAreLive() };
  });

export type SendResult = {
  id: string;
  matched: number;
  queued: number;
  repeat: boolean;
  live: boolean;
};

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { clientKey: string; body: string; audience: Partial<BroadcastAudience> }) => {
      const body = String(input?.body ?? "").trim();
      if (!body) throw new Error("Write the message first.");
      if (!/\bstop\b/i.test(body)) {
        throw new Error('Say how to opt out, for example "STOP kujiondoa".');
      }
      if (smsParts(body).parts > MAX_PARTS) {
        throw new Error(`Keep it to ${MAX_PARTS} SMS parts or fewer.`);
      }
      if (!/^[0-9a-f-]{36}$/i.test(String(input?.clientKey ?? ""))) {
        throw new Error("Open the composer again and resend.");
      }
      return { clientKey: input.clientKey, body, audience: cleanAudience(input.audience) };
    },
  )
  .handler(async ({ data, context }): Promise<SendResult> => {
    const { channelsAreLive, settleIfDryRun } = await import("@/lib/outbox.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await context.supabase.rpc("queue_broadcast", {
      _client_key: data.clientKey,
      _audience: data.audience,
      _body: data.body,
    });
    if (error) {
      throw new Error(
        error.code === "P0001"
          ? error.message
          : error.message?.includes("row-level security")
            ? "Only an admin or manager can send a broadcast."
            : "Could not queue the broadcast.",
      );
    }

    // In dry run, settle now so the console shows what would have gone out.
    await settleIfDryRun(supabaseAdmin);

    const r = (result ?? {}) as Partial<Record<"id" | "matched" | "queued" | "repeat", unknown>>;
    return {
      id: String(r.id ?? ""),
      matched: Number(r.matched ?? 0),
      queued: Number(r.queued ?? 0),
      repeat: r.repeat === true,
      live: channelsAreLive(),
    };
  });
