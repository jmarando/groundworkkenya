// The findings, worked out for the signed-in person's campaign. Everything
// the rules read is read as them, so row level security keeps it inside their
// campaign; field agents are refused. Each database count is read softly:
// before Lovable applies schema 25 its functions don't exist, and the rules
// that need them stay quiet while the page says what is waiting.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wardKey } from "@/lib/atlas-app";
import { loadAtlas } from "@/lib/atlas.functions";
import { electionOf } from "@/lib/atlas-view";
import { nairobiToday } from "@/lib/demo/insights";
import { addDays } from "@/lib/diary";
import { loadDiary } from "@/lib/diary.functions";
import { defaultRace, homeAreaFor } from "@/lib/elections-view";
import { findings } from "@/lib/findings";
import {
  FINDINGS_READERS,
  LIMITS,
  type Count,
  type FindingsResult,
  type FindingsWard,
} from "@/lib/findings/core";
import {
  toIssueWeeks,
  toRivalWeeks,
  toWardIssues,
  toWardSpend,
  toWardSupporters,
} from "@/lib/findings/rows";
import { houseTotals } from "@/lib/house-totals";
import { toWardDoors } from "@/lib/houses";
import { pageAll } from "@/lib/page-all";
import { loadPolls, loadRivals } from "@/lib/race.functions";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: the counting functions are newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

/** The words every closed page uses. */
export const FINDINGS_DENIED = "This page isn't part of your role.";

type WardRow = {
  id: string;
  name: string;
  slug: string;
  constituency: string;
  target_votes: number | null;
};

export async function loadFindings(
  sb: Client,
  today = nairobiToday(),
  now = new Date(),
): Promise<FindingsResult> {
  const { data: role } = (await sb.rpc("my_campaign_role")) as { data: unknown };
  if (!FINDINGS_READERS.includes(String(role))) throw new Error(FINDINGS_DENIED);
  const { data: campaignId } = (await sb.rpc("my_campaign")) as { data: unknown };

  const waiting: Count[] = [];
  /** A count's rows, every page; null (and named in `waiting`) when it can't be read. */
  const readCount = async (
    name: Count,
    args: Record<string, unknown> = {},
  ): Promise<unknown[] | null> => {
    let failed = false;
    const rows = await pageAll<unknown>(async (from, to) => {
      const { data, error } = (await sb.rpc(name, args).range(from, to)) as {
        data: unknown[] | null;
        error: unknown;
      };
      if (error) failed = true;
      return { data: error ? [] : data };
    });
    if (failed) waiting.push(name);
    return failed ? null : rows;
  };

  const [
    atlas,
    campaign,
    wardRows,
    diary,
    rivals,
    polls,
    doors,
    supporters,
    spend,
    issues,
    issueWeeks,
    rivalWeeks,
  ] = await Promise.all([
    loadAtlas(sb),
    sb
      .from("campaigns")
      .select("level, seat, map_area")
      .eq("id", String(campaignId))
      .maybeSingle() as Promise<{
      data: { level: string; seat: string; map_area: string | null } | null;
    }>,
    sb.from("wards").select("id, name, slug, constituency, target_votes") as Promise<{
      data: WardRow[] | null;
    }>,
    loadDiary(
      sb as never,
      addDays(today, -LIMITS.daysBack),
      addDays(today, LIMITS.daysAhead),
    ).catch(() => []),
    loadRivals(sb as never).catch(() => []),
    loadPolls(sb as never).catch(() => []),
    readCount("house_doors"),
    readCount("ward_supporters"),
    readCount("ward_spend", { _days: 30 }),
    readCount("ward_issues", { _days: 30 }),
    readCount("issue_weeks", { _weeks: 5 }),
    readCount("rival_mention_weeks", { _weeks: 5 }),
  ]);

  const c = campaign.data;
  const home = homeAreaFor(c, atlas.homeArea, atlas.areas);
  const race = defaultRace(c?.level);
  const level = new Map(atlas.areas.map((a) => [a.key, a.level]));
  const wards: FindingsWard[] = (wardRows.data ?? []).map((w) => {
    const k = wardKey(atlas, w.constituency, w.slug);
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      constituency: w.constituency,
      key: k && level.get(k) === "ward" ? k : null,
      targetVotes: w.target_votes,
    };
  });

  return {
    asOf: now.toISOString(),
    findings: findings({
      today,
      home,
      race,
      atlas,
      wards,
      houses: houseTotals(c?.map_area),
      doors: doors ? toWardDoors(doors) : null,
      supporters: supporters ? toWardSupporters(supporters) : null,
      spend: spend ? toWardSpend(spend) : null,
      issues: issues ? toWardIssues(issues) : null,
      issueWeeks: issueWeeks ? toIssueWeeks(issueWeeks) : null,
      rivalWeeks: rivalWeeks ? toRivalWeeks(rivalWeeks) : null,
      diary,
      rivals,
      polls,
    }),
    waiting: waiting.sort(),
    sideSet: Boolean(atlas.sides[electionOf(race, 2022)]),
    wardKeys: Object.fromEntries(wards.flatMap((w) => (w.key ? [[w.id, w.key]] : []))),
  };
}

export const getFindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FindingsResult> => loadFindings(context.supabase as never));
