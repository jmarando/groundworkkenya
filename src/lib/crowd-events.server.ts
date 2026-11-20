// The search for crowd events (server only): for each campaign, four news searches built from its
// area (src/lib/crowd-events.ts), one AI read of the results, and the events that pass every check
// kept as suggestions in crowd_events. Runs from the hourly sweep, and campaigns take turns: each
// area is searched once in 20 hours, never-searched first, then the longest since its last search,
// and a run starts campaigns only within CROWD_BUDGET_MS, so a slow AI cannot hold up the sweep;
// the rest wait for the next hour. Four Serper credits and one AI answer a campaign. A refused
// search stops the run and its campaign waits for the next hour; an AI that cannot answer in time
// leaves that campaign for its next turn. The job note is written after every campaign, so a run cut
// off part way still says what it did.

import { askAiJson } from "@/lib/listening.server";
import {
  areaOf,
  checkCrowdEvents,
  checkSummary,
  CROWD_AI_MS,
  CROWD_BUDGET_MS,
  CROWD_SCHEMA,
  crowdHits,
  crowdPrompt,
  crowdQueries,
  crowdTurnKey,
  crowdTurns,
  refusalCounts,
  runLine,
  type CrowdArea,
  type CrowdCampaign,
  type CrowdHit,
  type CrowdWard,
  type Refusal,
} from "@/lib/crowd-events";
import { addDays, nairobiToday } from "@/lib/nairobi-date";
import { newsSearch, newsSearchConfigured, NewsSearchRefused } from "@/lib/news-sources.server";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

const JOB_KEY = "crowd_events";
/** Events are kept this long after their day, then pruned. */
const KEEP_DAYS = 30;
/** How long the run's lock holds, longer than any run can take. */
const LOCK_MS = 15 * 60_000;

export type CrowdSweep = {
  ran: boolean;
  /** Campaigns searched in this run, and those whose turn it was but wait for the next hour. */
  campaigns: number;
  waiting: number;
  searches: number;
  kept: number;
  /** Events the AI named, and those that passed but were saved before (found again). */
  named: number;
  already: number;
  /** How many were left out for each reason. */
  refused: Partial<Record<Refusal, number>>;
  /** Up to three left out per campaign, to tune the checks: for the scheduler only. */
  examples: { campaign: string; reason: Refusal; title: string | null; url: string | null }[];
  /** What went wrong, naming the campaign: for the scheduler only. */
  notes: string[];
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runCrowdEvents(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<CrowdSweep> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const out: CrowdSweep = {
    ran: false,
    campaigns: 0,
    waiting: 0,
    searches: 0,
    kept: 0,
    named: 0,
    already: 0,
    refused: {},
    examples: [],
    notes: [],
  };
  const { data: job } = await sb
    .from("listening_jobs")
    .select("*")
    .eq("key", JOB_KEY)
    .maybeSingle();
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;

  const [{ data: campaigns }, { data: wards }, { data: areas }, { data: turns }] =
    await Promise.all([
      sb.from("campaigns").select("id, slug, level, seat, map_area"),
      sb.from("wards").select("id, campaign_id, name, slug, constituency"),
      sb.from("atlas_areas").select("key, name").neq("level", "ward"),
      sb.from("listening_jobs").select("key, last_run_at").like("key", `${JOB_KEY}:%`),
    ]);
  const names = new Map<string, string>(
    ((areas ?? []) as { key: string; name: string }[]).map((a) => [a.key, a.name]),
  );
  const searchable = new Map<string, { c: CrowdCampaign; area: CrowdArea }>();
  for (const c of (campaigns ?? []) as CrowdCampaign[]) {
    const area = areaOf(
      c,
      ((wards ?? []) as CrowdWard[]).filter((w) => w.campaign_id === c.id),
      names,
    );
    if (area) searchable.set(c.id, { c, area });
  }
  const lastRun = new Map<string, string | null>(
    ((turns ?? []) as { key: string; last_run_at: string | null }[]).map((t) => [
      t.key.slice(JOB_KEY.length + 1),
      t.last_run_at,
    ]),
  );
  const due = opts.force
    ? [...searchable.keys()]
    : crowdTurns([...searchable.keys()], lastRun, now);
  // Nobody's turn this hour: the last run's note stands.
  if (!due.length) return out;
  out.ran = true;

  // Every campaign's team can read the job rows, so what they say names no campaign.
  const shared: string[] = [];
  const save = async (final: boolean) => {
    const detail =
      [
        ...shared,
        runLine(out.kept, out.searches, out.campaigns, out.waiting),
        ...(out.campaigns ? [checkSummary(out.named, out.kept, out.already, out.refused)] : []),
      ]
        .join(" · ")
        .slice(0, 400) || null;
    await sb.from("listening_jobs").upsert(
      {
        key: JOB_KEY,
        status: final ? "idle" : "running",
        locked_until: final ? null : new Date(now.getTime() + LOCK_MS).toISOString(),
        last_run_at: final ? now.toISOString() : (job?.last_run_at ?? null),
        detail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  };

  if (!newsSearchConfigured()) {
    shared.push("Crowd events are not being looked for: no Serper key (SERPER_API_KEY).");
    out.waiting = due.length;
    await save(true);
    return out;
  }
  await save(false);

  const today = nairobiToday(now);
  await sb.from("crowd_events").delete().lt("starts_on", addDays(today, -KEEP_DAYS));

  for (const [i, id] of due.entries()) {
    // Out of time: whoever is left takes the next hour's turn.
    if (Date.now() - started > CROWD_BUDGET_MS) {
      out.waiting = due.length - i;
      break;
    }
    const { c, area } = searchable.get(id)!;
    out.campaigns += 1;

    const found: CrowdHit[] = [];
    let refused = false;
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
    // A refused search (credits run out) stops the run; this campaign and the rest try next hour.
    if (refused) {
      out.waiting = due.length - i;
      break;
    }

    const hits = crowdHits(found);
    if (hits.length) {
      let answer: unknown = null;
      try {
        answer = await askAiJson(
          crowdPrompt(c.seat, area, hits, today),
          "crowd events",
          CROWD_SCHEMA,
          CROWD_AI_MS,
        );
      } catch (err) {
        out.notes.push(`${c.slug}: the AI could not read the results (${(err as Error).message}).`);
      }
      if (answer) {
        const check = checkCrowdEvents(answer, hits, area, today);
        out.named += check.named;
        for (const [reason, n] of Object.entries(refusalCounts(check.refused)) as [
          Refusal,
          number,
        ][])
          out.refused[reason] = (out.refused[reason] ?? 0) + n;
        out.examples.push(...check.refused.slice(0, 3).map((r) => ({ campaign: c.slug, ...r })));
        if (check.rows.length) {
          const { data: saved, error } = await sb
            .from("crowd_events")
            .upsert(
              check.rows.map((r) => ({ ...r, campaign_id: c.id })),
              { onConflict: "campaign_id,dedupe", ignoreDuplicates: true },
            )
            .select("id");
          if (error) out.notes.push(`${c.slug}: events could not be saved (${error.message}).`);
          else {
            out.kept += (saved ?? []).length;
            out.already += check.rows.length - (saved ?? []).length;
          }
        }
      }
    }

    // Its turn is taken; the note says so far what the run has done.
    await sb.from("listening_jobs").upsert(
      {
        key: crowdTurnKey(c.id),
        status: "idle",
        locked_until: null,
        last_run_at: now.toISOString(),
        detail: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    await save(false);
  }
  if (out.notes.length) shared.push(`${count(out.notes.length, "problem", "problems")} noted.`);
  await save(true);
  return out;
}
