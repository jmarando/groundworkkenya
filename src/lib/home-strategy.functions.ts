// Home's strategy at a glance: this week's moves from the two-week brief, where the road to
// election day stands (phase, next IEBC date, the most pressing gaps), what is spreading online
// and the reactions waiting, and the latest wider story read for the seat. One read for the
// office; each part is read softly, so a missing part is left out, never shown half-formed.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { movesAhead, readBrief } from "@/lib/brief";
import { daysUntil, ELECTION_DAY, nextKeyDate, type KeyDate } from "@/lib/election-calendar";
import { nairobiToday } from "@/lib/nairobi-date";
import { requireOffice } from "@/lib/require-role";
import { gaps, phasesFor, readRoadmap, type Gap, type NewsImpact } from "@/lib/roadmap";
import { loadFigures, loadImpacts } from "@/lib/roadmap.functions";
import { SPREAD_DEFAULT } from "@/lib/voices";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: these tables are newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type HomeStrategy = {
  today: string;
  daysLeft: number;
  brief: {
    headline: string;
    startsOn: string;
    endsOn: string;
    moves: { title: string; on: string; until: string; where: string[] }[];
  } | null;
  phase: { title: string; to: string; focus: string } | null;
  next: Pick<KeyDate, "title" | "on" | "until" | "sureness"> | null;
  gaps: Gap[];
  spreading: {
    id: string;
    title: string;
    url: string;
    source: string;
    reach: number;
    sentiment: string | null;
  }[];
  threshold: number;
  reactionsOpen: number;
  impact: NewsImpact | null;
};

const soft = async <T>(p: PromiseLike<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

export const getHomeStrategy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeStrategy> => {
    await requireOffice(context.supabase, "Strategy is for the campaign office.");
    const sb = context.supabase as unknown as Client;
    const today = nairobiToday();
    const { data: campaignId } = (await sb.rpc("my_campaign")) as { data: unknown };
    const { data: campaign } = (await sb
      .from("campaigns")
      .select("level, spending_limit_kes")
      .eq("id", String(campaignId))
      .maybeSingle()) as { data: { level: string; spending_limit_kes: unknown } | null };
    const level = campaign?.level ?? "mp";
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const [brief, roadmap, figures, alerts, impacts, reactions] = await Promise.all([
      soft(
        sb
          .from("campaign_briefs")
          .select("*")
          .order("starts_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() as Promise<{ data: Record<string, unknown> | null }>,
      ),
      soft(
        sb
          .from("campaign_roadmaps")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() as Promise<{ data: Record<string, unknown> | null }>,
      ),
      soft(loadFigures(sb, { level, limit: Number(campaign?.spending_limit_kes) || null }, today)),
      soft(
        sb.from("listening_alerts").select("min_reach").eq("active", true) as Promise<{
          data: { min_reach: number | null }[] | null;
        }>,
      ),
      soft(loadImpacts(sb, 1)),
      soft(
        sb
          .from("rapid_responses")
          .select("id", { count: "exact", head: true })
          .eq("status", "drafted") as Promise<{ count: number | null }>,
      ),
    ]);

    const threshold = Math.min(
      SPREAD_DEFAULT,
      ...(alerts?.data ?? []).flatMap((a) => (a.min_reach ? [a.min_reach] : [])),
    );
    const posts = await soft(
      sb
        .from("listening_mentions")
        .select("id, title, url, source, reach, sentiment, rival_id, published_at, found_at")
        .gte("reach", threshold)
        .is("rival_id", null)
        .gte("found_at", since)
        .order("reach", { ascending: false })
        .limit(3) as Promise<{
        data:
          | {
              id: string;
              title: string | null;
              url: string;
              source: string;
              reach: number;
              sentiment: string | null;
            }[]
          | null;
      }>,
    );

    const b = readBrief(brief?.data ?? null);
    const stored = readRoadmap(roadmap?.data ?? null);
    const phase =
      (stored?.phases ?? phasesFor(level, today)).find((p) => p.from <= today && today <= p.to) ??
      null;
    const next = nextKeyDate(level, today);
    return {
      today,
      daysLeft: daysUntil(today, ELECTION_DAY),
      brief:
        b && b.endsOn >= today
          ? {
              headline: b.headline,
              startsOn: b.startsOn,
              endsOn: b.endsOn,
              moves: movesAhead(b, today)
                .slice(0, 3)
                .map((m) => ({ title: m.title, on: m.on, until: m.until, where: m.where })),
            }
          : null,
      phase: phase ? { title: phase.title, to: phase.to, focus: phase.focus } : null,
      next: next
        ? { title: next.title, on: next.on, until: next.until, sureness: next.sureness }
        : null,
      gaps: figures
        ? gaps(figures, today)
            .filter((g) => g.tone !== "good")
            .slice(0, 2)
        : [],
      spreading: (posts?.data ?? []).map((p) => ({
        id: p.id,
        title: (p.title ?? p.url).split("\n")[0]!.slice(0, 160),
        url: p.url,
        source: p.source,
        reach: p.reach,
        sentiment: p.sentiment,
      })),
      threshold,
      reactionsOpen: reactions?.count ?? 0,
      impact: impacts?.[0] ?? null,
    };
  });
