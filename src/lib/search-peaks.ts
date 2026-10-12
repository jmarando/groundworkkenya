// Peaks in search interest, and the news found around each: the likely reason
// a name drew searches that day. Pure.

import { addDays } from "@/lib/diary";
import type { SearchChartModel } from "@/lib/search-interest";

export type SearchPeak = {
  n: number;
  key: string;
  label: string;
  term: string;
  index: number;
  day: string;
  value: number;
};

/** A day that stands well above the days before it; the biggest few, oldest first. */
export function searchPeaks(model: SearchChartModel, terms: string[], max = 5): SearchPeak[] {
  const found: Omit<SearchPeak, "n">[] = [];
  model.series.forEach((s, si) => {
    let lastAt = -99;
    s.values.forEach((v, i) => {
      if (v === null || v < 20) return;
      const prev = s.values[i - 1] ?? null;
      const next = s.values[i + 1] ?? null;
      if (prev !== null && prev >= v) return;
      if (next !== null && next > v) return;
      const before = s.values.slice(Math.max(0, i - 3), i).filter((x): x is number => x !== null);
      const base = before.length ? Math.min(...before) : 0;
      if (v - base < 15) return;
      if (i - lastAt < 4) return;
      lastAt = i;
      found.push({
        key: s.key,
        label: s.label,
        term: terms[si] ?? s.label,
        index: i,
        day: model.days[i]!,
        value: v,
      });
    });
  });
  return found
    .sort((a, b) => b.value - a.value)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((p, i) => ({ ...p, n: i + 1 }));
}

export type PeakMention = {
  title: string | null;
  url: string;
  domain: string | null;
  snippet: string | null;
  published_at: string | null;
  found_at: string;
  reach: number | null;
};

/** The window of news read for a peak: two days before to the day after. */
export const peakWindow = (day: string) => ({ from: addDays(day, -2), to: addDays(day, 2) });

/** The stories that most likely explain `peak`: naming the person, closest to the day, widest reach. */
export function peakReasons(peak: SearchPeak, mentions: PeakMention[], take = 2): PeakMention[] {
  const { from, to } = peakWindow(peak.day);
  const term = peak.term.toLowerCase();
  const dayOf = (m: PeakMention) => (m.published_at ?? m.found_at).slice(0, 10);
  const gap = (d: string) => Math.abs(Date.parse(d) - Date.parse(peak.day));
  const seen = new Set<string>();
  return mentions
    .filter((m) => {
      const d = dayOf(m);
      if (d < from || d >= to) return false;
      const text = `${m.title ?? ""} ${m.snippet ?? ""}`.toLowerCase();
      return text.includes(term);
    })
    .sort((a, b) => gap(dayOf(a)) - gap(dayOf(b)) || (b.reach ?? 0) - (a.reach ?? 0))
    .filter((m) => {
      const k = (m.title ?? m.url).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, take);
}
