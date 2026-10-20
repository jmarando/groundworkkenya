import { createFileRoute } from "@tanstack/react-router";

import { extractEvents, type MetaPayload, type SocialEvent } from "@/lib/meta-events";
import { tokenMatches } from "@/lib/webhook-token.server";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Meta webhook for Facebook Page, Instagram and WhatsApp Business.
 * GET  — subscription verification handshake.
 * POST — signed event delivery: DMs, comments and mentions.
 */
export const Route = createFileRoute("/api/public/social/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const verifyToken = process.env["META_VERIFY_TOKEN"];
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        if (!verifyToken) return new Response("Not configured", { status: 503 });
        if (mode === "subscribe" && tokenMatches(token, verifyToken)) {
          return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const appSecret = process.env["META_APP_SECRET"];
        if (!appSecret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const header = request.headers.get("x-hub-signature-256") ?? "";
        const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
        const a = Buffer.from(header);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: MetaPayload;
        try {
          payload = JSON.parse(raw) as MetaPayload;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const events = extractEvents(payload);
        if (events.length === 0) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { channelCampaignId } = await import("@/lib/tenant.server");
        const sb = supabaseAdmin;

        // The campaign an event belongs to: the one whose account (Page, Instagram account or
        // WhatsApp number) it came to. Groundwork's own line takes anything no campaign claims.
        const owners = new Map<string, string>();
        const campaignFor = async (e: SocialEvent): Promise<string> => {
          const key = `${e.platform}:${e.accountId ?? ""}`;
          const known = owners.get(key);
          if (known) return known;
          let found: string | null = null;
          if (e.accountId && e.platform === "whatsapp") {
            const digits = e.accountId.replace(/\D/g, "");
            const { data } = await sb
              .from("campaign_channels")
              .select("campaign_id")
              .eq("kind", "whatsapp")
              .in("identifier", [`+${digits}`, digits]);
            found = data?.length === 1 ? data[0]!.campaign_id : null;
          } else if (e.accountId) {
            const { data } = await sb
              .from("social_accounts")
              .select("campaign_id")
              .eq("platform", e.platform)
              .eq("external_id", e.accountId);
            found = data?.length === 1 ? data[0]!.campaign_id : null;
          }
          const id = found ?? (await channelCampaignId(sb));
          owners.set(key, id);
          return id;
        };
        const logged = (what: string, error: { message: string } | null) => {
          if (error) console.error(`Meta webhook: could not ${what}: ${error.message}`);
        };

        for (const e of events) {
          const campaignId = await campaignFor(e);
          const threadId = `${e.platform}:${e.threadId}`;
          const { data: existing } = await sb
            .from("conversations")
            .select("id, person_id")
            .eq("campaign_id", campaignId)
            .eq("platform", e.platform)
            .eq("external_thread_id", threadId)
            .maybeSingle();

          let conversationId = existing?.id ?? null;
          let personId = existing?.person_id ?? null;

          if (!conversationId) {
            if (e.phone) {
              const { data: person } = await sb
                .from("people")
                .select("id")
                .eq("phone", e.phone)
                .eq("campaign_id", campaignId)
                .maybeSingle();
              if (person) {
                personId = person.id;
              } else {
                const { data: created, error } = await sb
                  .from("people")
                  .insert({
                    campaign_id: campaignId,
                    phone: e.phone,
                    full_name: e.authorName ?? null,
                    source: e.platform,
                  })
                  .select("id")
                  .maybeSingle();
                logged("add the person", error);
                personId = created?.id ?? null;
              }
            }
            const { data: convo, error } = await sb
              .from("conversations")
              .insert({
                campaign_id: campaignId,
                person_id: personId,
                channel: e.platform,
                platform: e.platform,
                external_thread_id: threadId,
                author_handle: e.authorHandle,
                author_name: e.authorName,
                subject: e.kind === "dm" ? "Direct message" : "Comment",
                snippet: e.body.slice(0, 280),
                status: "open",
                unread: true,
                last_message_at: e.at,
              })
              .select("id")
              .maybeSingle();
            logged("open the conversation", error);
            conversationId = convo?.id ?? null;
          } else {
            const { error } = await sb
              .from("conversations")
              .update({ unread: true, last_message_at: e.at, snippet: e.body.slice(0, 280) })
              .eq("id", conversationId);
            logged("update the conversation", error);
          }

          const { error: messageError } = await sb.from("messages").insert({
            campaign_id: campaignId,
            person_id: personId,
            conversation_id: conversationId,
            channel: e.platform,
            platform: e.platform,
            kind: e.kind,
            direction: "in",
            body: e.body,
            status: "received",
            external_id: e.externalId,
            author_handle: e.authorHandle,
            permalink: e.permalink,
            created_at: e.at,
            sent_at: e.at,
          });
          logged("save the message", messageError);

          const { error: seenError } = await sb
            .from("social_accounts")
            .update({ last_event_at: e.at })
            .eq("campaign_id", campaignId)
            .eq("platform", e.platform);
          logged("note the account's last message", seenError);
        }

        return new Response("ok");
      },
    },
  },
});

