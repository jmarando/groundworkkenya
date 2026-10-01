// This morning's story: written by the 06:00 step from the news Listening
// found, or by the team. Pure: what the AI says is checked here before it is
// kept, and the team's own story is cleaned the same way.

export type StoryLink = { title: string; url: string; source: string; publishedAt: string | null };

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
});

/** The morning's items: titled web links, each once, numbered from 1. */
export function storyItems(rows: MentionRow[], max = 40): StoryItem[] {
  const seen = new Set<string>();
  const out: StoryItem[] = [];
  for (const r of rows) {
    const title = clip(r.title, 300);
    if (!title || !isWeb(r.url) || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({
      n: out.length + 1,
      title,
      url: r.url,
      source: r.domain ?? r.source ?? "web",
      publishedAt: r.published_at,
      text: [title, clip(r.snippet, 600)].filter(Boolean).join(" "),
    });
    if (out.length >= max) break;
  }
  return out;
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

  return {
    kind: "written",
    headline,
    summary,
    why: clip(a.why, 400),
    rivals: clip(a.rivals, 400),
    line: clip(a.line, 300),
    figures,
    sources: lead.slice(0, 5).map(linkOf),
    also,
    picks: items.slice(0, 12).map(linkOf),
    from: items.length,
  };
}

/** When no story can be written: the morning's top five links. */
export function headlinesStory(items: StoryItem[]): MorningStory {
  return {
    kind: "headlines",
    headline: null,
    summary: null,
    why: null,
    rivals: null,
    line: null,
    figures: [],
    sources: [],
    also: items.slice(0, 5).map((i) => ({ ...linkOf(i), soWhat: null })),
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

const links = (v: unknown): StoryLink[] =>
  list(v).flatMap((l) =>
    isWeb(l["url"])
      ? [
          {
            title: clip(l["title"], 300) ?? l["url"],
            url: l["url"],
            source: clip(l["source"], 80) ?? "web",
            publishedAt: typeof l["publishedAt"] === "string" ? l["publishedAt"] : null,
          },
        ]
      : [],
  );

/** A stored story, read with care: a link off the web is left out, a malformed story is null. */
export function storyFromRow(r: StoryRow, editorName: string | null): StoryView | null {
  const s = (r.story && typeof r.story === "object" ? r.story : {}) as Obj;
  if (s["kind"] !== "written" && s["kind"] !== "headlines") return null;
  const story: MorningStory = {
    kind: s["kind"],
    headline: clip(s["headline"], 160),
    summary: clip(s["summary"], 800),
    why: clip(s["why"], 400),
    rivals: clip(s["rivals"], 400),
    line: clip(s["line"], 300),
    figures: list(s["figures"])
      .flatMap((f) => {
        const value = clip(f["value"], 24);
        const label = clip(f["label"], 80);
        return value && label ? [{ value, label }] : [];
      })
      .slice(0, 3),
    sources: links(s["sources"]).slice(0, 5),
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
    : "No news about the race in the last day.";
}
