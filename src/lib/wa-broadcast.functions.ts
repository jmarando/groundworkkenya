// WhatsApp template broadcasts. The audience is rebuilt on the server from
// the same filters as SMS broadcasts, limited to people who agreed to
// WhatsApp and have not opted out. Sends go out in batches; each press sends
// up to BATCH people and the composer keeps pressing until none are left.
// A client key makes batches resumable and stops anyone getting it twice.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BroadcastAudience } from "@/lib/broadcast.functions";
import { fillTemplate, firstName, WA_TEMPLATES_ALL } from "@/lib/wa-templates";

const BATCH = 120;

type Sb = SupabaseClient<Database>;

type Person = {
  id: string;
  full_name: string | null;
  phone: string;
  ward_id: string | null;
  segment: string | null;
  support_score: number;
  campaign_id: string;
};

export function clean(a: Partial<BroadcastAudience> | undefined): BroadcastAudience {
  return {
    wardIds: [...new Set((a?.wardIds ?? []).map(String))].slice(0, 500),
    segments: [...new Set((a?.segments ?? []).map(String))].slice(0, 100),
    support: [...new Set(a?.support ?? [])].filter((b) => b === "strong" || b === "undecided"),
  };
}

export function matches(
  p: Pick<Person, "ward_id" | "segment" | "support_score">,
  a: BroadcastAudience,
): boolean {
  if (a.wardIds.length && !(p.ward_id && a.wardIds.includes(p.ward_id))) return false;
  if (a.segments.length && !(p.segment && a.segments.includes(p.segment))) return false;
  if (a.support.length) {
    const s = p.support_score ?? 0;
    const ok =
      (a.support.includes("strong") && s >= 70) ||
      (a.support.includes("undecided") && s >= 40 && s < 70);
    if (!ok) return false;
  }
  return true;
}

async function reachable(sb: Sb, a: BroadcastAudience): Promise<Person[]> {
  const out: Person[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("people")
      .select("id, full_name, phone, ward_id, segment, support_score, campaign_id")
      .eq("consent_whatsapp", true)
      .eq("opted_out", false)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error("Could not load the audience.");
    out.push(...((data ?? []) as Person[]).filter((p) => matches(p, a)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function assertCanSend(sb: Sb, userId: string) {
  const [{ data: sup }, { data: role }] = await Promise.all([
    sb.rpc("is_super_admin", { _user_id: userId }),
    sb.rpc("my_campaign_role"),
  ]);
  if (!sup && !["candidate", "manager"].includes(String(role))) {
    throw new Error("Only the candidate or campaign manager can send a WhatsApp broadcast.");
  }
}

async function campaignName(sb: Sb): Promise<string> {
  const { data: id } = await sb.rpc("my_campaign");
  const { data } = await sb
    .from("campaigns")
    .select("name, candidate")
    .eq("id", id ?? "")
    .maybeSingle();
  return (data?.candidate || data?.name || "Groundwork") as string;
}

export const estimateWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<BroadcastAudience>) => clean(input))
  .handler(async ({ data, context }) => {
    const people = await reachable(context.supabase, data);
    return { reachable: people.length, campaign: await campaignName(context.supabase) };
  });

export type WaBatchResult = {
  sent: number;
  failed: number;
  remaining: number;
  lastError: string | null;
};

export const sendWhatsAppBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      clientKey: string;
      template: string;
      fields: string[];
      imageUrl?: string | undefined;
      audience: Partial<BroadcastAudience>;
    }) => {
      const t = WA_TEMPLATES_ALL.find((x) => x.name === input?.template);
      if (!t) throw new Error("Pick a template.");
      const fields = (input.fields ?? []).map((f) =>
        String(f ?? "")
          .trim()
          .slice(0, 200),
      );
      if (fields.length !== t.fields.length || fields.some((f) => !f)) {
        throw new Error("Fill in every blank in the template.");
      }
      let imageUrl: string | undefined;
      if (t.image) {
        imageUrl = String(input?.imageUrl ?? "").trim();
        if (!/^https:\/\/\S{1,480}$/.test(imageUrl)) {
          throw new Error("Add a public picture link starting with https://");
        }
      }
      if (!/^[0-9a-f-]{36}$/i.test(String(input?.clientKey ?? ""))) {
        throw new Error("Open the composer again and resend.");
      }
      return { clientKey: input.clientKey, t, fields, imageUrl, audience: clean(input.audience) };
    },
  )
  .handler(async ({ data, context }): Promise<WaBatchResult> => {
    const sb = context.supabase;
    await assertCanSend(sb, context.userId);
    const { sendWhatsAppTemplate } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const key = `wab:${data.clientKey}`;
    const { data: campaignId } = await sb.rpc("my_campaign");
    if (!campaignId) throw new Error("Open a campaign first.");
    const [people, campaign, done] = await Promise.all([
      reachable(sb, data.audience),
      campaignName(sb),
      supabaseAdmin
        .from("messages")
        .select("person_id")
        .eq("campaign_id", String(campaignId))
        .eq("provider_ref", key),
    ]);
    if (done.error) throw new Error("Could not check what was already sent.");
    const seen = new Set((done.data ?? []).map((r) => r.person_id));
    const todo = people.filter((p) => !seen.has(p.id));
    const batch = todo.slice(0, BATCH);

    const { sendRecordedGroup } = await import("@/lib/wa-broadcast.server");
    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    let reached = 0;
    for (let i = 0; i < batch.length; i += 10) {
      const group = batch.slice(i, i + 10).map((p) => {
        const params = [firstName(p.full_name), campaign, ...data.fields];
        return {
          row: {
            campaign_id: p.campaign_id,
            person_id: p.id,
            phone: p.phone,
            channel: "whatsapp",
            platform: "whatsapp",
            kind: "dm",
            direction: "out",
            body: fillTemplate(data.t.text, params),
            outbox_kind: "broadcast",
            provider_ref: key,
          },
          send: () =>
            sendWhatsAppTemplate(p.phone, data.t.name, data.t.language, params, data.imageUrl),
        };
      });
      // Each message is on record before it goes, so a retry never sends it twice.
      const r = await sendRecordedGroup(supabaseAdmin, group);
      sent += r.sent;
      failed += r.failed;
      lastError = r.lastError ?? lastError;
      if (!r.attempted) break;
      reached += group.length;
    }
    return { sent, failed, remaining: todo.length - reached, lastError };
  });

/** The message sent to the sender's own phone first, to see it as voters will. Not recorded. */
export const sendWhatsAppTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      template: string;
      fields: string[];
      imageUrl?: string | undefined;
      phone: string;
    }) => {
      const t = WA_TEMPLATES_ALL.find((x) => x.name === input?.template);
      if (!t) throw new Error("Pick a template.");
      const fields = (input.fields ?? []).map((f) =>
        String(f ?? "")
          .trim()
          .slice(0, 200),
      );
      if (fields.length !== t.fields.length || fields.some((f) => !f))
        throw new Error("Fill in every blank in the template.");
      const imageUrl = t.image ? String(input?.imageUrl ?? "").trim() : undefined;
      if (t.image && !/^https:\/\/\S{1,480}$/.test(imageUrl ?? ""))
        throw new Error("Add the picture first.");
      const d = String(input?.phone ?? "").replace(/\D/g, "");
      const phone = /^0[17]\d{8}$/.test(d) ? `254${d.slice(1)}` : d;
      if (!/^\d{11,15}$/.test(phone))
        throw new Error("Enter your phone number, like 0712 345 678.");
      return { t, fields, imageUrl, phone };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCanSend(context.supabase, context.userId);
    const { sendWhatsAppTemplate } = await import("@/lib/whatsapp.server");
    const campaign = await campaignName(context.supabase);
    const r = await sendWhatsAppTemplate(
      data.phone,
      data.t.name,
      data.t.language,
      ["there", campaign, ...data.fields],
      data.imageUrl,
    );
    if (!r.ok) throw new Error(r.error);
    return { ok: true };
  });

/** A picture for a WhatsApp message, stored where WhatsApp can fetch it. */
export const uploadBroadcastImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { type: string; base64: string }) => {
    if (!/^image\/(jpeg|png)$/.test(String(input?.type ?? "")))
      throw new Error("Use a JPG or PNG picture.");
    const bytes = Uint8Array.from(Buffer.from(String(input?.base64 ?? ""), "base64"));
    if (bytes.length < 500) throw new Error("That picture is empty.");
    // WhatsApp takes images up to 5 MB.
    if (bytes.length > 5_000_000) throw new Error("WhatsApp takes pictures up to 5 MB.");
    return { type: input.type, bytes };
  })
  .handler(async ({ data, context }) => {
    await assertCanSend(context.supabase, context.userId);
    const { data: id } = await context.supabase.rpc("my_campaign");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${String(id)}/${crypto.randomUUID()}.${data.type === "image/png" ? "png" : "jpg"}`;
    const { error } = await supabaseAdmin.storage
      .from("broadcast-media")
      .upload(path, data.bytes, { contentType: data.type, upsert: false });
    if (error) throw new Error("The picture couldn't be stored.");
    return { url: supabaseAdmin.storage.from("broadcast-media").getPublicUrl(path).data.publicUrl };
  });
