// The hourly X pass: each campaign's active keywords searched on X itself, the ones searched
// longest ago first (X_TOPICS_PER_HOUR, default 12, so every keyword about every six hours),
// each search one call from the day's "x" budget. Posts are kept like any other Listening post,
// under the keyword's campaign, with who posted, views and reposts; a post found again keeps its
// latest counts. Moods are read by the main sweep. It searches through ScrapeCreators, or
// TwitterAPI.io when that key is set (src/lib/x-search.server.ts); with neither it does nothing.

import { takeCredits } from "@/lib/social-credits";
import { searchX, xConfigured, XCreditError } from "@/lib/x-search.server";

type AnyClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the service-role Supabase client, loosely
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type XSweep = { ran: boolean; topics: number; found: number; notes: string[] };

const perHour = () => {
  const n = Number(process.env["X_TOPICS_PER_HOUR"]);
  return Number.isInteger(n) && n > 0 && n <= 60 ? n : 12;
};

export async function runXSweep(sb: AnyClient): Promise<XSweep> {
  if (!xConfigured())
    return { ran: false, topics: 0, found: 0, notes: ["X search is not connected."] };
  const notes: string[] = [];
  const { data: topics } = await sb
    .from("listening_topics")
    .select("id, campaign_id, label, query")
    .eq("active", true)
    .order("x_scanned_at", { ascending: true, nullsFirst: true })
    .limit(perHour());
  let found = 0;
  let done = 0;
  for (const t of (topics ?? []) as {
    id: string;
    campaign_id: string;
    label: string;
    query: string | null;
  }[]) {
    const q = (t.query ?? t.label ?? "").trim();
    if (!q || !t.campaign_id) continue;
    if (!(await takeCredits(sb, "x", 1))) {
      notes.push("Today's X searches are used.");
      break;
    }
    try {
      const hits = await searchX(q);
      done++;
      found += hits.length;
      if (hits.length) {
        const rows = hits.map((h) => ({
          campaign_id: t.campaign_id,
          topic_id: t.id,
          source: "x",
          domain: "x.com",
          title: h.title,
          url: h.url,
          snippet: h.snippet,
          published_at: h.publishedAt,
          author: h.author,
          reach: h.reach,
          shares: h.shares,
        }));
        const { error } = await sb
          .from("listening_mentions")
          .upsert(rows, { onConflict: "campaign_id,url", ignoreDuplicates: true });
        if (error) notes.push(`${t.label}: X posts could not be stored.`);
        for (const r of rows.filter((x) => x.reach !== null))
          await sb
            .from("listening_mentions")
            .update({ reach: r.reach, shares: r.shares })
            .eq("campaign_id", t.campaign_id)
            .eq("url", r.url)
            .lt("reach", r.reach);
      }
    } catch (e) {
      if (e instanceof XCreditError) {
        notes.push(e.message);
        break;
      }
      notes.push(`${t.label}: ${(e as Error).message}`);
    }
    await sb
      .from("listening_topics")
      .update({ x_scanned_at: new Date().toISOString() })
      .eq("id", t.id);
  }
  return { ran: true, topics: done, found, notes };
}
