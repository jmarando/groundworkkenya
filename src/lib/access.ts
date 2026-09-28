// What the signed-in person may do in the campaign they are working in.
// The database decides what data anyone gets; this only shapes the console.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type CampaignRole = "candidate" | "manager" | "organiser" | "agent" | "pending";
/** "super" is the platform owner, working in whichever campaign they have open. */
export type MyRole = CampaignRole | "super" | null;

export const PRINCIPAL_ROLES: MyRole[] = ["super", "candidate", "manager"];
export const TEAM_ROLES: MyRole[] = ["super", "candidate", "manager", "organiser", "agent"];

/**
 * The caller's role as the older role names server code still checks:
 * candidate and super admin read as "admin", so finance and admin checks
 * written as `admin || manager` keep meaning "candidate or campaign manager".
 */
export async function myRoles(
  sb: SupabaseClient<Database>,
): Promise<{ data: { role: string }[] }> {
  const { data } = await sb.rpc("my_campaign_role");
  const role = (data as MyRole) ?? null;
  const legacy =
    role === "super" || role === "candidate"
      ? "admin"
      : role === "manager" || role === "organiser" || role === "agent"
        ? role
        : null;
  return { data: legacy ? [{ role: legacy }] : [] };
}

/** The campaign a host like sakaja.groundwork.ke belongs to, or null for the main site. */
export function campaignSlugFromHost(host: string): string | null {
  const h = host.toLowerCase().split(":")[0] ?? "";
  const m = h.match(/^([a-z0-9-]+)\.groundwork\.ke$/);
  if (!m || m[1] === "www") return null;
  return m[1] ?? null;
}
