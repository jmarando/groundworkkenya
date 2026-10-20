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
      })),
    };
  });
