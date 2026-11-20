// Search interest, read through SerpApi (server only): each campaign's
// candidates, searched as people search them, and the week's top issues from
// its own records. It rides on the hourly call with its own clock: its first
// run at or after 06:00 Nairobi time. Every read is of all Kenya, one search
// each: Google Trends has no smaller region for Kenya (SerpApi lists only KE),
// and the Nairobi answers asked for until November 2026 never came back usable.
// Every search comes out of the day's "trends" budget, which runs out before
// every campaign is read, so campaigns take turns: never read first, then the
// longest since its last read. A campaign read today is not read again, so a
// second run the same day reads only the rest. The shared job row says what
// happened in counts only.

import { nairobiToday } from "@/lib/nairobi-date";
import {
  ISSUE_SEARCH,
  noTrendsData,
  parseTrends,
  readOrder,
  searchName,
  type Geo,
} from "@/lib/search-interest";
import { loadMindInputs } from "@/lib/search-interest.functions";
import { serpConfigured, trendsAnswer } from "@/lib/serpapi.server";
import { takeCredits } from "@/lib/social-credits";
import { topOfMind } from "@/lib/top-of-mind";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Rival = { id: string; name: string; search_as: string | null; is_us: boolean; sort: number };
type Term = { term: string; ref: string };

const JOB_KEY = "search_interest";
const GEO: Geo = "KE";
const sixOn = (day: string) => Date.parse(`${day}T06:00:00+03:00`);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type SearchRun = {
  ran: boolean;
  /** Reads kept. */
  reads: number;
  /** Searches asked of SerpApi. */
  searches: number;
  /** What went wrong, naming the campaign: for the scheduler only. */
  notes: string[];
};

export async function runSearchInterest(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<SearchRun> {
  const now = opts.now ?? new Date();
  const day = nairobiToday(now);
  const out: SearchRun = { ran: false, reads: 0, searches: 0, notes: [] };
  if (!opts.force && now.getTime() < sixOn(day)) return out;
  const { data: job } = await sb
    .from("listening_jobs")
    .select("*")
    .eq("key", JOB_KEY)
    .maybeSingle();
  if (!opts.force && job?.last_run_at && Date.parse(job.last_run_at) >= sixOn(day)) return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;

  // Every campaign's team can read the job row: shared notes and counts only.
  const shared: string[] = [];
  let failed = 0;
  const finish = async () => {
    const detail =
      [
        ...shared,
        failed ? `${count(failed, "read", "reads")} could not be made.` : null,
        out.reads ? `Read ${count(out.reads, "set", "sets")} of search interest.` : null,
      ]
        .filter((p): p is string => p !== null)
        .join(" · ") || null;
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

  if (!serpConfigured()) {
    shared.push("SerpApi is not connected, so search interest is not being read.");
    return finish();
  }
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  let stop = false;
  const spend = async () => {
    if (stop) return false;
    if (!(await takeCredits(sb, "trends", 1))) {
      stop = true;
      shared.push("Stopped at today's SerpApi limit.");
      return false;
    }
    out.searches++;
    return true;
  };
  /** One search; undefined when the budget is spent, null when SerpApi had no answer. */
  const ask = async (terms: string[], geo: Geo) => {
    if (!(await spend())) return undefined;
    try {
      return parseTrends(await trendsAnswer(terms, geo), terms);
    } catch (err) {
      const message = (err as Error).message;
      // Too few searches for Google to chart: a read of nothing, so the
      // campaign takes its turn and Home says there are too few to compare.
      if (noTrendsData(message)) return terms.map((term) => ({ term, points: [] }));
      out.notes.push(`${geo}: ${message}`);
      return null;
    }
  };
  /** One read: a search of all Kenya, kept even when thin, so Home can say so. */
  const read = async (campaignId: string, kind: "candidates" | "issues", terms: Term[]) => {
    const names = terms.map((t) => t.term);
    const series = await ask(names, GEO);
    if (series === undefined) return;
    if (!series) {
      failed++;
      return;
    }
    const { error } = await sb.from("search_interest").upsert(
      {
        campaign_id: campaignId,
        day,
        kind,
        geo: GEO,
        series: series.map((s, i) => ({ ...s, ref: terms[i]?.ref ?? null })),
      },
      { onConflict: "campaign_id,day,kind" },
    );
    if (error) {
      failed++;
      out.notes.push(`${campaignId} ${kind}: ${error.message}`);
    } else out.reads++;
  };

  // Each campaign's last read, newest first: one missing from the page was
  // never read, or not for so long that it goes first anyway.
  const { data: past } = await sb
    .from("search_interest")
    .select("campaign_id, day")
    .order("day", { ascending: false })
    .limit(1000);
  const lastRead = new Map<string, string>();
  for (const r of (past ?? []) as { campaign_id: string; day: string }[]) {
    if (!lastRead.has(r.campaign_id)) lastRead.set(r.campaign_id, r.day);
  }

  const since = new Date(now.getTime() - 7 * 864e5).toISOString();
  const { data: campaigns } = await sb.from("campaigns").select("id");
  for (const c of readOrder((campaigns ?? []) as { id: string }[], lastRead)) {
    if (stop) break;
    if (lastRead.get(c.id) === day) continue;
    const { data: rivals } = await sb
      .from("race_rivals")
      .select("id, name, search_as, is_us, sort")
      .eq("campaign_id", c.id);
    const people = ((rivals ?? []) as Rival[])
      .sort((a, b) => Number(b.is_us) - Number(a.is_us) || a.sort - b.sort)
      .slice(0, 5)
      .map((r) => ({ term: searchName({ name: r.name, searchAs: r.search_as }), ref: r.id }));
    if (people.length) await read(c.id, "candidates", people);

    const mind = topOfMind({ ...(await loadMindInputs(sb, c.id, since)), searches: [] }, 10);
    const issues = mind.lines
      .flatMap((l) => (ISSUE_SEARCH[l.key] ? [{ term: ISSUE_SEARCH[l.key]!, ref: l.key }] : []))
      .slice(0, 5);
    if (issues.length) await read(c.id, "issues", issues);
  }
  return finish();
}
