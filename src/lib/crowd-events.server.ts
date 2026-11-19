// The daily search for crowd events (server only): for each campaign, four news searches built
// from its area (src/lib/crowd-events.ts), one AI read of the results, and the events that pass
// every check kept as suggestions in crowd_events. Runs from the hourly sweep on its own clock,
// once in 20 hours; four Serper credits and one AI answer a campaign. A refused search stops the
// searching for the run, said once; an AI that cannot answer leaves that campaign for tomorrow.

import { askAiJson } from "@/lib/listening.server";
import {
  areaOf,
  CROWD_SCHEMA,
  cleanCrowdEvents,
  crowdHits,
  crowdPrompt,
  crowdQueries,
  type CrowdCampaign,
  type CrowdHit,
  type CrowdWard,
} from "@/lib/crowd-events";
import { addDays, nairobiToday } from "@/lib/nairobi-date";
import { newsSearch, newsSearchConfigured, NewsSearchRefused } from "@/lib/news-sources.server";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

const JOB_KEY = "crowd_events";
const EVERY_HOURS = 20;
/** Events are kept this long after their day, then pruned. */
const KEEP_DAYS = 30;

export type CrowdSweep = {
  ran: boolean;
  campaigns: number;
  searches: number;
  kept: number;
  /** What went wrong, naming the campaign: for the scheduler only. */
  notes: string[];
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runCrowdEvents(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<CrowdSweep> {
  const now = opts.now ?? new Date();
  const out: CrowdSweep = { ran: false, campaigns: 0, searches: 0, kept: 0, notes: [] };
  const { data: job } = await sb
    .from("listening_jobs")
    .select("*")
    .eq("key", JOB_KEY)
    .maybeSingle();
  if (
    !opts.force &&
    job?.last_run_at &&
    now.getTime() - Date.parse(job.last_run_at) < EVERY_HOURS * 3600_000
  )
    return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;

  // Every campaign's team can read the job row, so what it says names no campaign.
  const shared: string[] = [];
  const finish = async () => {
    const detail =
      [
        ...shared,
        `${count(out.kept, "event", "events")} kept from ${count(out.searches, "search", "searches")} for ${count(out.campaigns, "campaign", "campaigns")}.`,
      ]
        .join(" · ")
        .slice(0, 400) || null;
    await sb.from("listening_jobs").upsert(
      {
        key: JOB_KEY,
        status: "idle",
        locked_until: null,
        last_run_at: now.toISOString(),
        detail,
        updated_at: now.toISOString(),
      },
      { onConflict: "key" },
    );
    return out;
  };

  if (!newsSearchConfigured()) {
    shared.push("Crowd events are not being looked for: no Serper key (SERPER_API_KEY).");
    return finish();
  }
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 20 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  const today = nairobiToday(now);
  await sb.from("crowd_events").delete().lt("starts_on", addDays(today, -KEEP_DAYS));

  const [{ data: campaigns }, { data: wards }, { data: areas }] = await Promise.all([
    sb.from("campaigns").select("id, slug, level, seat, map_area"),
    sb.from("wards").select("id, campaign_id, name, slug, constituency"),
    sb.from("atlas_areas").select("key, name").neq("level", "ward"),
  ]);
  const names = new Map<string, string>(
    ((areas ?? []) as { key: string; name: string }[]).map((a) => [a.key, a.name]),
  );

  let refused = false;
  for (const c of (campaigns ?? []) as CrowdCampaign[]) {
    if (refused) break;
    const area = areaOf(
      c,
      ((wards ?? []) as CrowdWard[]).filter((w) => w.campaign_id === c.id),
      names,
    );
    if (!area) continue;
    out.campaigns += 1;

    const found: CrowdHit[] = [];
    for (const q of crowdQueries(area)) {
      try {
        out.searches += 1;
        const hits = await newsSearch(q);
        found.push(
          ...hits.map((h) => ({
            url: h.url,
            title: h.title,
            snippet: h.snippet,
            outlet: h.outlet,
            publishedAt: h.publishedAt,
          })),
        );
      } catch (err) {
        if (err instanceof NewsSearchRefused) {
          refused = true;
          shared.push(`Crowd events search stopped: ${err.message}.`);
          break;
        }
        out.notes.push(`${c.slug}: a search failed (${(err as Error).message}).`);
      }
    }
    const hits = crowdHits(found);
    if (!hits.length) continue;

    let answer: unknown;
    try {
      answer = await askAiJson(
        crowdPrompt(c.seat, area, hits, today),
        "crowd events",
        CROWD_SCHEMA,
      );
    } catch (err) {
      out.notes.push(`${c.slug}: the AI could not read the results (${(err as Error).message}).`);
      continue;
    }
    const rows = cleanCrowdEvents(answer, hits, area, today);
    if (!rows.length) continue;
    const { data: saved, error } = await sb
      .from("crowd_events")
      .upsert(
        rows.map((r) => ({ ...r, campaign_id: c.id })),
        { onConflict: "campaign_id,dedupe", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      out.notes.push(`${c.slug}: events could not be saved (${error.message}).`);
      continue;
    }
    out.kept += (saved ?? []).length;
  }
  if (out.notes.length) shared.push(`${count(out.notes.length, "problem", "problems")} noted.`);
  return finish();
}
