// What Inbox's channel card reads: the provider settings on the server and the campaign's own
// channels and social accounts. The office only.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { channelStatuses, type ChannelStatus } from "@/lib/channel-status";
import { requireOffice } from "@/lib/require-role";

export type ChannelsData = {
  statuses: ChannelStatus[];
  accounts: {
    id: string;
    platform: string;
    handle: string;
    displayName: string | null;
    live: boolean;
    lastEventAt: string | null;
    /** Groundwork has set the Page token replies go out with. */
    canReply: boolean;
  }[];
};

export const getChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChannelsData> => {
    await requireOffice(context.supabase, "Channels are for the campaign office.");
    const sb = context.supabase;
    const { atConfigured } = await import("@/lib/at.server");
    const { channelsAreLive } = await import("@/lib/outbox.server");
    const { twilioConfigured } = await import("@/lib/twilio.server");
    const { data: campaignId } = await sb.rpc("my_campaign");
    const [{ data: own }, { data: accounts }] = await Promise.all([
      sb
        .from("campaign_channels")
        .select("kind, status, identifier")
        .eq("campaign_id", String(campaignId ?? "")),
      sb
        .from("social_accounts")
        .select("id, platform, handle, display_name, live, last_event_at")
        .order("platform"),
    ]);
    const provider = atConfigured() || twilioConfigured();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = (accounts ?? []).map((a) => a.id);
    const { data: keys } = ids.length
      ? await supabaseAdmin.from("social_account_tokens").select("account_id").in("account_id", ids)
      : { data: [] };
    const keyed = new Set((keys ?? []).map((k) => k.account_id));
    return {
      statuses: channelStatuses({
        smsLive: channelsAreLive(),
        smsProvider: provider,
        ussd: atConfigured(),
        own: Object.fromEntries(
          (own ?? []).map((r) => [r.kind, { status: r.status, identifier: r.identifier }]),
        ),
        accounts: Object.fromEntries(
          (accounts ?? []).map((a) => [a.platform, { live: a.live, handle: a.handle }]),
        ),
      }),
      accounts: (accounts ?? []).map((a) => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        displayName: a.display_name,
        live: a.live,
        lastEventAt: a.last_event_at,
        canReply: keyed.has(a.id),
      })),
    };
  });

/** Groundwork sets (or, with an empty token, removes) the Page token a campaign's replies use. */
export const setSocialToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string; token: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input?.accountId ?? "")) throw new Error("Which account?");
    const token = (input.token ?? "").trim();
    if (token && (token.length < 20 || token.length > 1000 || /\s/.test(token)))
      throw new Error("That doesn't look like a Page access token.");
    return { accountId: input.accountId, token };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_social_token", {
      _account: data.accountId,
      _token: data.token,
    });
    if (error)
      throw new Error(
        error.code === "42501" || error.code === "P0001"
          ? error.message
          : "Could not save the token.",
      );
    return { ok: true };
  });
