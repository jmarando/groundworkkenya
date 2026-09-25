// The field app's two calls: fetch a ward's walk list, and record a visit.
// Both run under the agent's own JWT, so row level security applies.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanPlace, type Visit } from "@/lib/field";
import { normalizeKePhone } from "@/lib/phone";

export type WalkEntry = {
  id: string;
  name: string;
  phoneMasked: string;
  segment: string | null;
  support: number;
  lastContactedAt: string | null;
  lastOutcome: "spoke" | "not_home" | "refused" | null;
  lastVisitAt: string | null;
};

export const getWalkList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardId: string }) => {
    if (!input?.wardId) throw new Error("Pick a ward.");
    return input;
  })
  .handler(async ({ data, context }): Promise<WalkEntry[]> => {
    const { data: rows, error } = await context.supabase.rpc("walk_list", {
      _ward_id: data.wardId,
      _limit: 200,
    });
    if (error) throw new Error("Could not load the walk list.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.full_name ?? "No name on file",
      phoneMasked: r.phone_masked,
      segment: r.segment,
      support: r.support_score ?? 0,
      lastContactedAt: r.last_contacted_at,
      lastOutcome: (r.last_outcome as WalkEntry["lastOutcome"]) ?? null,
      lastVisitAt: r.last_visit_at,
    }));
  });

export type VisitResult = {
  repeat: boolean;
  personId: string | null;
  created: boolean;
  consentBlocked: boolean;
};

export const recordVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Visit) => {
    if (!input?.clientId) throw new Error("Each visit needs its own id.");
    if (!input.personId && !input.newPerson) throw new Error("Who was this visit to?");
    // Visits queued before phones sent a place have none; a malformed one is dropped.
    const place = cleanPlace(input.place);
    if (input.newPerson) {
      const phone = normalizeKePhone(input.newPerson.phone);
      if (!phone) throw new Error("Use a Kenyan mobile number like 0712 345 678.");
      return { ...input, place, newPerson: { ...input.newPerson, phone } };
    }
    return { ...input, place };
  })
  .handler(async ({ data, context }): Promise<VisitResult> => {
    const { data: result, error } = await context.supabase.rpc("record_door", {
      _client_id: data.clientId,
      _person_id: data.personId,
      _new: data.newPerson,
      _outcome: data.outcome,
      _support: data.support,
      _issue: data.issue ?? "",
      _consent: data.consent,
      _consent_source: data.consentSource,
      _visited_at: data.visitedAt,
      _place: data.place,
    });
    if (error) {
      throw new Error(
        error.code === "P0001" && error.message
          ? error.message
          : error.message?.includes("row-level security")
            ? "Only admitted team members can record visits."
            : "Could not record the visit.",
      );
    }
    const r = (result ?? {}) as Partial<{
      repeat: boolean;
      person_id: string;
      created: boolean;
      consent_blocked: boolean;
    }>;
    return {
      repeat: r.repeat === true,
      personId: r.person_id ?? null,
      created: r.created === true,
      consentBlocked: r.consent_blocked === true,
    };
  });
