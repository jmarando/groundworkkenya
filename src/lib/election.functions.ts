// Election day from the console: the ballot agents file against, and which
// agent's phone belongs to each station. The rules are in the database
// (set_ballot, assign_station_agent): staff only, and the ballot's order is
// locked once the first form is filed. This passes the team's requests on.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeKePhone } from "@/lib/phone";

export type BallotEntry = { id?: string; name: string; party: string | null; ours: boolean };

export const saveBallot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { candidates: BallotEntry[] }) => ({
    candidates: (Array.isArray(input?.candidates) ? input.candidates : [])
      .slice(0, 30)
      .map((c) => ({
        ...(c?.id ? { id: String(c.id) } : {}),
        name: String(c?.name ?? "")
          .trim()
          .slice(0, 60),
        party: c?.party ? String(c.party).trim().slice(0, 30) || null : null,
        ours: c?.ours === true,
      })),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_ballot", { _candidates: data.candidates });
    if (error) throw new Error(error.message);
    return { saved: data.candidates.length };
  });

export const assignAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stationId: string; name: string; phone: string }) => {
    const raw = String(input?.phone ?? "").trim();
    // An empty phone takes the agent off the station.
    const phone = raw ? normalizeKePhone(raw) : "";
    if (phone === null) throw new Error("Use a Kenyan mobile number like 0712 345 678.");
    return {
      stationId: String(input?.stationId ?? ""),
      name: String(input?.name ?? "")
        .trim()
        .slice(0, 80),
      phone,
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("assign_station_agent", {
      _station_id: data.stationId,
      _name: data.name,
      _phone: data.phone,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
