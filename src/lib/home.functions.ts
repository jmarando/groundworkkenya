// Home's real signals, read as the signed-in person so row level security
// keeps every count inside their own campaign.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { nairobiToday } from "@/lib/demo/insights";
import {
  issueBoard,
  topIssue,
  type HomeFacts,
  type IssueRow,
  type RaceView,
  type RealSignals,
} from "@/lib/home";
import { rivalMove } from "@/lib/race-data";
import { loadPolls, loadRivals } from "@/lib/race.functions";

type Sb = SupabaseClient<Database>;

export type HomeData = {
  /** The signed-in person's full name, for the greeting. */
  firstName: string | null;
  facts: HomeFacts;
  signals: RealSignals;
  /** The campaign's own race; empty until someone adds it. */
  race: RaceView;
};

/** Roles that can approve expenses, so only they are asked to. */
const APPROVERS = ["super", "candidate", "manager"];

export async function loadHome(
  sb: Sb,
  userId: string,
  role: string | null,
  todayIso = nairobiToday(),
): Promise<HomeData> {
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const canApprove = APPROVERS.includes(String(role));
  // Home still opens if the race can't be read: the race section shows its sample.
  const [profile, people, expenses, unread, mentions, rivals, polls] = await Promise.all([
    sb.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
    sb.from("people").select("id", { count: "exact", head: true }).not("tags", "cs", "{sample}"),
    canApprove
      ? sb.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("unread", true),
    sb
      .from("listening_mentions")
      .select("issue, sentiment, title, url, found_at")
      .gte("found_at", since30)
      .order("found_at", { ascending: false })
      .limit(2000),
    loadRivals(sb).catch(() => []),
    loadPolls(sb).catch(() => []),
  ]);
  const rows = (mentions.data ?? []) as IssueRow[];
  return {
    firstName: profile.data?.full_name?.trim() || null,
    facts: { realPeople: people.count ?? 0, rivals: rivals.length, polls: polls.length },
    signals: {
      pendingExpenses: expenses.count ?? 0,
      unread: unread.count ?? 0,
      topIssue: topIssue(rows.filter((r) => r.found_at >= since7)),
      rivalMove: rivalMove(rivals, polls, todayIso),
    },
    race: { rivals, polls, issues: issueBoard(rows) },
  };
}

export const getHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeData> => {
    const { data: role } = await context.supabase.rpc("my_campaign_role");
    return loadHome(context.supabase, context.userId, (role as string | null) ?? null);
  });
