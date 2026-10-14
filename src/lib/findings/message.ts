// The rules for what to say where: the issue a ward raises most, an issue
// rising this week, and a seat whose wards live too differently for one
// message. Pure.

import { measuredAt } from "@/lib/area-indicators";
import {
  count,
  EPS,
  finding,
  ISSUE_SOURCES,
  levelOf,
  LIMITS,
  percent,
  within,
  type Figure,
  type Finding,
  type FindingsInput,
  type IssueSource,
} from "@/lib/findings/core";
import { issueKey, issueLabel } from "@/lib/top-of-mind";

const SOURCE_WORDS: Record<IssueSource, string> = {
  door: "door",
  messages: "messages",
  news: "news and social",
};
const SOURCE_NAMES: Record<IssueSource, string> = {
  door: "Conversations at the door",
  messages: "Messages to your campaign",
  news: "News and social mentions",
};

/** 3. The issue a ward raises most, when it is a big share of enough issues raised. */
export function wardTopIssue(i: FindingsInput): Finding[] {
  if (!i.issues) return [];
  const period = `30 days to ${i.today}`;
  return i.wards.flatMap((w) => {
    if (!w.key) return [];
    const bySource: Record<IssueSource, number> = { door: 0, messages: 0, news: 0 };
    const byIssue = new Map<string, number>();
    for (const r of i.issues!) {
      const k = r.wardId === w.id ? issueKey(r.issue) : null;
      if (!k) continue;
      bySource[r.source] += r.n;
      byIssue.set(k, (byIssue.get(k) ?? 0) + r.n);
    }
    const total = bySource.door + bySource.messages + bySource.news;
    if (total < LIMITS.wardIssuesMin) return [];
    const [top, n] = [...byIssue.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]!;
    if (n / total < LIMITS.wardIssueShare - EPS) return [];
    const used = ISSUE_SOURCES.filter((s) => bySource[s] > 0);
    const figures: Figure[] = [
      {
        label: `Share that is ${top}`,
        value: n / total,
        text: percent(n / total),
        source: "Issues raised to your campaign",
        period,
      },
      {
        label: "Issues raised",
        value: total,
        text: count(total),
        source: "Issues raised to your campaign",
        period,
      },
      ...used.map((s) => ({
        label: SOURCE_NAMES[s],
        value: bySource[s],
        text: count(bySource[s]),
        source: SOURCE_NAMES[s],
        period,
      })),
    ];
    return [
      finding(
        "ward-top-issue",
        w.key,
        `${w.name}: ${top} is ${percent(n / total)} of the ${count(total)} issues raised in 30 days (${used.map((s) => `${SOURCE_WORDS[s]} ${count(bySource[s])}`).join(", ")}).`,
        [
          ...figures,
          {
            label: "Days",
            value: 30,
            text: "30",
            source: "Issues raised to your campaign",
            period,
          },
        ],
        { label: "Write to this ward", to: "/broadcast", search: { wards: w.id } },
        n,
      ),
    ];
  });
}

type Tally = Map<IssueSource, Map<string, number>>;
const total = (m: Map<string, number> | undefined) =>
  [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);

/** An issue's share in a period: its share of each counting source's issues, averaged, as top of mind does. */
function shareIn(t: Tally, sources: IssueSource[], key: string): number {
  return (
    sources.reduce((a, s) => a + (t.get(s)?.get(key) ?? 0) / total(t.get(s)), 0) / sources.length
  );
}

/** 4. An issue's share of what was raised this week, well up on the previous four weeks. */
export function issueRising(i: FindingsInput): Finding[] {
  if (!i.issueWeeks) return [];
  const now: Tally = new Map();
  const before: Tally = new Map();
  for (const r of i.issueWeeks) {
    const k = issueKey(r.issue);
    if (!k || r.week < 0 || r.week > 4) continue;
    const t = r.week === 0 ? now : before;
    const m = t.get(r.source) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + r.n);
    t.set(r.source, m);
  }
  const srcNow = ISSUE_SOURCES.filter((s) => total(now.get(s)) >= LIMITS.risingWeekMin);
  const srcBefore = ISSUE_SOURCES.filter((s) => total(before.get(s)) >= LIMITS.risingBeforeMin);
  if (!srcNow.length || !srcBefore.length) return [];
  const keys = [...new Set(srcNow.flatMap((s) => [...now.get(s)!.keys()]))];
  return keys.flatMap((k) => {
    const raised = ISSUE_SOURCES.reduce((a, s) => a + (now.get(s)?.get(k) ?? 0), 0);
    const a = shareIn(now, srcNow, k);
    const b = shareIn(before, srcBefore, k);
    if (raised < LIMITS.risingRaisedMin || a - b < LIMITS.risingPoints - EPS) return [];
    return [
      finding(
        "issue-rising",
        null,
        `${issueLabel(k)} rose to ${percent(a)} of what was raised this week, from ${percent(b)} over the previous four weeks.`,
        [
          {
            label: "Share this week",
            value: a,
            text: percent(a),
            source: "Issues raised to your campaign",
            period: `7 days to ${i.today}`,
          },
          {
            label: "Share over the previous four weeks",
            value: b,
            text: percent(b),
            source: "Issues raised to your campaign",
            period: `the 28 days before`,
          },
          {
            label: "Times raised this week",
            value: raised,
            text: count(raised),
            source: "Issues raised to your campaign",
            period: `7 days to ${i.today}`,
          },
        ],
        { label: "See what's said", to: "/listening", search: { issue: k } },
        a - b,
        k,
      ),
    ];
  });
}

/** 5. A seat whose densest ward has three times or more the buildings per km² of its least dense. */
export function oneSeatDifferentPlaces(i: FindingsInput): Finding[] {
  const seats =
    levelOf(i) === "constituency"
      ? [i.home]
      : i.atlas.areas
          .filter((a) => a.level === "constituency" && within(i.home, a.key))
          .map((a) => a.key);
  return seats.flatMap((seat) => {
    const wards = i.atlas.areas.filter((a) => a.parent === seat && a.level === "ward");
    const measured = wards.map((w) => ({ w, m: measuredAt(i.atlas, w.key).buildings_per_km2 }));
    if (measured.length < 2 || measured.some((x) => !x.m)) return [];
    const sorted = [...measured].sort(
      (a, b) => b.m!.value - a.m!.value || a.w.key.localeCompare(b.w.key),
    );
    const hi = sorted[0]!;
    const lo = sorted[sorted.length - 1]!;
    if (lo.m!.value <= 0 || hi.m!.value / lo.m!.value < LIMITS.densityRatio - EPS) return [];
    const name = i.atlas.areas.find((a) => a.key === seat)?.name ?? seat;
    const fig = (x: typeof hi): Figure => ({
      label: `Buildings per km² in ${x.w.name}`,
      value: x.m!.value,
      text: count(x.m!.value),
      source: i.atlas.sources.find((s) => s.id === x.m!.source)?.publisher ?? x.m!.source,
      period: String(x.m!.year),
    });
    return [
      finding(
        "one-seat-different-places",
        seat,
        `${name.endsWith("s") ? `${name}'` : `${name}'s`} wards live differently: ${hi.w.name} has ${count(hi.m!.value)} buildings per km², ${lo.w.name} ${count(lo.m!.value)}. One message won't fit both.`,
        [fig(hi), fig(lo)],
        { label: "Compare its wards", to: "/elections", search: { area: seat } },
        hi.m!.value / lo.m!.value,
      ),
    ];
  });
}
