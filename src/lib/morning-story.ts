// This morning's story: written by the 06:00 step from the news Listening
// found, or by the team. Pure: what the AI says is checked here before it is
// kept, and the team's own story is cleaned the same way.

import { OFF_TOPIC } from "@/lib/top-of-mind";
import { voiceOf } from "@/lib/voices";

/** Where an item came from: the seat's own keywords, its county's, a rival's, or the national news. */
export type Scope = "seat" | "county" | "rival" | "national";
export const SCOPE_NAMES: Record<Scope, string> = {
  seat: "The seat",
  county: "County",
  rival: "Rivals",
  national: "National",
};

export type StoryLink = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  scope?: Scope;
  /** For a rival's item: whose. */
  about?: string;
};

/** One of the morning's items, numbered from 1 as the AI sees it. */
export type StoryItem = StoryLink & { n: number; text: string };

export type MorningStory = {
  /** "written": a story; "headlines": the morning's top links, without one. */
  kind: "written" | "headlines";
  headline: string | null;
  summary: string | null;
  why: string | null;
  rivals: string | null;
  line: string | null;
  figures: { value: string; label: string }[];
  sources: StoryLink[];
  /** The items the rivals' line rests on. */
  rivalSources: StoryLink[];
  /** What rivals put out lately, shown when the story has no line on them. */
  rivalsLately: StoryLink[];
  also: (StoryLink & { soWhat: string | null })[];
  /** The morning's items, to write another story from. */
  picks: StoryLink[];
  /** How many items it was written from. */
  from: number;
};

export type MentionRow = {
  title: string | null;
  snippet: string | null;
  url: string;
  source: string | null;
  domain: string | null;
  published_at: string | null;
  /** The kind of keyword that found it (listening_topics.kind), and its label. */
  kind?: string | null;
  label?: string | null;
  issue?: string | null;
  found_at?: string | null;
};

const isWeb = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/i.test(u);

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};

const linkOf = (i: StoryItem): StoryLink => ({
  title: i.title,
  url: i.url,
  source: i.source,
  publishedAt: i.publishedAt,
  ...(i.scope ? { scope: i.scope } : {}),
  ...(i.about ? { about: i.about } : {}),
});

export const scopeOf = (kind: string | null | undefined): Scope =>
  kind === "county" || kind === "national" || kind === "rival" ? kind : "seat";

/** How many of each the morning reads at most, so county and rival news always get a place. */
const SHARE: Record<Scope, number> = { seat: 18, county: 10, rival: 7, national: 5 };

const isAdvert = (t: string) => /#ad\b|\b(sponsored|promoted)\b/i.test(t);
const sameStory = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 60);

/**
 * The morning's items: titled web links, each once, no adverts or posts the sweep found to be
 * about somewhere else, the seat's own first, then the county's, the rivals' and the national
 * news, each to its share, then whatever fills the rest; numbered from 1. Within each, reports from
 * outlets we know come first, then other sites' reports, then posts on platforms, so a stream of
 * tweets never crowds out the news.
 */
export function storyItems(rows: MentionRow[], max = 40): StoryItem[] {
  const seen = new Set<string>();
  const pools: Record<Scope, StoryItem[]> = { seat: [], county: [], rival: [], national: [] };
  for (const r of rows) {
    const title = clip(r.title, 300);
    if (!title || !isWeb(r.url) || seen.has(r.url) || seen.has(sameStory(title))) continue;
    if (isAdvert(title) || r.issue === OFF_TOPIC || !/\p{L}/u.test(title)) continue;
    seen.add(r.url);
    seen.add(sameStory(title));
    const scope = scopeOf(r.kind);
    pools[scope].push({
      n: 0,
      title,
      url: r.url,
      source: r.domain ?? r.source ?? "web",
      publishedAt: r.published_at,
      scope,
      ...(scope === "rival" && r.label ? { about: r.label } : {}),
      text: [title, clip(r.snippet, 600)].filter(Boolean).join(" "),
    });
  }
  const order: Scope[] = ["seat", "county", "rival", "national"];
  const pool = (k: Scope) => [...pools[k]].sort((a, b) => rank(a) - rank(b));
  const first = order.flatMap((k) => pool(k).slice(0, SHARE[k]));
  const rest = order.flatMap((k) => pool(k).slice(SHARE[k]));
  return [...first, ...rest].slice(0, max).map((i, k) => ({ ...i, n: k + 1 }));
}

const PLATFORMS: Record<string, string> = {
  "x.com": "x",
  "twitter.com": "x",
  "facebook.com": "facebook",
  "instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "reddit.com": "reddit",
};
const PLATFORM_NAMES: Record<string, string> = {
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
};

const hostname = (u: string): string | null => {
  try {
    return new URL(u).hostname.replace(/^(www|m|mobile|web)\./, "");
  } catch {
    return null;
  }
};

/** A post on a platform (X, Facebook, Reddit…), as against a report by an outlet. */
export function isPost(l: Pick<StoryLink, "url">): boolean {
  const host = hostname(l.url);
  return host !== null && Object.hasOwn(PLATFORMS, host);
}

const OUTLETS: Record<string, string> = {
  "the-star.co.ke": "The Star",
  "nation.africa": "Nation",
  "standardmedia.co.ke": "The Standard",
  "citizen.digital": "Citizen Digital",
  "tuko.co.ke": "Tuko",
  "kenyans.co.ke": "Kenyans.co.ke",
  "peopledaily.digital": "People Daily",
  "capitalfm.co.ke": "Capital FM",
  "kbc.co.ke": "KBC",
  "kenyanews.go.ke": "Kenya News Agency",
  "theeastafrican.co.ke": "The EastAfrican",
  "businessdailyafrica.com": "Business Daily",
  "kahawatungu.com": "Kahawa Tungu",
  "mwakilishi.com": "Mwakilishi",
  "kiambu.go.ke": "Kiambu County",
  "eastleighvoice.co.ke": "Eastleigh Voice",
  "nairobileo.co.ke": "Nairobi Leo",
  "thekenyatimes.com": "The Kenya Times",
};

/**
 * How far a link can be trusted to say what happened: 0 a report from an outlet we know by name,
 * 1 a report from any other site, 2 a post on a platform.
 */
const rank = (l: Pick<StoryLink, "url">): 0 | 1 | 2 => {
  if (isPost(l)) return 2;
  const host = hostname(l.url);
  return host !== null && Object.hasOwn(OUTLETS, host) ? 0 : 1;
};

/** Who published a link, in words: "The Star", "@TheStarKenya on X", "Facebook". */
export function outletOf(l: Pick<StoryLink, "url" | "source">): string {
  const host = hostname(l.url);
  if (host === null) return l.source;
  const platform = PLATFORMS[host];
  if (!platform) return OUTLETS[host] ?? host;
  const v = voiceOf({ source: platform, url: l.url, author: null, domain: host });
  const where = PLATFORM_NAMES[platform] ?? host;
  return v && !/^\d+$/.test(v.name.replace(/^@/, "")) ? `${v.name} on ${where}` : where;
}

type Answer = {
  noStory?: unknown;
  headline?: unknown;
  summary?: unknown;
  why?: unknown;
  rivals?: unknown;
  line?: unknown;
  figures?: unknown;
  items?: unknown;
  rivalItems?: unknown;
  also?: unknown;
};
type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] =>
  Array.isArray(v) ? v.filter((x): x is Obj => Boolean(x) && typeof x === "object") : [];
const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

/**
 * The AI's story, if it holds up: it rests on at least one real item, and each
 * figure appears word for word in the item it cites. Null when it doesn't.
 */
export function checkStory(answer: unknown, items: StoryItem[]): MorningStory | null {
  const a = (answer && typeof answer === "object" ? answer : {}) as Answer;
  if (a.noStory === true) return null;
  const byN = new Map(items.map((i) => [i.n, i]));
  const lead = [...new Set(Array.isArray(a.items) ? a.items.map(Number) : [])]
    .map((n) => byN.get(n))
    .filter((i): i is StoryItem => Boolean(i));
  const headline = clip(a.headline, 160);
  const summary = clip(a.summary, 800);
  if (!lead.length || !headline || !summary) return null;

  const figures = list(a.figures)
    .flatMap((f) => {
      const value = clip(f["value"], 24);
      const label = clip(f["label"], 80);
      const from = byN.get(Number(f["item"]));
      return value && label && from && /\d/.test(value) && flat(from.text).includes(flat(value))
        ? [{ value, label }]
        : [];
    })
    .slice(0, 3);

  const used = new Set(lead.map((i) => i.n));
  const also = list(a.also)
    .flatMap((x) => {
      const i = byN.get(Number(x["item"]));
      if (!i || used.has(i.n)) return [];
      used.add(i.n);
      return [{ ...linkOf(i), soWhat: clip(x["soWhat"], 200) }];
    })
    .slice(0, 5);

  const rivalSources = [...new Set(Array.isArray(a.rivalItems) ? a.rivalItems.map(Number) : [])]
    .map((n) => byN.get(n))
    .filter((i): i is StoryItem => Boolean(i))
    .slice(0, 3)
    .map(linkOf);
  const rivals = clip(a.rivals, 400);

  return {
    kind: "written",
    headline,
    summary,
    why: clip(a.why, 400),
    // "Nothing from the rivals" is said by leaving the line out, not by printing it.
    rivals: rivals && !NO_RIVALS.test(rivals) ? rivals : null,
    line: clip(a.line, 300),
    figures,
    sources: lead.slice(0, 5).map(linkOf),
    rivalSources: rivals && !NO_RIVALS.test(rivals) ? rivalSources : [],
    rivalsLately: [],
    also,
    picks: items.slice(0, 12).map(linkOf),
    from: items.length,
  };
}

const NO_RIVALS = /^(rivals? (haven.?t|have not|has not|hasn.?t)|none|no rival)/i;

/** The rivals' latest: their own posts first, then items about them; three at most. */
export function rivalsLately(own: StoryLink[], items: StoryItem[]): StoryLink[] {
  return [...own, ...items.filter((i) => i.scope === "rival").map(linkOf)].slice(0, 3);
}

/** What an item says beyond its title. */
const bodyOf = (i: StoryItem): string =>
  (i.text.startsWith(i.title) ? i.text.slice(i.title.length) : i.text).trim();

/** An item with a sentence of its own beyond the title: what makes it worth leading with. */
const hasBody = (i: StoryItem) => bodyOf(i).length >= 20;

/**
 * The item a morning leads with when no story can be written: the seat's own first, then the
 * county's, the rivals' and the nation's, taking the first of each that has more than a bare title;
 * failing that, the first item there is. Local first, but never local only: a quiet seat leads with
 * the county or the nation, so the top of Home is never empty while there is any news at all.
 * What leads is trusted in this order: a report from an outlet we know by name, then one from any
 * other site, then (even a bare headline) before any post on a platform, which says what people are
 * saying, not what happened. So a ward keyword that matched a market-research page does not lead the
 * morning ahead of the county's story in the Standard.
 */
export function leadItem(items: StoryItem[]): StoryItem | null {
  const upTo = (r: 0 | 1 | 2) => items.filter((i) => rank(i) <= r);
  const withBody = (pool: StoryItem[]) => {
    for (const scope of ["seat", "county", "rival", "national"] as Scope[]) {
      const lead = pool.find((i) => i.scope === scope && hasBody(i));
      if (lead) return lead;
    }
    return undefined;
  };
  return (
    withBody(upTo(0)) ?? withBody(upTo(1)) ?? upTo(1)[0] ?? withBody(items) ?? items[0] ?? null
  );
}

/** The lead's own words after its title: its first two sentences, cut at a word if still long. */
const leadSummary = (i: StoryItem): string | null => {
  const body = bodyOf(i);
  if (body.length < 20) return null;
  // A sentence ends at . ! or ? followed by a space, so "1.1 million" stays whole.
  let end = body.length;
  let ends = 0;
  for (const m of body.matchAll(/[.!?]["”’)]?\s+/g)) {
    ends++;
    if (ends === 2) {
      end = (m.index ?? 0) + m[0].trimEnd().length;
      break;
    }
  }
  const text = body.slice(0, end).trim();
  if (text.length <= 320) return text;
  const cut = text.slice(0, 320);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 200)).trim()}…`;
};

/**
 * When no story can be written (the AI is down, or has nothing it can stand behind): the morning's
 * lead item as the headline, with its own words under it, and the other top links.
 */
export function headlinesStory(items: StoryItem[]): MorningStory {
  const lead = leadItem(items);
  const others = items.filter((i) => i.n !== lead?.n);
  // The top two of the seat's own, then the county's and the rest, so the county is never missing.
  const arranged = (pool: StoryItem[]) => [
    ...pool.filter((i) => i.scope !== "national").slice(0, 2),
    ...pool.filter((i) => i.scope === "county").slice(0, 2),
    ...pool,
  ];
  return {
    kind: "headlines",
    headline: lead ? lead.title.slice(0, 160) : null,
    summary: lead ? leadSummary(lead) : null,
    why: null,
    rivals: null,
    line: null,
    figures: [],
    sources: lead ? [linkOf(lead)] : [],
    rivalSources: [],
    rivalsLately: [],
    // Outlets' reports first, posts after: a quiet morning may still show a post, never ahead of the news.
    also: [...arranged(others.filter((i) => !isPost(i))), ...arranged(others.filter(isPost))]
      .filter((i, k, all) => all.findIndex((x) => x.n === i.n) === k)
      .slice(0, 6)
      .map((i) => ({ ...linkOf(i), soWhat: null })),
    picks: items.slice(0, 12).map(linkOf),
    from: items.length,
  };
}

export type TeamStoryInput = {
  headline?: unknown;
  summary?: unknown;
  why?: unknown;
  rivals?: unknown;
  line?: unknown;
  /** https links, one per source; none keeps the story's own. */
  links?: unknown;
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** The team's own story, or its edit of the morning's. */
export function cleanTeamStory(input: TeamStoryInput, prev: MorningStory | null): MorningStory {
  const headline = clip(input.headline, 160);
  if (!headline || headline.length < 4) throw new Error("Give the story a headline.");
  const summary = clip(input.summary, 800);
  if (!summary) throw new Error("Say what happened in a line or two.");
  const links = (Array.isArray(input.links) ? input.links : [])
    .map((l) => String(l ?? "").trim())
    .filter(Boolean);
  if (links.some((u) => !/^https:\/\/\S+$/i.test(u)))
    throw new Error("Links must start with https://.");
  return {
    kind: "written",
    headline,
    summary,
    why: clip(input.why, 400),
    rivals: clip(input.rivals, 400),
    line: clip(input.line, 300),
    // New links replace the sources, and the figures checked against the old ones go.
    figures: links.length ? [] : (prev?.figures ?? []),
    sources: links.length
      ? links
          .slice(0, 5)
          .map((url) => ({ title: hostOf(url), url, source: hostOf(url), publishedAt: null }))
      : (prev?.sources ?? []),
    rivalSources: prev?.rivalSources ?? [],
    rivalsLately: prev?.rivalsLately ?? [],
    also: prev?.also ?? [],
    picks: prev?.picks ?? [],
    from: prev?.from ?? 0,
  };
}

export type StoryRow = {
  day: string;
  story: unknown;
  written_by: string;
  created_at: string;
  edited_at: string | null;
};

export type StoryView = {
  day: string;
  story: MorningStory;
  writtenBy: "groundwork" | "team";
  /** When it was written, or last edited. */
  at: string;
  editedBy: string | null;
};

const SCOPES = new Set<string>(["seat", "county", "rival", "national"]);
const links = (v: unknown): StoryLink[] =>
  list(v).flatMap((l) => {
    if (!isWeb(l["url"])) return [];
    const scope = typeof l["scope"] === "string" && SCOPES.has(l["scope"]) ? l["scope"] : null;
    const about = clip(l["about"], 80);
    return [
      {
        title: clip(l["title"], 300) ?? l["url"],
        url: l["url"],
        source: clip(l["source"], 80) ?? "web",
        publishedAt: typeof l["publishedAt"] === "string" ? l["publishedAt"] : null,
        ...(scope ? { scope: scope as Scope } : {}),
        ...(about ? { about } : {}),
      },
    ];
  });

/** A stored story, read with care: a link off the web is left out, a malformed story is null. */
export function storyFromRow(r: StoryRow, editorName: string | null): StoryView | null {
  const s = (r.story && typeof r.story === "object" ? r.story : {}) as Obj;
  if (s["kind"] !== "written" && s["kind"] !== "headlines") return null;
  const story: MorningStory = {
    kind: s["kind"],
    headline: clip(s["headline"], 160),
    summary: clip(s["summary"], 800),
    why: clip(s["why"], 400),
    rivals: (() => {
      const r = clip(s["rivals"], 400);
      return r && !NO_RIVALS.test(r) ? r : null;
    })(),
    line: clip(s["line"], 300),
    figures: list(s["figures"])
      .flatMap((f) => {
        const value = clip(f["value"], 24);
        const label = clip(f["label"], 80);
        return value && label ? [{ value, label }] : [];
      })
      .slice(0, 3),
    sources: links(s["sources"]).slice(0, 5),
    rivalSources: links(s["rivalSources"]).slice(0, 3),
    rivalsLately: links(s["rivalsLately"]).slice(0, 3),
    also: list(s["also"])
      .flatMap((x) => links([x]).map((l) => ({ ...l, soWhat: clip(x["soWhat"], 200) })))
      .slice(0, 5),
    picks: links(s["picks"]).slice(0, 12),
    from: Number.isFinite(Number(s["from"])) ? Number(s["from"]) : 0,
  };
  if (story.kind === "written" && !story.headline) return null;
  return {
    day: r.day,
    story,
    writtenBy: r.written_by === "groundwork" ? "groundwork" : "team",
    at: r.edited_at ?? r.created_at,
    editedBy: editorName,
  };
}

/** A story with something in it: the team's, a written one, or headlines from real news. */
export const hasNews = (v: StoryView): boolean =>
  v.writtenBy === "team" || v.story.kind === "written" || v.story.from > 0;

/**
 * What Home shows: today's story when it has news; otherwise the latest earlier
 * one that had, until today's comes in; otherwise today's check, if any.
 * `earlier` is newest first.
 */
export function homeStory(today: StoryView | null, earlier: StoryView[]): StoryView | null {
  if (today && hasNews(today)) return today;
  return earlier.find(hasNews) ?? today;
}

const dayName = (day: string) =>
  new Date(`${day}T12:00:00+03:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Nairobi",
  });

/** Said over an earlier day's story shown while today's is not in; null for today's. */
export function carriedLine(v: StoryView, today: string): string | null {
  if (v.day >= today) return null;
  return `Today's story is not in yet. This is ${dayName(v.day)}'s, until it is.`;
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/** Who wrote the story, and when, in Nairobi's time. */
export function kicker(v: StoryView): string {
  const at = clock(v.at);
  if (v.writtenBy === "team")
    return `${v.editedBy ? `Edited by ${v.editedBy}` : "Written by the team"} at ${at}`;
  if (v.story.kind === "headlines") return `This morning's top stories, gathered at ${at}`;
  return `Written by Groundwork at ${at} from ${v.story.from} ${v.story.from === 1 ? "source" : "sources"}`;
}

/** What the story block says when there is no story: still loading, before 6:00, or a quiet morning. */
export function noStoryLine(loading: boolean, time: string): string {
  if (loading) return "Reading this morning's story…";
  return time < "06:00"
    ? "This morning's story is written at 6:00 from the news Listening finds."
    : "No news about the race in the last week.";
}
