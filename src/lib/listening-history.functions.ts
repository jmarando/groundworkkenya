// Listening's posts by date: a run of Nairobi days a page at a time, or a few posts by id. The
// Listening page loads only the latest 600; Big voices, stories and Replay reach further back
// through this. The campaign's office only, and only its own posts (the database sees to that).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toMention, type Mention, type MentionRow } from "@/lib/listening-mention";
import { dayRange } from "@/lib/nairobi-date";
import { decodeCursor, encodeCursor, parsePostsQuery, type PostsQuery } from "@/lib/posts-query";
import { requireOffice } from "@/lib/require-role";
import { OFF_TOPIC } from "@/lib/top-of-mind";

export type PostsPage = { posts: Mention[]; next: string | null };

const PAGE = 300;

export const getListeningPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PostsQuery) => parsePostsQuery(input))
  .handler(async ({ data, context }): Promise<PostsPage> => {
    const sb = context.supabase;
    await requireOffice(sb);

    const [{ data: topics }, { data: rivals }] = await Promise.all([
      sb.from("listening_topics").select("id, label, kind"),
      sb.from("race_rivals").select("id, name, is_us"),
    ]);
    const topicById = new Map((topics ?? []).map((t) => [t.id, t]));
    const rivalById = new Map((rivals ?? []).map((r) => [r.id, r]));

    let rows: MentionRow[];
    let more = false;
    if ("ids" in data) {
      const { data: found, error } = await sb
        .from("listening_mentions")
        .select("*")
        .in("id", data.ids)
        .order("found_at", { ascending: false });
      if (error) throw new Error("Those posts could not be read.");
      rows = (found ?? []) as MentionRow[];
    } else {
      const { gte, lt } = dayRange(data.from, data.to);
      let q = sb.from("listening_mentions").select("*").gte("found_at", gte).lt("found_at", lt);
      const after = data.cursor ? decodeCursor(data.cursor) : null;
      if (after)
        q = q.or(
          `found_at.lt.${after.foundAt},and(found_at.eq.${after.foundAt},id.lt.${after.id})`,
        );
      const { data: found, error } = await q
        .order("found_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (error) throw new Error("Those days could not be read.");
      const all = (found ?? []) as MentionRow[];
      more = all.length > PAGE;
      rows = more ? all.slice(0, PAGE) : all;
    }

    const last = rows[rows.length - 1];
    return {
      // Posts the sweep found to be about somewhere or something else are left out, as on the page.
      posts: rows
        .filter((m) => m.issue !== OFF_TOPIC)
        .map((m) => toMention(m, topicById, rivalById)),
      next: more && last ? encodeCursor(last.found_at, last.id) : null,
    };
  });
