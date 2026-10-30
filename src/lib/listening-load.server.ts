// Reading a window of Listening's posts, a thousand at a time (the database answers at most a
// thousand rows a request), for the screens and jobs that work on more than the latest 600: big
// voices, stories, Replay. A post's words are left out on purpose; who, where, when and how much
// is what they count. Server only.

import type { MentionRow } from "@/lib/listening-mention";
import { OFF_TOPIC } from "@/lib/top-of-mind";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase client, loosely
  from: (table: string) => any;
};

const PAGE = 1000;
const COLUMNS =
  "id, topic_id, source, domain, url, published_at, found_at, sentiment, sentiment_score, issue, status, rival_id, author, reach, shares, comments_read, comments_positive, comments_negative";

/**
 * Posts found since `since`, newest first, without the ones the sweep read as off-topic. `cap`
 * (4,000 by default) bounds the work; `truncated` says there were more. Name a campaign when the
 * client is the server's own; a signed-in caller's client already sees only its own.
 */
export async function loadWindow(
  sb: Client,
  opts: { since: string; campaignId?: string; cap?: number },
): Promise<{ rows: MentionRow[]; truncated: boolean }> {
  const cap = opts.cap ?? 4000;
  const rows: MentionRow[] = [];
  let full = false;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from("listening_mentions").select(COLUMNS).gte("found_at", opts.since);
    if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
    const { data, error } = await q
      .order("found_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error("The posts could not be read.");
    const page = (data ?? []) as Omit<MentionRow, "title" | "snippet">[];
    for (const r of page) rows.push({ ...r, title: null, snippet: null });
    full = page.length === PAGE;
    if (!full || rows.length >= cap) break;
  }
  const truncated = rows.length > cap || (rows.length === cap && full);
  return {
    rows: rows.slice(0, cap).filter((r) => r.issue !== OFF_TOPIC),
    truncated,
  };
}
