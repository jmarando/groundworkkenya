import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * X (Twitter) Account Activity webhook.
 * GET  — CRC challenge/response check.
 * POST — signed activity delivery: mentions and DMs.
 */
export const Route = createFileRoute("/api/public/social/x")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["X_CONSUMER_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const token = new URL(request.url).searchParams.get("crc_token");
        if (!token) return new Response("Missing crc_token", { status: 400 });
        const response_token =
          "sha256=" + createHmac("sha256", secret).update(token).digest("base64");
        return Response.json({ response_token });
      },

      POST: async ({ request }) => {
        const secret = process.env["X_CONSUMER_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const header = request.headers.get("x-twitter-webhooks-signature") ?? "";
        const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("base64");
        const a = Buffer.from(header);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: XPayload;
        try {
          payload = JSON.parse(raw) as XPayload;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const users = new Map<string, { name?: string; screen_name?: string }>(
          Object.entries(payload.users ?? {}),
        );

        type Item = {
          kind: "mention" | "dm";
          threadId: string;
          externalId: string;
          handle: string | null;
          name: string | null;
          body: string;
          permalink: string | null;
          at: string;
        };
        const items: Item[] = [];

        for (const t of payload.tweet_create_events ?? []) {
          if (!t.text) continue;
          items.push({
            kind: "mention",
            threadId: String(t.user?.id_str ?? t.id_str ?? ""),
            externalId: String(t.id_str ?? ""),
            handle: t.user?.screen_name ? `@${t.user.screen_name}` : null,
            name: t.user?.name ?? null,
            body: t.text,
            permalink: t.user?.screen_name
              ? `https://x.com/${t.user.screen_name}/status/${t.id_str}`
              : null,
            at: new Date(Number(t.timestamp_ms ?? Date.now())).toISOString(),
          });
        }

        for (const e of payload.direct_message_events ?? []) {
          const text = e.message_create?.message_data?.text;
          if (!text) continue;
          const senderId = String(e.message_create?.sender_id ?? "");
          const u = users.get(senderId);
          items.push({
            kind: "dm",
            threadId: senderId,
            externalId: String(e.id ?? `${senderId}-${e.created_timestamp}`),
            handle: u?.screen_name ? `@${u.screen_name}` : senderId,
            name: u?.name ?? null,
            body: text,
            permalink: null,
            at: new Date(Number(e.created_timestamp ?? Date.now())).toISOString(),
          });
        }

        if (items.length === 0) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        for (const item of items) {
          const threadId = `x:${item.threadId}`;
          const { data: existing } = await supabaseAdmin
            .from("conversations")
            .select("id, person_id")
            .eq("platform", "x")
            .eq("external_thread_id", threadId)
            .maybeSingle();

          let conversationId = existing?.id ?? null;
          if (!conversationId) {
            const { data: convo } = await supabaseAdmin
              .from("conversations")
              .insert({
                channel: "x",
                platform: "x",
                external_thread_id: threadId,
                author_handle: item.handle,
                author_name: item.name,
                subject: item.kind === "dm" ? "Direct message" : "Mention",
                snippet: item.body.slice(0, 280),
                status: "open",
                unread: true,
                last_message_at: item.at,
              })
              .select("id")
              .maybeSingle();
            conversationId = convo?.id ?? null;
          } else {
            await supabaseAdmin
              .from("conversations")
              .update({ unread: true, last_message_at: item.at, snippet: item.body.slice(0, 280) })
              .eq("id", conversationId);
          }

          await supabaseAdmin.from("messages").insert({
            person_id: existing?.person_id ?? null,
            conversation_id: conversationId,
            channel: "x",
            platform: "x",
            kind: item.kind,
            direction: "in",
            body: item.body,
            status: "received",
            external_id: item.externalId,
            author_handle: item.handle,
            permalink: item.permalink,
            created_at: item.at,
            sent_at: item.at,
          });

          await supabaseAdmin
            .from("social_accounts")
            .update({ last_event_at: item.at })
            .eq("platform", "x");
        }

        return new Response("ok");
      },
    },
  },
});

type XPayload = {
  users?: Record<string, { name?: string; screen_name?: string }>;
  tweet_create_events?: {
    id_str?: string;
    text?: string;
    timestamp_ms?: string;
    user?: { id_str?: string; name?: string; screen_name?: string };
  }[];
  direct_message_events?: {
    id?: string;
    created_timestamp?: string;
    message_create?: { sender_id?: string; message_data?: { text?: string } };
  }[];
};
