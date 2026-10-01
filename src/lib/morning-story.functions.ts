// This morning's story, read and changed as the signed-in person. Row level
// security keeps each campaign to its own story and lets only the candidate or
// campaign manager change it, as the team's; a change that reaches no row is
// treated as refused.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { PRINCIPAL_ROLES, type MyRole } from "@/lib/access";
import { nairobiToday } from "@/lib/demo/insights";
import {
  cleanTeamStory,
  storyFromRow,
  type MorningStory,
  type StoryView,
  type TeamStoryInput,
} from "@/lib/morning-story";

type Sb = SupabaseClient<Database>;

export const STORY_DENIED = "Only the candidate or campaign manager can change the story.";

export function storyError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return STORY_DENIED;
  if (e.code === "23505")
    return "Someone saved this morning's story at the same moment. Open Home again.";
  return "Could not save the story. Try again.";
}

/** The story for `day`, with the name of whoever last edited it. */
export async function loadStory(sb: Sb, day: string): Promise<StoryView | null> {
  const { data } = await sb
    .from("morning_stories")
    .select("day, story, written_by, created_at, edited_at, edited_by")
    .eq("day", day)
    .maybeSingle();
  if (!data) return null;
  let editor: string | null = null;
  if (data.edited_by) {
    const { data: p } = await sb
      .from("profiles")
      .select("full_name")
      .eq("user_id", data.edited_by)
      .maybeSingle();
    editor = p?.full_name?.trim() || null;
  }
  return storyFromRow(data, editor);
}

/** Save `story` as the team's for `day`: over the morning's, or as the first. */
export async function saveStoryAs(
  sb: Sb,
  userId: string,
  day: string,
  story: MorningStory,
): Promise<void> {
  const row = {
    day,
    story: story as unknown as Json,
    written_by: "team",
    edited_by: userId,
    edited_at: new Date().toISOString(),
  };
  const { data: have } = await sb.from("morning_stories").select("id").eq("day", day).maybeSingle();
  const { data, error } = have
    ? await sb.from("morning_stories").update(row).eq("id", have.id).select("id")
    : await sb.from("morning_stories").insert(row).select("id");
  if (error) throw new Error(storyError(error));
  if (!data?.length) throw new Error(STORY_DENIED);
}

/** The team's edit, or its own story when there is none yet. */
export async function saveTeamStory(
  sb: Sb,
  userId: string,
  day: string,
  input: TeamStoryInput,
): Promise<void> {
  const prev = await loadStory(sb, day);
  await saveStoryAs(sb, userId, day, cleanTeamStory(input, prev?.story ?? null));
}

export const saveStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TeamStoryInput) => input)
  .handler(async ({ data, context }) => {
    await saveTeamStory(context.supabase, context.userId, nairobiToday(), data);
    return { ok: true };
  });

type StoryServer = Pick<typeof import("@/lib/morning-story.server"), "gather" | "writeStory">;

/**
 * "Use another story": the morning's story rewritten around one of its items,
 * for the candidate or manager only. Who may is checked first, because the
 * rewrite costs an AI request. The server-only code is handed in.
 */
export async function reviseAround(
  sb: Sb,
  userId: string,
  day: string,
  url: string,
  server: StoryServer,
): Promise<void> {
  const { data: role } = await sb.rpc("my_campaign_role");
  if (!PRINCIPAL_ROLES.includes(role as MyRole)) throw new Error(STORY_DENIED);
  const [{ data: campaignId }, g] = await Promise.all([
    sb.rpc("my_campaign"),
    server.gather(sb as never, null, new Date()),
  ]);
  const { data: c } = await sb
    .from("campaigns")
    .select("id, name, candidate, seat")
    .eq("id", String(campaignId ?? ""))
    .maybeSingle();
  if (!c) throw new Error("Could not find the campaign.");
  const story = await server.writeStory(c, g, url);
  if (!story) throw new Error("Could not write a story around that one. Try another.");
  await saveStoryAs(sb, userId, day, story);
}

export const reviseStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    const url = String(input?.url ?? "");
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("Pick one of the morning's stories.");
    return { url };
  })
  .handler(async ({ data, context }) => {
    const server = await import("@/lib/morning-story.server");
    await reviseAround(context.supabase, context.userId, nairobiToday(), data.url, server);
    return { ok: true };
  });
