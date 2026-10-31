// Following a story: which posts are about the same thing, the views curve drawn from the readings,
// whether it is still climbing, who carried it, and the "so what" line. Plain code, no AI (the AI
// only names a story, in src/lib/stories.server.ts). Pure.
//
// "First seen" is the first post we found, not proof of who started it, and every line that names
// it says so. Places, never people: a voice is a public account or an outlet, and nothing here
// guesses anyone's community.

import { levelOf, NO_ISSUE, type BriefFocus } from "@/lib/big-voices";
import { nf } from "@/lib/format";
import type { Mention } from "@/lib/listening-mention";
import { sourceName } from "@/lib/listening-read";
import { voiceOf } from "@/lib/voices";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** When two posts are about one story: within this long, and a shared link, or this much of the same words. */
export const MATCH = { hours: 72, jaccard: 0.35, shared: 4 } as const;

export type StoryPost = {
  id: string;
  url: string;
  source: string;
  /** voiceOf's key for who posted it, or null when the post does not say. */
  voiceKey: string | null;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
  foundAt: string;
  /** The post this one quotes or replies to (X), when the provider gave it. */
  refersTo: string | null;
  storyId: string | null;
  reach: number | null;
  sentiment: string | null;
  issue: string | null;
  topicKind: string | null;
  rivalId: string | null;
};

export type Reading = { mentionId: string; at: string; reach: number | null };
export type SavedStory = { id: string; createdAt: string; postIds: string[] };
export type Group = { postIds: string[]; firstId: string; savedId: string | null };

const when = (p: Pick<StoryPost, "publishedAt" | "foundAt">) =>
  Date.parse(p.publishedAt ?? p.foundAt);

// ---- words

const STOP = new Set(
  `the and for are was were with that this from have has had not but you your they their them will
   can all our out more who been what when where which would there about into than then its also
   just over after before some new one two said says say now get got how why any may like very much
   still here his her she him himself because while they're said than too only even
   today yesterday tomorrow week year says according
   na ya wa kwa ni katika hii huo hiyo kuwa kama pia sana lakini wakati wao yao yake wake hao vya
   cha za ili hata bado tena kila mimi wewe sisi nyinyi huu hizi zile ile ambao ambaye ambayo ndani
   juu chini baada kabla sasa leo jana kesho bila kati mpya moja mbili
   kwani ama buda msee`
    .split(/\s+/)
    .filter(Boolean),
);

/** The words of a post that say what it is about: lower case, no links or handles, no common words. */
export function wordsOf(text: string): Set<string> {
  const t = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)@\w+/g, " ");
  const out = new Set<string>();
  for (const m of t.matchAll(/#[\p{L}\p{N}_]+|[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.startsWith("#")) {
      if (w.length > 2) out.add(w);
    } else if (w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w)) out.add(w);
  }
  return out;
}

// ---- links

/** Shorteners give every post a link of its own, so one in common means nothing. */
const SHORTENERS = new Set([
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "ow.ly",
  "buff.ly",
  "goo.gl",
  "is.gd",
  "lnkd.in",
  "fb.me",
  "wp.me",
  "dlvr.it",
  "tiny.cc",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
]);
const TRACKING = /^(utm_.*|fbclid|gclid|igshid|ref|ref_src|mc_.*|mibextid|si)$/i;

/** A link made comparable, or null for a shortener, a front page or something that is no link. */
function normLink(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  let host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (host === "twitter.com") host = "x.com";
  if (SHORTENERS.has(host)) return null;
  const path = u.pathname.replace(/\/+$/, "");
  const query = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("&");
  if (!path && !query) return null;
  return `${host}${path}${query ? `?${query}` : ""}`;
}

/** A post's own address and the links in its words, each made comparable, each once. */
export function linksOf(p: Pick<StoryPost, "url" | "title" | "snippet">): string[] {
  const found = [
    p.url,
    ...(`${p.title ?? ""} ${p.snippet ?? ""}`.match(/https?:\/\/[^\s<>"'\])]+/gi) ?? []),
  ];
  return [
    ...new Set(
      found
        .map((l) => normLink(l.replace(/[.,;:!?]+$/, "")))
        .filter((l): l is string => l !== null),
    ),
  ];
}

const statusId = (url: string | null): string | null =>
  url ? (/\/status\/(\d{1,25})/.exec(url)?.[1] ?? null) : null;

// ---- are two posts about one story?

type Features = {
  t: number;
  words: Set<string>;
  links: Set<string>;
  ownId: string | null;
  refId: string | null;
};

const featuresOf = (p: StoryPost): Features => ({
  t: when(p),
  words: wordsOf(`${p.title ?? ""} ${p.snippet ?? ""}`),
  links: new Set(linksOf(p)),
  ownId: statusId(p.url),
  refId: statusId(p.refersTo),
});

function match(a: Features, b: Features): boolean {
  if (!(Math.abs(a.t - b.t) <= MATCH.hours * HOUR)) return false;
  if ((a.refId && a.refId === b.ownId) || (b.refId && b.refId === a.ownId)) return true;
  for (const l of a.links) if (b.links.has(l)) return true;
  let shared = 0;
  for (const w of a.words) if (b.words.has(w)) shared++;
  if (shared < MATCH.shared) return false;
  return shared / (a.words.size + b.words.size - shared) >= MATCH.jaccard;
}

export const sameStory = (a: StoryPost, b: StoryPost): boolean =>
  match(featuresOf(a), featuresOf(b));

/**
 * The stories in a set of posts: posts that match are joined, through each other too, and a group
 * is a story when it holds at least two posts from at least two voices (a post that does not say
 * who posted counts as a voice of its own). A saved story keeps its id: the oldest that has a post
 * in the group, and never one that another group already kept.
 */
export function groupStories(posts: StoryPost[], saved: SavedStory[]): Group[] {
  const usable = posts.filter((p) => !Number.isNaN(when(p)));
  const feats = new Map(usable.map((p) => [p.id, featuresOf(p)]));
  const order = [...usable].sort(
    (a, b) =>
      feats.get(a.id)!.t - feats.get(b.id)!.t ||
      a.foundAt.localeCompare(b.foundAt) ||
      a.id.localeCompare(b.id),
  );
  const parent = new Map(order.map((p) => [p.id, p.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    for (let cur = id; cur !== root;) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (let i = 0; i < order.length; i++) {
    const a = feats.get(order[i]!.id)!;
    for (let j = i + 1; j < order.length; j++) {
      const b = feats.get(order[j]!.id)!;
      if (b.t - a.t > MATCH.hours * HOUR) break;
      if (match(a, b)) parent.set(find(order[j]!.id), find(order[i]!.id));
    }
  }

  const byRoot = new Map<string, StoryPost[]>();
  for (const p of order) {
    const root = find(p.id);
    byRoot.set(root, [...(byRoot.get(root) ?? []), p]);
  }
  const stories = [...byRoot.values()].filter(
    (g) => g.length >= 2 && new Set(g.map((p) => p.voiceKey ?? `anon:${p.id}`)).size >= 2,
  );

  // Saved ids go to the biggest groups first, so a story that split stays with its larger half.
  const kept = new Set<string>();
  const savedFor = new Map<StoryPost[], string | null>();
  for (const g of [...stories].sort((a, b) => b.length - a.length)) {
    const ids = new Set(g.map((p) => p.id));
    const pick = saved
      .filter((s) => s.postIds.some((id) => ids.has(id)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .find((s) => !kept.has(s.id));
    if (pick) kept.add(pick.id);
    savedFor.set(g, pick?.id ?? null);
  }
  return stories.map((g) => ({
    postIds: g.map((p) => p.id),
    firstId: g[0]!.id,
    savedId: savedFor.get(g) ?? null,
  }));
}

// ---- how it grew

/** Total views over time: at each reading, the sum of every post's highest count so far. */
export function viewsCurve(
  readings: Reading[],
  postIds: string[],
): { at: string; views: number }[] {
  const mine = new Set(postIds);
  const sorted = readings
    .filter((r) => mine.has(r.mentionId) && r.reach !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
  const highest = new Map<string, number>();
  const out: { at: string; views: number }[] = [];
  for (const r of sorted) {
    highest.set(r.mentionId, Math.max(highest.get(r.mentionId) ?? 0, r.reach!));
    const views = [...highest.values()].reduce((t, v) => t + v, 0);
    if (out.length && out[out.length - 1]!.at === r.at) out[out.length - 1]!.views = views;
    else out.push({ at: r.at, views });
  }
  return out;
}

/**
 * Whether it is still going. Readings come every few hours, so this compares the story's total at
 * its two latest readings: climbing when it grew by a tenth or more and the latest is under 12
 * hours old; settled when it grew less; unchecked when the latest is older than that.
 */
export function trendOf(
  curve: { at: string; views: number }[],
  now: number,
): { kind: "climbing" | "settled" | "unchecked"; since: string | null } {
  const last = curve[curve.length - 1];
  if (!last) return { kind: "unchecked", since: null };
  if (now - Date.parse(last.at) >= 12 * HOUR) return { kind: "unchecked", since: last.at };
  const prev = curve[curve.length - 2];
  if (!prev) return { kind: "settled", since: null };
  const grew = last.views > prev.views && last.views * 10 >= prev.views * 11;
  return { kind: grew ? "climbing" : "settled", since: null };
}

/** The share of the views each platform carried, the biggest first; nothing when no post has views. */
export function platformSplit(
  posts: { source: string; reach: number | null }[],
): { source: string; share: number }[] {
  const by = new Map<string, number>();
  for (const p of posts) if (p.reach) by.set(p.source, (by.get(p.source) ?? 0) + p.reach);
  const total = [...by.values()].reduce((t, v) => t + v, 0);
  return total
    ? [...by.entries()]
        .map(([source, v]) => ({ source, share: v / total }))
        .sort((a, b) => b.share - a.share || a.source.localeCompare(b.source))
    : [];
}

// ---- who carried it

const timeOf = (p: Mention) => Date.parse(p.publishedAt ?? p.foundAt);

function nameOf(p: Mention): { key: string; name: string; outlet: boolean } {
  if (p.rivalId) {
    const own = p.rivalIsUs ? "Your own post" : `${p.rival ?? "A candidate"}'s own post`;
    return { key: `own:${p.rivalId}`, name: own, outlet: false };
  }
  const v = voiceOf(p);
  if (!v) return { key: `anon:${p.id}`, name: `A ${sourceName(p.source)} post`, outlet: false };
  return { key: v.key, name: v.name, outlet: v.key.startsWith("site:") };
}

export type Pickup = {
  id: string;
  url: string;
  at: string;
  name: string;
  platform: string;
  outlet: boolean;
  views: number | null;
  first: boolean;
};

/** Every post of the story in the order they were published; the first is the first we found. */
export function pickups(posts: Mention[]): Pickup[] {
  return [...posts]
    .sort(
      (a, b) =>
        timeOf(a) - timeOf(b) || a.foundAt.localeCompare(b.foundAt) || a.id.localeCompare(b.id),
    )
    .map((p, i) => {
      const who = nameOf(p);
      return {
        id: p.id,
        url: p.url,
        at: p.publishedAt ?? p.foundAt,
        name: who.name,
        platform: p.source,
        outlet: who.outlet,
        views: p.reach,
        first: i === 0,
      };
    });
}

export type Amplifier = {
  name: string;
  platform: string;
  views: number;
  mood: "angry" | "warm" | "neutral" | null;
};

/** The voices that carried the most views within the story. */
export function amplifiers(posts: Mention[], limit = 3): Amplifier[] {
  const by = new Map<string, { name: string; platform: string; views: number; moods: string[] }>();
  for (const p of posts) {
    const who = nameOf(p);
    const e = by.get(who.key) ?? { name: who.name, platform: p.source, views: 0, moods: [] };
    e.views += p.reach ?? 0;
    if (p.sentiment) e.moods.push(p.sentiment);
    by.set(who.key, e);
  }
  const mood = (ms: string[]): Amplifier["mood"] => {
    if (!ms.length) return null;
    const n = (m: string) => ms.filter((x) => x === m).length;
    return n("negative") * 2 > ms.length
      ? "angry"
      : n("positive") * 2 > ms.length
        ? "warm"
        : "neutral";
  };
  return [...by.values()]
    .filter((e) => e.views > 0)
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((e) => ({ name: e.name, platform: e.platform, views: e.views, mood: mood(e.moods) }));
}

// ---- reading it

/** How the story feels towards you, from the read posts (a post found by a rival's name does not vote). */
export function storyMood(posts: Mention[]): "angry" | "warm" | "mixed" | "unread" {
  const read = posts.filter(
    (p) =>
      p.topicKind !== "rival" &&
      (p.sentiment === "positive" || p.sentiment === "neutral" || p.sentiment === "negative"),
  );
  if (!read.length) return "unread";
  const n = (m: string) => read.filter((p) => p.sentiment === m).length;
  return n("negative") * 2 > read.length
    ? "angry"
    : n("positive") * 2 > read.length
      ? "warm"
      : "mixed";
}

/** Where it is being said, by the keywords that found it: the most, and the nearest in a tie. */
export function placeOf(posts: Mention[]): "local" | "county" | "national" {
  const count = { local: 0, county: 0, national: 0 };
  for (const p of posts) {
    const level = levelOf(p.topicKind);
    if (level) count[level === "seat" ? "local" : level === "county" ? "county" : "national"]++;
  }
  return count.local >= count.county && count.local >= count.national
    ? "local"
    : count.county >= count.national
      ? "county"
      : "national";
}

const MOOD_WORD = {
  angry: "Angry",
  warm: "Warm",
  mixed: "Mixed",
  unread: "Mood not read",
} as const;
const TREND_WORD = {
  climbing: "still climbing",
  settled: "settled",
  unchecked: "not checked lately",
} as const;

/**
 * What Brief voices opens for a story: the column of its place (local is the seat, national the
 * country) and its issue, or none when the issue says nothing.
 */
export function storyFocus(posts: Mention[], issue: string | null): BriefFocus {
  const place = placeOf(posts);
  return {
    level: place === "local" ? "seat" : place === "county" ? "county" : "country",
    issue: issue && !NO_ISSUE.has(issue) ? issue : null,
  };
}

/** The so-what line, in plain words, ending with what "first seen" does and does not mean. */
export function soWhat(s: {
  mood: "angry" | "warm" | "mixed" | "unread";
  place: "local" | "county" | "national";
  trend: "climbing" | "settled" | "unchecked";
  views: number;
  days: number;
  outlets: number;
}): string {
  const days = s.days < 1 ? "under a day" : `${s.days} ${s.days === 1 ? "day" : "days"}`;
  const outlets =
    s.outlets === 0
      ? "no outlet has run it"
      : `${s.outlets} ${s.outlets === 1 ? "outlet has" : "outlets have"} run it`;
  const views = `${nf.format(s.views)} ${s.views === 1 ? "view" : "views"}`;
  return `${MOOD_WORD[s.mood]}, ${s.place}, ${TREND_WORD[s.trend]}: ${views} in ${days}, ${outlets}. First seen means the first post we found, not proof of who started it.`;
}

/** Days a story has been going, rounded down, from its first post to now. */
export const daysGoing = (firstAt: string, now: number): number =>
  Math.max(0, Math.floor((now - Date.parse(firstAt)) / DAY));
