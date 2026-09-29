// Incoming email (Postmark Inbound JSON). Replies to
// "<slug>+<conversationId>@in.groundwork.ke" thread back into that
// conversation; mail to "<slug>@in.groundwork.ke" opens a new one.
// Postmark doesn't sign posts, so the URL carries ?token=<EMAIL_INBOUND_TOKEN>.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Payload = z.object({
  MessageID: z.string().max(200).optional(),
  FromFull: z.object({ Email: z.string().email().max(320), Name: z.string().max(200).optional() }),
  ToFull: z.array(z.object({ Email: z.string().max(320) })).max(50).optional(),
  OriginalRecipient: z.string().max(320).optional(),
  Subject: z.string().max(500).optional(),
  TextBody: z.string().max(200_000).optional(),
  StrippedTextReply: z.string().max(200_000).optional(),
});

function stripQuoted(text: string) {
  const cut = text.search(/\n(On .+wrote:|-{2,} ?Original Message|From: .+\n)/i);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/\n>.*$/gm, "").trim();
}

export const Route = createFileRoute("/api/public/email/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches } = await import("@/lib/webhook-token.server");
        const expected = process.env["EMAIL_INBOUND_TOKEN"];
        if (!expected) return new Response("Not configured", { status: 503 });
        if (!tokenMatches(new URL(request.url).searchParams.get("token"), expected))
          return new Response("Unauthorized", { status: 401 });

        const parsed = Payload.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad payload", { status: 400 });
        const p = parsed.data;

        const { parseInboundAddress, INBOUND_DOMAIN } = await import("@/lib/email.server");
        const recipients = [p.OriginalRecipient, ...(p.ToFull ?? []).map((t) => t.Email)].filter(
          (a): a is string => !!a && a.toLowerCase().endsWith(`@${INBOUND_DOMAIN}`),
        );
        const target = recipients.map(parseInboundAddress).find(Boolean);
        if (!target) return new Response("ok"); // not for us; accept so it isn't retried

        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const { data: channel } = await sb
          .from("campaign_channels")
          .select("campaign_id")
          .eq("kind", "email")
          .ilike("identifier", target.slug)
          .maybeSingle();
        if (!channel) return new Response("ok");
        const campaignId = channel.campaign_id;

        // Dedupe Postmark retries.
        if (p.MessageID) {
          const { data: dup } = await sb
            .from("messages")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("external_id", p.MessageID)
            .maybeSingle();
          if (dup) return new Response("ok");
        }

        const from = p.FromFull.Email.toLowerCase();
        const body = (p.StrippedTextReply?.trim() || stripQuoted(p.TextBody ?? "")).slice(0, 8000) || "(empty email)";
        const subject = p.Subject?.slice(0, 200) ?? null;
        const now = new Date().toISOString();

        // Person by email, created if new.
        let { data: person } = await sb
          .from("people")
          .select("id")
          .eq("campaign_id", campaignId)
          .ilike("email", from)
          .maybeSingle();
        if (!person) {
          const { data: created, error } = await sb
            .from("people")
            .insert({
              campaign_id: campaignId,
              email: from,
              phone: `email:${from}`,
              full_name: p.FromFull.Name || null,
              source: "email",
              last_inbound_at: now,
            })
            .select("id")
            .single();
          if (error || !created) {
            console.error("inbound email: person insert failed", error?.code, error?.message);
            return new Response("error", { status: 500 });
          }
          person = created;
        }

        // Conversation: the addressed one if it belongs to this campaign, else the open email thread.
        let conversationId: string | null = null;
        if (target.conversationId) {
          const { data: c } = await sb
            .from("conversations")
            .select("id")
            .eq("id", target.conversationId)
            .eq("campaign_id", campaignId)
            .maybeSingle();
          conversationId = c?.id ?? null;
        }
        if (!conversationId) {
          const { data: c } = await sb
            .from("conversations")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("person_id", person.id)
            .eq("platform", "email")
            .eq("status", "open")
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          conversationId = c?.id ?? null;
        }
        if (!conversationId) {
          const { data: c, error } = await sb
            .from("conversations")
            .insert({
              campaign_id: campaignId,
              person_id: person.id,
              platform: "email",
              channel: "email",
              external_thread_id: `email:${from}`,
              author_handle: from,
              author_name: p.FromFull.Name || null,
              subject,
              status: "open",
              unread: true,
              snippet: body.slice(0, 200),
              last_message_at: now,
            })
            .select("id")
            .single();
          if (error || !c) {
            console.error("inbound email: conversation insert failed", error?.code, error?.message);
            return new Response("error", { status: 500 });
          }
          conversationId = c.id;
        } else {
          await sb
            .from("conversations")
            .update({ unread: true, snippet: body.slice(0, 200), last_message_at: now, status: "open" })
            .eq("id", conversationId);
        }

        const { error: mErr } = await sb.from("messages").insert({
          campaign_id: campaignId,
          person_id: person.id,
          conversation_id: conversationId,
          channel: "email",
          platform: "email",
          kind: "dm",
          direction: "in",
          body,
          status: "received",
          external_id: p.MessageID ?? null,
          author_handle: from,
        });
        if (mErr) {
          console.error("inbound email: message insert failed", mErr.code, mErr.message);
          return new Response("error", { status: 500 });
        }
        await sb.from("people").update({ last_inbound_at: now }).eq("id", person.id);
        return new Response("ok");
      },
    },
  },
});
