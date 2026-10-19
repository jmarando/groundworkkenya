// Daraja Pulse from Groundwork's side: send the brief, read what the creators did, and put their
// paid payouts on the ledger. The candidate and managers only; the campaign is the caller's own,
// so one campaign can never send or read another's brief.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkBrief, payoutsForFinance, readReport, type PulseReport } from "@/lib/pulse";

const MONEY_ROLES = ["super", "candidate", "manager"];

type Sb = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

/** The caller's campaign, when they may run its creators; throws otherwise. */
async function moneyCampaign(sb: Sb) {
  const [{ data: role }, { data: id }] = await Promise.all([
    sb.rpc("my_campaign_role"),
    sb.rpc("my_campaign"),
  ]);
  if (!MONEY_ROLES.includes(String(role ?? "")) || !id)
    throw new Error("Only the candidate and managers can brief creators.");
  const { data } = (await sb
    .from("campaigns")
    .select("id, name, candidate, seat")
    .eq("id", String(id))
    .maybeSingle()) as {
    data: { id: string; name: string; candidate: string | null; seat: string } | null;
  };
  if (!data) throw new Error("No campaign.");
  return data;
}

export type PulseData =
  | { connected: false; why: string }
  | { connected: true; report: PulseReport | null; why: string | null };

export const getPulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PulseData> => {
    const campaign = await moneyCampaign(context.supabase as unknown as Sb);
    const { callPulse, pulseConfigured } = await import("@/lib/pulse.server");
    if (!pulseConfigured()) return { connected: false, why: "Daraja Pulse isn't connected yet." };
    const res = await callPulse("groundwork-report", { groundwork_campaign_id: campaign.id });
    if (res.status === 404) return { connected: true, report: null, why: null };
    if (res.status !== 200)
      return {
        connected: true,
        report: null,
        why: "Daraja Pulse didn't answer. Try again shortly.",
      };
    return { connected: true, report: readReport(res.json), why: null };
  });

export const sendPulseBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const c = checkBrief(input);
    if (!c.ok) throw new Error(c.why);
    return c.brief;
  })
  .handler(async ({ data, context }) => {
    const campaign = await moneyCampaign(context.supabase as unknown as Sb);
    const { callPulse } = await import("@/lib/pulse.server");
    const res = await callPulse("groundwork-brief", {
      ...data,
      groundwork_campaign_id: campaign.id,
      client_name: campaign.candidate ? `${campaign.candidate} · ${campaign.seat}` : campaign.name,
    });
    if (res.status === 0) throw new Error("why" in res ? res.why : "Couldn't reach Daraja Pulse.");
    if (res.status !== 200)
      throw new Error("Daraja Pulse didn't take the brief. Try again shortly.");
    const created = !!(res.json as { created?: boolean } | null)?.created;
    return { ok: true, created };
  });

/** Reads the report again and posts its paid payouts to Finance, each once. */
export const addPulsePayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Sb;
    const campaign = await moneyCampaign(sb);
    const { callPulse } = await import("@/lib/pulse.server");
    const res = await callPulse("groundwork-report", { groundwork_campaign_id: campaign.id });
    const report = res.status === 200 ? readReport(res.json) : null;
    if (!report) throw new Error("Couldn't read the payouts from Daraja Pulse.");
    const rows = payoutsForFinance(report);
    if (!rows.length) return { added: 0 };
    const { data, error } = await sb.rpc("record_creator_payouts", { _rows: rows });
    if (error) {
      console.error("Adding creator payouts failed", error.message);
      throw new Error("Couldn't add the payouts to Finance.");
    }
    return { added: Number(data ?? 0) };
  });
