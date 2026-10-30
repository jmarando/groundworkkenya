// One story, followed: its posts, the readings that draw its curve, and marking it handled. The
// campaign's office reads; the candidate and managers mark. The caller's own campaign only (the
// database sees to that).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { loose } from "@/lib/loose-client";
import { toMention, type Mention, type MentionRow } from "@/lib/listening-mention";
import { requireOffice, requireRole } from "@/lib/require-role";
import type { Reading } from "@/lib/stories";

export type StoryData = {
  story: {
    id: string;
    title: string;
    issue: string | null;
    status: "new" | "handled";
    firstSeenAt: string;
    lastPostAt: string;
    posts: number;
    voices: number;
    handledAt: string | null;
  };
  posts: Mention[];
  readings: Reading[];
  /** The candidate and managers react to a story, brief voices and mark it handled. */
  canAct: boolean;
};

const idOnly = (input: { id?: string }) => {
  const id = String(input?.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("No such story.");
  return { id };
};

export const getStory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idOnly)
  .handler(async ({ data, context }): Promise<StoryData> => {
    const sb = context.supabase;
    const role = await requireOffice(sb);
    const db = loose(sb);

    const { data: story } = await db
      .from("listening_stories")
      .select("id, title, issue, status, first_seen_at, last_post_at, posts, voices, handled_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!story) throw new Error("That story is no longer on file.");

    const [{ data: rows }, { data: topics }, { data: rivals }] = await Promise.all([
      db
        .from("listening_mentions")
        .select("*")
        .eq("story_id", data.id)
        .order("found_at")
        .limit(400),
      sb.from("listening_topics").select("id, label, kind"),
      sb.from("race_rivals").select("id, name, is_us"),
    ]);
    const topicById = new Map((topics ?? []).map((t) => [t.id, t]));
    const rivalById = new Map((rivals ?? []).map((r) => [r.id, r]));
    const posts = ((rows ?? []) as MentionRow[]).map((r) => toMention(r, topicById, rivalById));

    const readings: Reading[] = [];
    for (let i = 0; i < posts.length; i += 100) {
      const { data: part } = await db
        .from("listening_readings")
        .select("mention_id, at, reach")
        .in(
          "mention_id",
          posts.slice(i, i + 100).map((p) => p.id),
        )
        .order("at")
        .limit(5000);
      for (const r of (part ?? []) as { mention_id: string; at: string; reach: number | null }[])
        readings.push({ mentionId: r.mention_id, at: r.at, reach: r.reach });
    }

    return {
      story: {
        id: story.id,
        title: story.title,
        issue: story.issue ?? null,
        status: story.status === "handled" ? "handled" : "new",
        firstSeenAt: story.first_seen_at,
        lastPostAt: story.last_post_at,
        posts: story.posts,
        voices: story.voices,
        handledAt: story.handled_at ?? null,
      },
      posts,
      readings,
      canAct: PRINCIPAL_ROLES.includes(role),
    };
  });

/** Marks a story handled, and its posts actioned with it. */
export const markStoryHandled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idOnly)
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers mark a story handled.",
    );
    const { error } = await loose(context.supabase).rpc("set_story_handled", { _story: data.id });
    if (error) throw new Error("That story could not be marked.");
    return { ok: true };
  });
