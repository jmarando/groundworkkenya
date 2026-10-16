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
export async function myRoles(sb: SupabaseClient<Database>): Promise<{ data: { role: string }[] }> {
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

/** Which pages each role opens. Anything not listed is open to the whole team. */
const PAGE_ROLES: Record<string, MyRole[]> = {
  "/finance": ["super", "candidate", "manager"],
  "/team": ["super", "candidate", "manager"],
  "/campaigns": ["super"],
};
/** Field agents get field work only: the field app, where their walk lists are, and Foundations. */
const AGENT_PAGES = ["/field", "/foundations"];

export function canOpen(role: MyRole, path: string): boolean {
  const page = "/" + (path.split("/")[1] ?? "");
  const allowed = PAGE_ROLES[page];
  if (allowed) return allowed.includes(role);
  if (role === "agent") return AGENT_PAGES.includes(page);
  return TEAM_ROLES.includes(role);
}

/**
 * What the signed-in area does with a page: open it, send the person to their start page, or say
 * the page isn't theirs. An agent who lands on a page that isn't theirs (an old link or bookmark,
 * Voters before walk lists moved to the field app) is sent to the field app; anyone else is told.
 */
export function pageVerdict(role: MyRole, path: string): "open" | "send-home" | "denied" {
  const page = "/" + (path.split("/")[1] ?? "");
  if (page === "/home" && homeFor(role) !== "/home") return "send-home";
  if (canOpen(role, path)) return "open";
  return role === "agent" ? "send-home" : "denied";
}

/** The first page a role lands on after signing in. */
export function homeFor(role: MyRole): string {
  return role === "agent" ? "/field" : "/home";
}

const PICK_KEY = "gw-campaign";
/** Campaign chosen for this browser: from the address, else ?campaign= on the sign-in page. */
export function currentCampaignSlug(): string | null {
  if (typeof window === "undefined") return null;
  const fromHost = campaignSlugFromHost(window.location.host);
  if (fromHost) return fromHost;
  const q = new URLSearchParams(window.location.search).get("campaign");
  if (q && /^[a-z0-9-]{2,40}$/.test(q)) window.localStorage.setItem(PICK_KEY, q);
  return window.localStorage.getItem(PICK_KEY);
}
