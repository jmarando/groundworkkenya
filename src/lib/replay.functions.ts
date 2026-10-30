// The data behind Listening's Replay: a week, a month or any run of days in the past, from the daily
// record (what each day's sweeps gathered, and the days nothing ran) and from the period's posts
// (issues, voices, stories), with the period before it for comparison. Plain code decides every
// line (src/lib/replay.ts). The campaign's office only; the caller's own campaign only (the
// database sees to that).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bigVoices, rivalVoiceKeys } from "@/lib/big-voices";
import { loadWindow } from "@/lib/listening-load.server";
import { toMention, type Mention, type MentionRow } from "@/lib/listening-mention";
import { loose } from "@/lib/loose-client";
import { dayRange, nairobiToday } from "@/lib/nairobi-date";
import { requireOffice } from "@/lib/require-role";
import {
  bars,
  compareWith,
  issueCounts,
  kindOf,
  lateByDay,
  loudestVoices,
  parseSpan,
  totalsOf,
  type DayRow,
  type Period,
  type PeriodStats,
} from "@/lib/replay";
import { pickups } from "@/lib/stories";

export type ReplayData = {
  period: Period;
  /** What it is set against: the period before, cut to the same days while this one is not over. */
  previous: Period;
  /** The period is not over, so `previous` holds only the same days of the one before. */
  partial: boolean;
  /** Today in Nairobi. */
  today: string;
  /** The first day a sweep recorded itself; null while none has. */
  recordBegins: string | null;
  /** The daily record over both periods, oldest first. */
  days: DayRow[];
  /** Older posts found late, by Nairobi day. */
  late: Record<string, number>;
  stats: PeriodStats;
  prevStats: PeriodStats;
  /** There were more posts than were read, so issues and voices come from the newest. */
  truncated: boolean;
};

/** The most posts read for one period: enough for a busy month. */
const CAP = 6000;

const DAY = 86_400_000;

export const getReplay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from?: string; to?: string }) => {
    const span = parseSpan(input?.from, input?.to);
    if (!span) throw new Error("Choose a first and a last day, no more than 93 days apart.");
    return span;
  })
  .handler(async ({ data, context }): Promise<ReplayData> => {
    const sb = context.supabase;
    await requireOffice(sb);
    const db = loose(sb);

    const today = nairobiToday();
    const period: Period = { kind: kindOf(data.from, data.to), ...data };
    const { period: previous, partial } = compareWith(period, today);
    const cur = dayRange(period.from, period.to);
    const prev = dayRange(previous.from, previous.to);

    const [
      record,
      first,
      mine,
      theirs,
      { data: topics },
      { data: rivals },
      { data: accounts },
      { data: storyRows },
      reactions,
    ] = await Promise.all([
      db
        .from("listening_days")
        .select("day, posts, warm, neutral, angry, unread, sweeps, backfilled")
        .gte("day", previous.from)
        .lte("day", period.to)
        .order("day"),
      db.from("listening_days").select("day").eq("backfilled", false).order("day").limit(1),
      loadWindow(sb as never, { since: cur.gte, until: cur.lt, cap: CAP }),
      loadWindow(sb as never, { since: prev.gte, until: prev.lt, cap: CAP }),
      sb.from("listening_topics").select("id, label, kind"),
      sb.from("race_rivals").select("id, name, is_us, x, tiktok, facebook"),
      db.from("listening_accounts").select("voice_key, followers").limit(5000) as Promise<{
        data: { voice_key: string; followers: number | null }[] | null;
      }>,
      db
        .from("listening_stories")
        .select("id, title, views")
        .gte("first_seen_at", cur.gte)
        .lt("first_seen_at", cur.lt)
        .order("views", { ascending: false, nullsFirst: false })
        .limit(50),
      db
        .from("rapid_responses")
        .select("id", { count: "exact", head: true })
        .gte("created_at", cur.gte)
        .lt("created_at", cur.lt),
    ]);
    if (record.error) throw new Error("The daily record could not be read.");

    const days = ((record.data ?? []) as Record<string, unknown>[]).map((r): DayRow => ({
      day: String(r["day"]),
      posts: Number(r["posts"] ?? 0),
      warm: Number(r["warm"] ?? 0),
      neutral: Number(r["neutral"] ?? 0),
      angry: Number(r["angry"] ?? 0),
      unread: Number(r["unread"] ?? 0),
      sweeps: r["sweeps"] === null || r["sweeps"] === undefined ? null : Number(r["sweeps"]),
      backfilled: r["backfilled"] === true,
    }));
    const recordBegins = ((first.data ?? []) as { day: string }[])[0]?.day ?? null;

    const topicById = new Map((topics ?? []).map((t) => [t.id, t]));
    const rivalById = new Map((rivals ?? []).map((r) => [r.id, r]));
    const posts = mine.rows.map((r) => toMention(r, topicById, rivalById));

    // The period's loudest voices: only those big enough to name, as on the Voices tab.
    const columns = bigVoices(posts, {
      now: Date.parse(cur.lt) - 1,
      days: Math.round((Date.parse(cur.lt) - Date.parse(cur.gte)) / DAY),
      followers: new Map((accounts ?? []).map((a) => [a.voice_key, a.followers])),
      rivalKeys: rivalVoiceKeys(rivals ?? []),
      labels: { seat: "", county: "", country: "" },
    });

    // The stories that began in the period, with the outlets that ran each.
    const stories = (storyRows ?? []) as {
      id: string;
      title: string;
      views: number | string | null;
    }[];
    const byStory = new Map<string, Mention[]>();
    if (stories.length > 0) {
      const { data: members } = await db
        .from("listening_mentions")
        .select("*")
        .in(
          "story_id",
          stories.map((s) => s.id),
        )
        .limit(2000);
      for (const r of (members ?? []) as MentionRow[]) {
        const m = toMention(r, topicById, rivalById);
        if (m.storyId) byStory.set(m.storyId, [...(byStory.get(m.storyId) ?? []), m]);
      }
    }

    const late = lateByDay(posts);
    const paused = (p: Period, withLate?: Map<string, number>) =>
      bars(p, days, { recordBegins, today, ...(withLate ? { late: withLate } : {}) }).filter(
        (b) => b.state === "paused",
      ).length;

    return {
      period,
      previous,
      partial,
      today,
      recordBegins,
      days,
      late: Object.fromEntries(late),
      stats: {
        ...totalsOf(period, days),
        issues: issueCounts(posts),
        voices: loudestVoices(columns),
        stories: stories.map((s) => ({
          title: s.title,
          views: Number(s.views ?? 0),
          outlets: new Set(
            pickups(byStory.get(s.id) ?? [])
              .filter((p) => p.outlet)
              .map((p) => p.name),
          ).size,
        })),
        reactions: reactions.count ?? 0,
        // Voices briefed arrive with the brief panel (voice_outreach).
        briefed: 0,
        pausedDays: paused(period, late),
      },
      prevStats: {
        ...totalsOf(previous, days),
        issues: issueCounts(
          theirs.rows.map((r) => ({ issue: r.issue, rivalId: r.rival_id ?? null })),
        ),
        voices: [],
        stories: [],
        reactions: 0,
        briefed: 0,
        pausedDays: paused(previous),
      },
      truncated: mine.truncated || theirs.truncated,
    };
  });
