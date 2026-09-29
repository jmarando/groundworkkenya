// Home's real signals, read as the signed-in person so row level security
// keeps every count inside their own campaign.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { topIssue, type HomeFacts, type RealSignals } from "@/lib/home";

type Sb = SupabaseClient<Database>;

export type HomeData = {
  /** The signed-in person's full name, for the greeting. */
  firstName: string | null;
  facts: HomeFacts;
  signals: RealSignals;
};

/** Roles that can approve expenses, so only they are asked to. */
const APPROVERS = ["super", "candidate", "manager"];

export async function loadHome(sb: Sb, userId: string, role: string | null): Promise<HomeData> {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const canApprove = APPROVERS.includes(String(role));
  const [profile, people, expenses, unread, mentions] = await Promise.all([
    sb.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    sb.from("people").select("id", { count: "exact", head: true }).not("tags", "cs", "{sample}"),
    canApprove
      ? sb.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("unread", true),
    sb.from("listening_mentions").select("issue, sentiment").gte("found_at", since).limit(2000),
  ]);
  return {
    firstName: profile.data?.full_name?.trim() || null,
    // Rivals and polls arrive with the race data (part 2).
    facts: { realPeople: people.count ?? 0, rivals: 0, polls: 0 },
    signals: {
      pendingExpenses: expenses.count ?? 0,
      unread: unread.count ?? 0,
      topIssue: topIssue(mentions.data ?? []),
    },
  };
}

export const getHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeData> => {
    const { data: role } = await context.supabase.rpc("my_campaign_role");
    return loadHome(context.supabase, context.userId, (role as string | null) ?? null);
  });
