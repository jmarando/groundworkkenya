// Listening's overview, read from the posts the sweeps found: what needs doing this week, each
// conversation (a keyword, or a candidate's own account) with its mood, and the posts behind any
// of it. Pure; every figure in a sentence is a count of the posts it opens.

export type Post = {
  id: string;
  topicId: string | null;
  topic: string | null;
  /** The keyword's kind: campaign (about you), rival, issue. Null for a candidate's own post. */
  topicKind: string | null;
  rivalId: string | null;
  /** The candidate whose own account it came from. */
  rival: string | null;
  rivalIsUs: boolean;
  source: string;
  domain: string | null;
  issue: string | null;
  sentiment: string | null;
  status: string;
  publishedAt: string | null;
  foundAt: string;
  reach: number | null;
  commentsRead: number | null;
  commentsNegative: number | null;
};

/** What a card, a row or a source opens: the posts that share these. */
export type Focus = {
  label: string;
  topicId?: string;
  rivalId?: string;
  issue?: string;
  source?: string;
  mood?: "positive" | "neutral" | "negative";
  unhandled?: boolean;
  /** Only posts about you (keywords of kind campaign). */
  aboutYou?: boolean;
  /** Only the last seven days. */
  week?: boolean;
};

export type Action = {
  key: string;
  tone: "urgent" | "watch" | "good";
  headline: string;
  why: string;
  /** What to do about it, in a few words. */
  todo: string;
  focus: Focus;
  /** How many posts the focus opens. */
  n: number;
};

export type Conversation = {
  key: string;
  group: "you" | "rivals" | "issues";
  label: string;
  /** A keyword, or a candidate's own account. */
  own: boolean;
  week: number;
  prevWeek: number;
  positive: number;
  neutral: number;
  negative: number;
  unhandledAngry: number;
  topIssue: string | null;
  sources: string[];
  /** Own posts: people reached and replies read this week. */
  reach: number;
  commentsRead: number;
  commentsNegative: number;
  focus: Focus;
};

export const SOURCE: Record<string, string> = {
  facebook: "Facebook",
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
  news: "News",
  web: "Web",
};
export const sourceName = (s: string) => SOURCE[s] ?? s;

const DAY = 86_400_000;
const when = (p: Post) => new Date(p.publishedAt ?? p.foundAt).getTime();
const inWeek = (p: Post, now: number) => now - when(p) <= 7 * DAY;
const inPrevWeek = (p: Post, now: number) => {
  const age = now - when(p);
  return age > 7 * DAY && age <= 14 * DAY;
};
const unhandled = (p: Post) => p.status === "new";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Whether the sweeps were already running the week before, so a change on it means something. */
export const hasLastWeek = (posts: Post[], now = Date.now()) =>
  posts.some((p) => inPrevWeek(p, now));

export function matches(p: Post, f: Focus, now: number): boolean {
  if (f.topicId && p.topicId !== f.topicId) return false;
  if (f.rivalId && p.rivalId !== f.rivalId) return false;
  if (f.issue && (p.issue ?? "unsorted") !== f.issue) return false;
  if (f.source && p.source !== f.source) return false;
  if (f.mood && p.sentiment !== f.mood) return false;
  if (f.unhandled && !unhandled(p)) return false;
  if (f.aboutYou && p.topicKind !== "campaign") return false;
  if (f.week && !inWeek(p, now)) return false;
  return true;
}

/** The posts behind a focus, newest first. */
export function postsFor<T extends Post>(posts: T[], f: Focus, now = Date.now()): T[] {
  return posts.filter((p) => matches(p, f, now)).sort((a, b) => when(b) - when(a));
}

function most(values: (string | null)[]): string | null {
  const n = new Map<string, number>();
  for (const v of values)
    if (v && v !== "general" && v !== "campaign") n.set(v, (n.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, c] of n) if (!best || c > (n.get(best) ?? 0)) best = k;
  return best;
}

/** One row per keyword and per candidate's own account, busiest this week first in each group. */
export function conversations(
  topics: { id: string; label: string; kind: string; active: boolean }[],
  posts: Post[],
  now = Date.now(),
): Conversation[] {
  const out: Conversation[] = [];
  const build = (
    key: string,
    group: Conversation["group"],
    label: string,
    own: boolean,
    rows: Post[],
    focus: Focus,
  ) => {
    const week = rows.filter((p) => inWeek(p, now));
    out.push({
      key,
      group,
      label,
      own,
      week: week.length,
      prevWeek: rows.filter((p) => inPrevWeek(p, now)).length,
      positive: week.filter((p) => p.sentiment === "positive").length,
      neutral: week.filter((p) => p.sentiment === "neutral").length,
      negative: week.filter((p) => p.sentiment === "negative").length,
      unhandledAngry: rows.filter((p) => p.sentiment === "negative" && unhandled(p)).length,
      topIssue: most(week.map((p) => p.issue)),
      sources: [...new Set(week.map((p) => p.source))],
      reach: week.reduce((s, p) => s + (p.reach ?? 0), 0),
      commentsRead: week.reduce((s, p) => s + (p.commentsRead ?? 0), 0),
      commentsNegative: week.reduce((s, p) => s + (p.commentsNegative ?? 0), 0),
      focus,
    });
  };

  for (const t of topics) {
    const rows = posts.filter((p) => p.topicId === t.id);
    if (!t.active && rows.length === 0) continue;
    const group = t.kind === "campaign" ? "you" : t.kind === "rival" ? "rivals" : "issues";
    build(`t:${t.id}`, group, t.label, false, rows, { label: t.label, topicId: t.id });
  }
  const rivals = new Map<string, { name: string; us: boolean }>();
  for (const p of posts)
    if (p.rivalId && p.rival) rivals.set(p.rivalId, { name: p.rival, us: p.rivalIsUs });
  for (const [id, r] of rivals) {
    const label = r.us ? "Your own posts" : `${r.name}'s own posts`;
    build(
      `r:${id}`,
      r.us ? "you" : "rivals",
      label,
      true,
      posts.filter((p) => p.rivalId === id),
      {
        label,
        rivalId: id,
      },
    );
  }
  const order = { you: 0, rivals: 1, issues: 2 };
  return out.sort(
    (a, b) => order[a.group] - order[b.group] || b.week - a.week || a.label.localeCompare(b.label),
  );
}

/** The few things worth doing this week, most pressing first. Nothing is said without its posts. */
export function actions(convos: Conversation[], posts: Post[], now = Date.now()): Action[] {
  const out: Action[] = [];
  const count = (f: Focus) => posts.filter((p) => matches(p, f, now)).length;

  // 1. Angry posts about you that nobody has dealt with.
  const angryYou: Focus = {
    label: "Angry posts about you, not yet handled",
    aboutYou: true,
    mood: "negative",
    unhandled: true,
  };
  const nAngry = count(angryYou);
  if (nAngry > 0) {
    const issue = most(postsFor(posts, angryYou, now).map((p) => p.issue));
    out.push({
      key: "angry-you",
      tone: "urgent",
      headline: `${plural(nAngry, "angry post")} about you ${nAngry === 1 ? "has" : "have"} not been handled`,
      why: issue
        ? `Most are about ${issue}. Read them, decide whether to answer, then mark each handled.`
        : "Read them, decide whether to answer, then mark each handled.",
      todo: "Read and answer",
      focus: angryYou,
      n: nAngry,
    });
  }

  // 2. Issues coming up more this week than last.
  const byIssue = new Map<string, { week: number; prev: number; negative: number }>();
  for (const p of posts) {
    if (!p.issue || p.issue === "general" || p.issue === "campaign") continue;
    const cur = byIssue.get(p.issue) ?? { week: 0, prev: 0, negative: 0 };
    if (inWeek(p, now)) {
      cur.week += 1;
      if (p.sentiment === "negative") cur.negative += 1;
    } else if (inPrevWeek(p, now)) cur.prev += 1;
    byIssue.set(p.issue, cur);
  }
  // Only once last week was swept: before that every issue would look new.
  const rising = [...byIssue.entries()]
    .filter(() => hasLastWeek(posts, now))
    .filter(([, v]) => v.week >= 3 && v.week >= 2 * Math.max(v.prev, 1))
    .sort((a, b) => b[1].week - a[1].week)
    .slice(0, 2);
  for (const [issue, v] of rising) {
    out.push({
      key: `rising-${issue}`,
      tone: v.negative * 2 >= v.week ? "urgent" : "watch",
      headline: `${issue.charAt(0).toUpperCase()}${issue.slice(1)} is coming up: ${plural(v.week, "post")} this week, ${v.prev} the week before`,
      why:
        v.negative > 0
          ? `${v.negative} of them angry. Worth a line from the candidate, or a stop on the diary where it bites.`
          : "None angry yet. A good moment to say what you have done on it.",
      todo: "See what is said",
      focus: { label: `${issue}, this week`, issue, week: true },
      n: v.week,
    });
  }

  // 3. A rival keyword with warmer coverage than you this week.
  const you = convos.filter((c) => c.group === "you" && !c.own);
  const yourWarm = you.reduce((s, c) => s + c.positive, 0);
  const warmer = convos
    .filter((c) => c.group === "rivals" && !c.own && c.positive >= 3 && c.positive > yourWarm)
    .sort((a, b) => b.positive - a.positive)[0];
  if (warmer) {
    out.push({
      key: `warmer-${warmer.key}`,
      tone: "watch",
      headline: `${warmer.label} had warmer coverage than you this week: ${warmer.positive} warm posts to your ${yourWarm}`,
      why: warmer.topIssue
        ? `Mostly on ${warmer.topIssue}. Read what landed for them.`
        : "Read what landed for them.",
      todo: "See their coverage",
      focus: {
        ...warmer.focus,
        mood: "positive",
        week: true,
        label: `${warmer.label}, warm this week`,
      },
      n: warmer.positive,
    });
  }

  // 4. Rivals' own accounts: how often they posted and who answered.
  const busiest = convos
    .filter((c) => c.group === "rivals" && c.own && c.week > 0)
    .sort((a, b) => b.reach - a.reach || b.week - a.week)[0];
  if (busiest) {
    const reach = busiest.reach > 0 ? `, reaching ${busiest.reach.toLocaleString("en-KE")}` : "";
    const replies =
      busiest.commentsRead > 0
        ? ` Of ${busiest.commentsRead} replies read, ${busiest.commentsNegative} were angry.`
        : "";
    out.push({
      key: `own-${busiest.key}`,
      tone: "watch",
      headline: `${busiest.label.replace(/'s own posts$/, "")} posted ${plural(busiest.week, "time")} this week${reach}`,
      why: `See where they were and what they promised.${replies}`,
      todo: "Read their posts",
      focus: { ...busiest.focus, week: true, label: `${busiest.label}, this week` },
      n: busiest.week,
    });
  }

  // 5. Good news about you worth sharing.
  const warmYou: Focus = {
    label: "Warm posts about you this week",
    aboutYou: true,
    mood: "positive",
    week: true,
  };
  const nWarm = count(warmYou);
  if (nWarm > 0) {
    out.push({
      key: "warm-you",
      tone: "good",
      headline: `${plural(nWarm, "warm post")} about you this week`,
      why: "Share the best of them from the campaign's own pages and thank whoever wrote them.",
      todo: "Pick ones to share",
      focus: warmYou,
      n: nWarm,
    });
  }
  return out.slice(0, 5);
}
