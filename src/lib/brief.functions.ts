// The Next two weeks page's reads: the campaign's latest brief, and the fortnight's diary and
// field plan from today. The campaign office only; a brief is written by the candidate, managers or
// Groundwork (saveBrief).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { readBrief, type Brief } from "@/lib/brief";
import { loadDiary } from "@/lib/diary.functions";
import type { DiaryEntry } from "@/lib/diary";
import type { PlanList, PlanWard } from "@/lib/field-plan";
import { loadFieldPlan } from "@/lib/field-plan.functions";
import { addDays, nairobiToday } from "@/lib/nairobi-date";
import { requireOffice, requireRole } from "@/lib/require-role";

export type PlanData = {
  today: string;
  brief: Brief | null;
  canWrite: boolean;
  diary: DiaryEntry[];
  lists: PlanList[];
  wards: PlanWard[];
};

export const getPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanData> => {
    const role = await requireOffice(context.supabase, "The plan is for the campaign office.");
    const sb = context.supabase;
    const today = nairobiToday();
    const [brief, diary, field] = await Promise.all([
      sb
        .from("campaign_briefs")
        .select("*")
        .order("starts_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadDiary(sb, today, addDays(today, 13)),
      loadFieldPlan(sb, today).catch(() => null),
    ]);
    return {
      today,
      brief: readBrief(brief.data as Record<string, unknown> | null),
      canWrite: PRINCIPAL_ROLES.includes(role),
      diary,
      lists: field?.lists ?? [],
      wards: field?.wards ?? [],
    };
  });

/** A new brief for the fortnight from `startsOn`; the last one stays on record. */
export const saveBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      startsOn: string;
      headline: string;
      read: unknown;
      moves: unknown;
      watch: unknown;
    }) => {
      const brief = readBrief({
        id: "new",
        starts_on: input?.startsOn,
        ends_on: /^\d{4}-\d{2}-\d{2}$/.test(String(input?.startsOn))
          ? addDays(String(input.startsOn), 13)
          : "",
        headline: input?.headline,
        the_read: input?.read,
        moves: input?.moves,
        watch: input?.watch,
      });
      if (!brief) throw new Error("A brief needs a start date and a headline.");
      return brief;
    },
  )
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers write the plan.",
    );
    const { error } = await context.supabase.from("campaign_briefs").insert({
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      headline: data.headline,
      the_read: data.read as never,
      moves: data.moves as never,
      watch: data.watch as never,
      written_by: "The campaign",
    });
    if (error) throw new Error("Could not save the plan.");
    return { ok: true };
  });
