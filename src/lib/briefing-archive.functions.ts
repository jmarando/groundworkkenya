import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { storyFromRow, type StoryView } from "@/lib/morning-story";
import { loadDiary } from "@/lib/diary.functions";
import { PRINCIPAL_ROLES, TEAM_ROLES, type MyRole } from "@/lib/access";
import { nairobiToday } from "@/lib/demo/insights";

export const getBriefingArchive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { month?: string }) => {
    const month = input?.month ?? nairobiToday().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a month.");
    const from = `${month}-01`;
    const next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { month, from, to: new Date(next.getTime() - 864e5).toISOString().slice(0, 10) };
  })
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("my_campaign_role");
    if (!TEAM_ROLES.includes(role as MyRole) || role === "agent")
      throw new Error("This archive is for the campaign office team.");
    const [rows, diary] = await Promise.all([
      context.supabase
        .from("morning_stories")
        .select("day, story, written_by, created_at, edited_at")
        .gte("day", data.from)
        .lte("day", data.to)
        .order("day", { ascending: false })
        .limit(31),
      loadDiary(context.supabase, data.from, data.to),
    ]);
    if (rows.error) throw new Error("Could not read the morning archive.");
    return {
      month: data.month,
      stories: (rows.data ?? [])
        .map((r) => storyFromRow(r, null))
        .filter((s): s is StoryView => s !== null),
      diary,
    };
  });

export const catchUpMorning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase.rpc("my_campaign_role");
    if (!PRINCIPAL_ROLES.includes(role as MyRole))
      throw new Error("Only the candidate or manager can check the morning run.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runMorningStory } = await import("@/lib/morning-story.server");
    return runMorningStory({
      from: (table) => supabaseAdmin.from(table as "listening_jobs"),
      rpc: (_fn, args) =>
        supabaseAdmin.rpc("claim_morning_job", {
          _key: String(args["_key"]),
          _now: String(args["_now"]),
        }),
    });
  });
