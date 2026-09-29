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

function clean(a: Partial<BroadcastAudience> | undefined): BroadcastAudience {
  return {
    wardIds: [...new Set((a?.wardIds ?? []).map(String))].slice(0, 500),
    segments: [...new Set((a?.segments ?? []).map(String))].slice(0, 100),
    support: [...new Set(a?.support ?? [])].filter((b) => b === "strong" || b === "undecided"),
  };
}

function matches(p: Person, a: BroadcastAudience): boolean {
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
      imageUrl?: string;
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
    const [people, campaign, done] = await Promise.all([
      reachable(sb, data.audience),
      campaignName(sb),
      supabaseAdmin.from("messages").select("person_id").eq("provider_ref", key),
    ]);
    if (done.error) throw new Error("Could not check what was already sent.");
    const seen = new Set((done.data ?? []).map((r) => r.person_id));
    const todo = people.filter((p) => !seen.has(p.id));
    const batch = todo.slice(0, BATCH);

    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (let i = 0; i < batch.length; i += 10) {
      const group = batch.slice(i, i + 10);
      const rows = await Promise.all(
        group.map(async (p) => {
          const params = [firstName(p.full_name), campaign, ...data.fields];
          const r = await sendWhatsAppTemplate(
            p.phone,
            data.t.name,
            data.t.language,
            params,
            data.imageUrl,
          );
          if (r.ok) sent++;
          else {
            failed++;
            lastError = r.error;
          }
          return {
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
            ...(r.ok
              ? { status: "accepted", external_id: r.id, sent_at: new Date().toISOString() }
              : { status: "failed", error: r.error }),
          };
        }),
      );
      const { error } = await supabaseAdmin.from("messages").insert(rows);
      if (error) console.error(`Could not record WhatsApp broadcast: ${error.message}`);
    }
    return { sent, failed, remaining: todo.length - batch.length, lastError };
  });
