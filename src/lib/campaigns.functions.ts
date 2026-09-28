// The campaigns on the platform. Only the super admin lists, adds and
// switches between them; the database enforces that.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  candidate: string | null;
  seat: string;
  level: string;
  host: string | null;
  members: number;
};

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignRow[]> => {
    const sb = context.supabase;
    const [{ data: campaigns }, { data: members }] = await Promise.all([
      sb.from("campaigns").select("id, slug, name, candidate, seat, level, host").order("created_at"),
      sb.from("campaign_members").select("campaign_id").neq("role", "pending"),
    ]);
    const count = new Map<string, number>();
    for (const m of members ?? []) count.set(m.campaign_id, (count.get(m.campaign_id) ?? 0) + 1);
    return (campaigns ?? []).map((c) => ({ ...c, members: count.get(c.id) ?? 0 }));
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      slug: string;
      name: string;
      candidate: string;
      seat: string;
      level: string;
      candidateEmail: string;
    }) => {
      const slug = input?.slug?.trim().toLowerCase() ?? "";
      if (!/^[a-z0-9-]{2,40}$/.test(slug))
        throw new Error("The address name can use lowercase letters, numbers and dashes.");
      if (!input.name?.trim()) throw new Error("Name the campaign.");
      if (!input.seat?.trim()) throw new Error("Which seat is it for?");
      return { ...input, slug };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: id, error } = await sb.rpc("create_campaign", {
      _slug: data.slug,
      _name: data.name,
      _candidate: data.candidate,
      _seat: data.seat,
      _level: data.level,
      _host: `${data.slug}.groundwork.ke`,
    });
    if (error) throw new Error(error.message || "Could not add the campaign.");
    if (data.candidateEmail?.includes("@")) {
      const { error: inv } = await sb.rpc("invite_member", {
        _campaign: id as string,
        _email: data.candidateEmail.trim().toLowerCase(),
        _role: "candidate",
      });
      if (inv) throw new Error(`Campaign added, but the invite failed: ${inv.message}`);
    }
    return { id: id as string };
  });

export const focusCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => {
    if (!input?.campaignId) throw new Error("Which campaign?");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("focus_campaign", { _campaign: data.campaignId });
    if (error) throw new Error(error.message || "Could not switch campaign.");
    return { ok: true };
  });
