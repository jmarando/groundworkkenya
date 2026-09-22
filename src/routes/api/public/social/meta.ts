import { createFileRoute } from "@tanstack/react-router";
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
        if (mode === "subscribe" && token === verifyToken) {
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

        for (const e of events) {
          const threadId = `${e.platform}:${e.threadId}`;
          const { data: existing } = await supabaseAdmin
            .from("conversations")
            .select("id, person_id")
            .eq("platform", e.platform)
            .eq("external_thread_id", threadId)
            .maybeSingle();

          let conversationId = existing?.id ?? null;
          let personId = existing?.person_id ?? null;

          if (!conversationId) {
            if (e.phone) {
              const { data: person } = await supabaseAdmin
                .from("people")
                .select("id")
                .eq("phone", e.phone)
                .maybeSingle();
              if (person) {
                personId = person.id;
              } else {
                const { data: created } = await supabaseAdmin
                  .from("people")
                  .insert({ phone: e.phone, full_name: e.authorName ?? null, source: e.platform })
                  .select("id")
                  .maybeSingle();
                personId = created?.id ?? null;
              }
            }
            const { data: convo } = await supabaseAdmin
              .from("conversations")
              .insert({
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
            conversationId = convo?.id ?? null;
          } else {
            await supabaseAdmin
              .from("conversations")
              .update({ unread: true, last_message_at: e.at, snippet: e.body.slice(0, 280) })
              .eq("id", conversationId);
          }

          await supabaseAdmin.from("messages").insert({
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

          await supabaseAdmin
            .from("social_accounts")
            .update({ last_event_at: e.at })
            .eq("platform", e.platform);
        }

        return new Response("ok");
      },
    },
  },
});

type MetaPayload = {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: {
      sender?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string };
    }[];
    changes?: {
      field?: string;
      value?: Record<string, unknown>;
    }[];
  }[];
};

type SocialEvent = {
  platform: "facebook" | "instagram" | "whatsapp";
  kind: "dm" | "comment" | "mention";
  threadId: string;
  externalId: string;
  authorHandle: string | null;
  authorName: string | null;
  phone: string | null;
  body: string;
  permalink: string | null;
  at: string;
};

const iso = (seconds?: number) =>
  new Date((seconds ? seconds * 1000 : Date.now())).toISOString();

function extractEvents(payload: MetaPayload): SocialEvent[] {
  const out: SocialEvent[] = [];
  const object = payload.object ?? "";
  const base: SocialEvent["platform"] =
    object === "instagram" ? "instagram" : object === "whatsapp_business_account" ? "whatsapp" : "facebook";

  for (const entry of payload.entry ?? []) {
    // Messenger / Instagram DMs
    for (const m of entry.messaging ?? []) {
      const text = m.message?.text;
      if (!text) continue;
      const sender = m.sender?.id ?? "unknown";
      out.push({
        platform: base === "whatsapp" ? "facebook" : base,
        kind: "dm",
        threadId: sender,
        externalId: m.message?.mid ?? `${sender}-${m.timestamp ?? Date.now()}`,
        authorHandle: sender,
        authorName: null,
        phone: null,
        body: text,
        permalink: null,
        at: iso(m.timestamp ? Math.floor(m.timestamp / 1000) : undefined),
      });
    }

    for (const change of entry.changes ?? []) {
      const value = (change.value ?? {}) as Record<string, any>;

      // WhatsApp Cloud API
      for (const msg of (value["messages"] as any[]) ?? []) {
        const body = msg?.text?.body;
        if (!body) continue;
        const from = String(msg.from ?? "");
        const contact = ((value["contacts"] as any[]) ?? [])[0];
        out.push({
          platform: "whatsapp",
          kind: "dm",
          threadId: from,
          externalId: String(msg.id ?? `${from}-${msg.timestamp ?? Date.now()}`),
          authorHandle: from,
          authorName: contact?.profile?.name ?? null,
          phone: from.startsWith("+") ? from : `+${from}`,
          body,
          permalink: null,
          at: iso(msg.timestamp ? Number(msg.timestamp) : undefined),
        });
      }

      // Page / Instagram comments and mentions
      const commentText = value["message"] ?? value["text"];
      if (typeof commentText === "string" && commentText.trim()) {
        const commentId = String(value["comment_id"] ?? value["id"] ?? `${entry.id}-${entry.time}`);
        out.push({
          platform: base === "whatsapp" ? "facebook" : base,
          kind: change.field?.includes("mention") ? "mention" : "comment",
          threadId: commentId,
          externalId: commentId,
          authorHandle: (value["from"] as any)?.username ?? (value["from"] as any)?.id ?? null,
          authorName: (value["from"] as any)?.name ?? null,
          phone: null,
          body: commentText,
          permalink: (value["permalink_url"] as string) ?? null,
          at: iso(entry.time),
        });
      }
    }
  }
  return out;
}
