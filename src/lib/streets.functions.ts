import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WalkEntry } from "@/lib/field.functions";

export type Street = {
  id: string;
  wardId: string;
  name: string;
  agentName: string | null;
  agentPhone: string | null;
  doors: number;
  done: number;
};

export type StreetDoor = WalkEntry & { doorNo: number | null };

export const listStreets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardId: string }) => {
    if (!input?.wardId) throw new Error("Pick a ward.");
    return input;
  })
  .handler(async ({ data, context }): Promise<Street[]> => {
    const sb = context.supabase;
    const { data: streets, error } = await sb
      .from("canvass_streets")
      .select("id, ward_id, name, agent_name, agent_phone, sort")
      .eq("ward_id", data.wardId)
      .order("sort")
      .order("name");
    if (error) throw new Error("Could not load the streets.");
    const ids = (streets ?? []).map((s) => s.id);
    const { data: people } = ids.length
      ? await sb.from("people").select("id, street_id, last_contacted_at").in("street_id", ids)
      : { data: [] };
    const week = Date.now() - 7 * 86_400_000;
    return (streets ?? []).map((s) => {
      const on = (people ?? []).filter((p) => p.street_id === s.id);
      return {
        id: s.id,
        wardId: s.ward_id,
        name: s.name,
        agentName: s.agent_name,
        agentPhone: s.agent_phone,
        doors: on.length,
        done: on.filter((p) => p.last_contacted_at && new Date(p.last_contacted_at).getTime() > week)
          .length,
      };
    });
  });

export const saveStreet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id?: string; wardId: string; name: string; agentName?: string; agentPhone?: string }) => {
      const name = input?.name?.trim();
      if (!input?.wardId || !name) throw new Error("Give the street a name.");
      return {
        ...input,
        name: name.slice(0, 120),
        agentName: input.agentName?.trim().slice(0, 120) || null,
        agentPhone: input.agentPhone?.trim().slice(0, 20) || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const row = {
      ward_id: data.wardId,
      name: data.name,
      agent_name: data.agentName,
      agent_phone: data.agentPhone,
    };
    const q = data.id
      ? context.supabase.from("canvass_streets").update(row).eq("id", data.id)
      : context.supabase.from("canvass_streets").insert(row);
    const { error } = await q;
    if (error) {
      if (error.code === "23505") throw new Error("That ward already has a street with this name.");
      throw new Error("Only organisers and managers can change streets.");
    }
    return { ok: true };
  });

export const getStreetWalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { streetId: string }) => {
    if (!input?.streetId) throw new Error("Pick a street.");
    return input;
  })
  .handler(async ({ data, context }): Promise<StreetDoor[]> => {
    const { data: rows, error } = await context.supabase.rpc("street_walk", {
      _street_id: data.streetId,
    });
    if (error) throw new Error("Could not load the street.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.full_name ?? "No name on file",
      phoneMasked: r.phone_masked,
      segment: r.segment,
      support: r.support_score ?? 0,
      lastContactedAt: r.last_contacted_at,
      lastOutcome: (r.last_outcome as WalkEntry["lastOutcome"]) ?? null,
      lastVisitAt: r.last_visit_at,
      doorNo: r.door_no,
    }));
  });
