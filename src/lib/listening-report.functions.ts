// The data behind Listening's Report: the chosen Nairobi days and as many days before them, worked
// into figures on the server (src/lib/listening-report.ts) so the page gets numbers and the ids of
// the posts behind them, not thousands of posts. The campaign's office only; the caller's own
// campaign only (the database sees to that).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadWindow } from "@/lib/listening-load.server";
import { toMention } from "@/lib/listening-mention";
import {
  LIVE_SOURCES,
  aboutYou,
  keyFigures,
  moodDays,
  moodScore,
  newestIds,
  phraseTable,
  popularPhrases,
  quietSources,
  shareOfVoice,
  sourceMix,
  within,
  type KeyFigures,
  type MoodDay,
  type MoodScore,
  type Phrase,
  type PhraseRow,
  type Row,
  type VoiceShare,
} from "@/lib/listening-report";
import { loose } from "@/lib/loose-client";
import { addDays, dayRange, nairobiToday } from "@/lib/nairobi-date";
import { parseSpan } from "@/lib/replay";
import { requireOffice } from "@/lib/require-role";
import { OFF_TOPIC } from "@/lib/top-of-mind";

export type ReportData = {
  /** The days shown, Nairobi days, both included. */
  from: string;
  to: string;
  /** As many days just before them, set against them. */
  beforeFrom: string;
  beforeTo: string;
  /** Today in Nairobi. */
  today: string;
  /** Posts about you: found by the campaign's own keywords. */
  figures: KeyFigures;
  /** The posts behind the figures, newest first: all of them, and those that gave views or shares. */
  youIds: string[];
  viewIds: string[];
  shareIds: string[];
  mood: MoodScore;
  moodBefore: MoodScore;
  days: MoodDay[];
  sources: Row[];
  /** You against each rival keyword; empty when no rival is followed. */
  voice: VoiceShare[];
  /** The phrases and hashtags in the most posts about you, for the cloud. */
  cloud: Phrase[];
  phrases: PhraseRow[];
  hashtags: PhraseRow[];
  /** Posts found in these days that the sweep read as not about the seat (adverts, other places). */
  setAside: number;
  /** There were more posts than were read, so the figures come from the newest. */
  truncated: boolean;
  /** Lanes that have found nothing for three days or more, with their last find. */
  quiet: { source: string; since: string }[];
};

/** The most posts read for both periods together: enough for two busy quarters. */
const CAP = 8000;
const DAY = 86_400_000;

export const getListeningReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from?: string; to?: string }) => {
    const span = parseSpan(input?.from, input?.to);
    if (!span) throw new Error("Choose a first and a last day, no more than 93 days apart.");
    return span;
  })
  .handler(async ({ data, context }): Promise<ReportData> => {
    const sb = context.supabase;
    await requireOffice(sb);
    const db = loose(sb);

    const today = nairobiToday();
    const days =
      Math.round(
        (Date.parse(`${data.to}T00:00:00Z`) - Date.parse(`${data.from}T00:00:00Z`)) / DAY,
      ) + 1;
    const beforeFrom = addDays(data.from, -days);
    const beforeTo = addDays(data.from, -1);
    // A post is found on or after the day it was posted, so the posts found since the first day
    // before hold both periods. For days in the past, finds up to a week after them are read too,
    // so a post found late still counts on the day it was posted.
    const since = dayRange(beforeFrom, beforeFrom).gte;
    const until = data.to < today ? dayRange(data.to, addDays(data.to, 7)).lt : undefined;
    const shown = dayRange(data.from, data.to);

    const [window, { data: topics }, { data: rivals }, setAside, ...latest] = await Promise.all([
      loadWindow(sb as never, { since, ...(until ? { until } : {}), cap: CAP, words: true }),
      sb.from("listening_topics").select("id, label, kind, active"),
      sb.from("race_rivals").select("id, name, is_us"),
      db
        .from("listening_mentions")
        .select("id", { count: "exact", head: true })
        .eq("issue", OFF_TOPIC)
        .gte("found_at", shown.gte)
        .lt("found_at", shown.lt) as Promise<{ count: number | null }>,
      ...LIVE_SOURCES.map(
        (source) =>
          db
            .from("listening_mentions")
            .select("found_at")
            .eq("source", source)
            .order("found_at", { ascending: false })
            .limit(1) as Promise<{ data: { found_at: string }[] | null }>,
      ),
    ]);

    const topicById = new Map((topics ?? []).map((t) => [t.id, t]));
    const rivalById = new Map((rivals ?? []).map((r) => [r.id, r]));
    const posts = window.rows.map((r) => toMention(r, topicById, rivalById));
    const now = within(posts, data);
    const before = within(posts, { from: beforeFrom, to: beforeTo });
    const you = aboutYou(now);
    const youBefore = aboutYou(before);

    const said = popularPhrases(you);
    // Every phrase of the days before, even one used once, so a phrase is not called new when it was there.
    const saidBefore = popularPhrases(youBefore, 1);
    const isTag = (p: Phrase) => p.phrase.startsWith("#");

    return {
      from: data.from,
      to: data.to,
      beforeFrom,
      beforeTo,
      today,
      figures: keyFigures(you, youBefore),
      youIds: newestIds(you),
      viewIds: newestIds(you.filter((p) => p.reach !== null)),
      shareIds: newestIds(you.filter((p) => p.shares !== null)),
      mood: moodScore(you),
      moodBefore: moodScore(youBefore),
      days: moodDays(you, data),
      sources: sourceMix(you),
      voice: shareOfVoice(topics ?? [], now),
      cloud: said.slice(0, 40),
      phrases: phraseTable(
        said.filter((p) => !isTag(p)),
        saidBefore.filter((p) => !isTag(p)),
        8,
      ),
      hashtags: phraseTable(said.filter(isTag), saidBefore.filter(isTag), 8),
      setAside: setAside.count ?? 0,
      truncated: window.truncated,
      quiet: quietSources(
        Object.fromEntries(LIVE_SOURCES.map((s, i) => [s, latest[i]?.data?.[0]?.found_at ?? null])),
      ),
    };
  });
