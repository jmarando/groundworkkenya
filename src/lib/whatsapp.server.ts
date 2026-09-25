// WhatsApp Business (+254 182 668723) through the Lovable connector gateway.
//
// Inbound: every webhook delivery is stored in whatsapp_webhook_events first,
// then processed. Rows left unprocessed (a failure, or a delivery status for
// a message whose id is not saved yet) are retried on later deliveries.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

export function whatsappConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["WHATSAPP_API_KEY"]);
}

export type WaSendResult = { ok: true; id: string } | { ok: false; error: string };

/** Send a free-form text. Works inside the 24h window after they last wrote. */
export async function sendWhatsAppText(phone: string, body: string): Promise<WaSendResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const waKey = process.env["WHATSAPP_API_KEY"];
  if (!lovableKey || !waKey) return { ok: false, error: "WhatsApp is not connected." };
  const to = phone.replace(/\D/g, "");
  const res = await fetch(`${GATEWAY_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": waKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: body.slice(0, 4096) },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`WhatsApp send failed [${res.status}]: ${text}`);
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: { message?: string; code?: number } };
      if (j.error?.code === 131047)
        msg = "More than 24 hours since they last wrote. WhatsApp only allows an approved template now.";
      else if (j.error?.message) msg = j.error.message;
    } catch {
      /* keep raw */
    }
    return { ok: false, error: `WhatsApp refused it (${res.status}): ${msg}`.slice(0, 500) };
  }
  const id = (JSON.parse(text) as { messages?: { id?: string }[] }).messages?.[0]?.id;
  return id ? { ok: true, id } : { ok: false, error: "WhatsApp gave no message id." };
}

/* ------------------------------------------------------------ inbound */

const RANK: Record<string, number> = { accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
const OPT_OUT = /^\s*(stop|acha|unsubscribe|toka)\s*$/i;
const OPT_IN = /^\s*(start|anza)\s*$/i;

type WaValue = {
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: {
    id: string;
    from: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    image?: { caption?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  }[];
  statuses?: {
    id: string;
    status: string;
    timestamp?: string;
    errors?: { code?: number; title?: string; message?: string }[];
  }[];
};

function valueOf(payload: unknown): WaValue {
  const p = payload as { entry?: { changes?: { value?: WaValue }[] }[] };
  return p?.entry?.[0]?.changes?.[0]?.value ?? {};
}

const iso = (s?: string) => new Date(s ? Number(s) * 1000 : Date.now()).toISOString();

/** Returns true when fully processed; false when something must wait. */
async function processPayload(sb: Sb, event: string, payload: unknown): Promise<boolean> {
  const v = valueOf(payload);
  let complete = true;

  if (event === "whatsapp.message") {
    for (const m of v.messages ?? []) {
      // Duplicate delivery of the same message: already on record.
      const { data: dup } = await sb
        .from("messages")
        .select("id")
        .eq("external_id", m.id)
        .maybeSingle();
      if (dup) continue;

      const body =
        m.text?.body ??
        m.button?.text ??
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        m.image?.caption ??
        `[${m.type ?? "message"}]`;
      const phone = `+${m.from.replace(/\D/g, "")}`;
      const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
      const at = iso(m.timestamp);

      let { data: person } = await sb
        .from("people")
        .select("id, opted_out")
        .eq("phone", phone)
        .maybeSingle();
      if (!person) {
        const { data: created, error } = await sb
          .from("people")
          .insert({ phone, full_name: name, source: "whatsapp", language: "sw" })
          .select("id, opted_out")
          .single();
        if (error) throw new Error(`Could not add person: ${error.message}`);
        person = created;
      }

      const threadId = `whatsapp:${m.from}`;
      const { data: existing } = await sb
        .from("conversations")
        .select("id")
        .eq("platform", "whatsapp")
        .eq("external_thread_id", threadId)
        .maybeSingle();
      let conversationId = existing?.id ?? null;
      if (conversationId) {
        const { error } = await sb
          .from("conversations")
          .update({ unread: true, status: "open", last_message_at: at, snippet: body.slice(0, 280) })
          .eq("id", conversationId);
        if (error) throw new Error(error.message);
      } else {
        const { data: convo, error } = await sb
          .from("conversations")
          .insert({
            person_id: person.id,
            channel: "whatsapp",
            platform: "whatsapp",
            external_thread_id: threadId,
            author_handle: phone,
            author_name: name,
            subject: "WhatsApp",
            snippet: body.slice(0, 280),
            status: "open",
            unread: true,
            last_message_at: at,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Could not open conversation: ${error.message}`);
        conversationId = convo.id;
      }

      const { error: msgErr } = await sb.from("messages").insert({
        person_id: person.id,
        conversation_id: conversationId,
        phone,
        channel: "whatsapp",
        platform: "whatsapp",
        kind: "dm",
        direction: "in",
        body,
        status: "received",
        external_id: m.id,
        created_at: at,
        sent_at: at,
      });
      if (msgErr && !msgErr.message.includes("duplicate")) throw new Error(msgErr.message);

      if (OPT_OUT.test(body) && !person.opted_out) {
        await sb.from("people").update({ opted_out: true }).eq("id", person.id);
        await sb
          .from("person_events")
          .insert({ person_id: person.id, kind: "opted_out", channel: "whatsapp", detail: "Replied STOP on WhatsApp" });
      } else if (OPT_IN.test(body) && person.opted_out) {
        await sb.from("people").update({ opted_out: false, consent_whatsapp: true }).eq("id", person.id);
        await sb
          .from("person_events")
          .insert({ person_id: person.id, kind: "consent_given", channel: "whatsapp", detail: "Replied START on WhatsApp" });
      }
      await sb
        .from("people")
        .update({ last_contacted_at: at })
        .eq("id", person.id);
    }
  }

  if (event === "whatsapp.status") {
    for (const s of v.statuses ?? []) {
      const { data: msg } = await sb
        .from("messages")
        .select("id, status, delivered_at, read_at, sent_at")
        .eq("external_id", s.id)
        .maybeSingle();
      if (!msg) {
        complete = false; // sender has not saved the id yet; retry later
        continue;
      }
      const at = iso(s.timestamp);
      const patch: Database["public"]["Tables"]["messages"]["Update"] = {};
      if (s.status === "sent" && !msg.sent_at) patch.sent_at = at;
      if (s.status === "delivered" && !msg.delivered_at) patch.delivered_at = at;
      if (s.status === "read") {
        if (!msg.read_at) patch.read_at = at;
        if (!msg.delivered_at) patch.delivered_at = at;
      }
      if ((RANK[s.status] ?? 0) > (RANK[msg.status] ?? 0)) patch.status = s.status;
      if (s.status === "failed") {
        const e = s.errors?.[0];
        patch.error = (e?.message ?? e?.title ?? "WhatsApp could not deliver it.").slice(0, 500);
      }
      if (Object.keys(patch).length) {
        const { error } = await sb.from("messages").update(patch).eq("id", msg.id);
        if (error) throw new Error(error.message);
      }
    }
  }

  return complete;
}

export async function processEventRow(
  sb: Sb,
  row: { id: string; event: string; payload: Json; attempts: number },
): Promise<boolean> {
  try {
    const done = await processPayload(sb, row.event, row.payload);
    // A status that never finds its message (sent outside Groundwork) stops
    // retrying after 20 attempts rather than blocking the queue forever.
    const give_up = !done && row.attempts + 1 >= 20;
    await sb
      .from("whatsapp_webhook_events")
      .update({
        attempts: row.attempts + 1,
        processed_at: done || give_up ? new Date().toISOString() : null,
        processing_error: done ? null : give_up ? "No matching message after 20 tries." : "Waiting for message id.",
      })
      .eq("id", row.id);
    return true;
  } catch (e) {
    await sb
      .from("whatsapp_webhook_events")
      .update({ attempts: row.attempts + 1, processing_error: String((e as Error).message).slice(0, 500) })
      .eq("id", row.id);
    return false;
  }
}

/** Retry older unfinished rows, fewest attempts first so none starve. */
export async function recoverPending(sb: Sb, exceptId?: string): Promise<void> {
  const { data } = await sb
    .from("whatsapp_webhook_events")
    .select("id, event, payload, attempts")
    .is("processed_at", null)
    .lt("received_at", new Date(Date.now() - 30_000).toISOString())
    .order("attempts", { ascending: true })
    .order("received_at", { ascending: true })
    .limit(10);
  for (const row of data ?? []) {
    if (row.id !== exceptId) await processEventRow(sb, row);
  }
}
