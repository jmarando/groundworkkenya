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
  /** Meta can deliver messages here: the app secret and verify token are set on the server. */
  metaWebhook: boolean;
  /** The address to give Meta for its webhook. */
  metaWebhookUrl: string;
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
    const { publicBase } = await import("@/lib/twilio.server");
    return {
      metaWebhook: Boolean(process.env["META_APP_SECRET"] && process.env["META_VERIFY_TOKEN"]),
      metaWebhookUrl: `${publicBase()}/api/public/social/meta`,
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

type Graph = Record<string, unknown> & { error?: { message?: string; code?: number } };

/**
 * A Facebook Page (and the Instagram account linked to it) connected to the open campaign from its
 * Page access token: the Page's id and name are read from Meta, the accounts are kept with their
 * ids so messages to them land here, the token is kept for replies (service role only), and the
 * Page is subscribed to this app's message webhooks. Groundwork's super admin only.
 */
export const connectPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    const token = String(input?.token ?? "").trim();
    if (token.length < 20 || token.length > 1000 || /\s/.test(token))
      throw new Error("Paste the Page access token.");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: isSuper } = await sb.rpc("is_super_admin", { _user_id: context.userId });
    if (!isSuper) throw new Error("Groundwork connects a campaign's Page.");
    const { GRAPH } = await import("@/lib/meta-send");
    const get = async (path: string) => {
      const res = await fetch(
        `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(data.token)}`,
        {
          signal: AbortSignal.timeout(20_000),
        },
      );
      return (await res.json().catch(() => ({}))) as Graph;
    };
    const page = await get(
      "/me?fields=id,name,username,category,instagram_business_account{id,username,name}",
    );
    if (page.error)
      throw new Error(`Meta refused the token: ${page.error.message ?? "unknown error"}`);
    if (!page["category"] || typeof page["id"] !== "string")
      throw new Error("That is a person's token, not a Page's. Use the Page access token.");
    const pageId = page["id"] as string;
    const name = String(page["name"] ?? "Page");
    const handle = String(page["username"] ?? name).slice(0, 80);
    const ig = (page["instagram_business_account"] ?? null) as {
      id?: string;
      username?: string;
      name?: string;
    } | null;

    const { data: campaignId } = await sb.rpc("my_campaign");
    const keep = async (
      platform: "facebook" | "instagram",
      externalId: string,
      h: string,
      display: string,
    ) => {
      const { data: rows } = await sb
        .from("social_accounts")
        .select("id, external_id")
        .eq("campaign_id", String(campaignId))
        .eq("platform", platform);
      const same =
        (rows ?? []).find((r) => r.external_id === externalId) ??
        (rows ?? []).find((r) => !r.external_id);
      const patch = {
        handle: h,
        display_name: display,
        external_id: externalId,
        live: true,
        status: "live",
      };
      if (same) {
        const { error } = await sb.from("social_accounts").update(patch).eq("id", same.id);
        if (error) throw new Error("The account couldn't be saved.");
        return same.id;
      }
      const { data: row, error } = await sb
        .from("social_accounts")
        .insert({ ...patch, platform })
        .select("id")
        .single();
      if (error || !row) throw new Error("The account couldn't be saved.");
      return row.id;
    };
    const fbId = await keep("facebook", pageId, handle, name);
    const ids = [fbId];
    if (ig?.id) ids.push(await keep("instagram", ig.id, ig.username ?? handle, ig.name ?? name));
    for (const id of ids) {
      const { error } = await sb.rpc("set_social_token", { _account: id, _token: data.token });
      if (error) throw new Error("The token couldn't be kept.");
    }

    const sub = await fetch(
      `${GRAPH}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,feed&access_token=${encodeURIComponent(data.token)}`,
      { method: "POST", signal: AbortSignal.timeout(20_000) },
    )
      .then((r) => r.json() as Promise<Graph>)
      .catch(() => ({ error: { message: "Meta didn't answer." } }) as Graph);
    return {
      page: name,
      instagram: ig?.username ?? null,
      subscribed: !sub.error && sub["success"] === true,
      note: sub.error?.message ?? null,
    };
  });
