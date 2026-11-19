// Listening's Report: a period's figures set against the period before. The headline numbers, the
// mood about you as one score and day by day, where the posts came from, the share of the
// conversation you hold against your rivals, and the phrases people use. Plain code, no AI: every
// number is a count of posts, and every row opens the posts it counts. Pure.
//
// Brought over from Daraja Pulse's Listening analytics (src/lib/listeningAnalytics.ts there) and
// put in Groundwork's words: warm, neutral and angry, you and your rivals, Nairobi days.

import type { Mention } from "@/lib/listening-mention";
import { sourceName } from "@/lib/listening-read";
import { addDays } from "@/lib/nairobi-date";
import { voiceOf } from "@/lib/voices";

export type ReportPost = Pick<
  Mention,
  | "id"
  | "topicId"
  | "topicKind"
  | "rivalId"
  | "source"
  | "domain"
  | "url"
  | "author"
  | "title"
  | "snippet"
  | "sentiment"
  | "publishedAt"
  | "foundAt"
  | "reach"
  | "shares"
>;

/** The most posts one row opens: as many as Listening reads by id at once (src/lib/posts-query.ts). */
export const IDS = 200;

const DAY = 86_400_000;
const NAIROBI = 3 * 3_600_000;

/** When a post happened: the time the platform gives, else when the sweep found it. */
function when(p: Pick<ReportPost, "publishedAt" | "foundAt">): number {
  const posted = p.publishedAt ? Date.parse(p.publishedAt) : Number.NaN;
  return Number.isNaN(posted) ? Date.parse(p.foundAt) : posted;
}

/**
 * The Nairobi day a post belongs to: the day it was posted, or found when the platform gives no
 * date. Nairobi is UTC+3 all year (as src/lib/nairobi-date.ts counts it), so this is arithmetic.
 */
export const postDay = (p: Pick<ReportPost, "publishedAt" | "foundAt">): string =>
  new Date(when(p) + NAIROBI).toISOString().slice(0, 10);

/** The posts that belong to the days `from` to `to`, both included. */
export const within = <T extends ReportPost>(posts: T[], span: { from: string; to: string }): T[] =>
  posts.filter((p) => {
    const d = postDay(p);
    return d >= span.from && d <= span.to;
  });

/** Posts about you: found by your own keywords (kind campaign), not a candidate's own post. */
export const aboutYou = <T extends ReportPost>(posts: T[]): T[] =>
  posts.filter((p) => p.topicKind === "campaign" && !p.rivalId);

const newestFirst = <T extends ReportPost>(posts: T[]): T[] =>
  [...posts].sort((a, b) => when(b) - when(a));

/** The posts a figure opens: newest first, up to IDS. */
export const newestIds = (posts: ReportPost[]): string[] =>
  newestFirst(posts)
    .slice(0, IDS)
    .map((p) => p.id);

const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** The change from the period before, to a whole percent; null when there is nothing before. */
export function percentChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

export type Figure = { value: number; before: number; change: number | null };
/** A figure only some platforms give: `from` and `fromBefore` count the posts that gave it. */
export type Reported = Figure & { from: number; fromBefore: number };
export type KeyFigures = { posts: Figure; views: Reported; shares: Reported; voices: Figure };

const figure = (value: number, before: number): Figure => ({
  value,
  before,
  change: percentChange(value, before),
});

function summed(posts: ReportPost[], key: "reach" | "shares"): { value: number; from: number } {
  let value = 0;
  let from = 0;
  for (const p of posts) {
    const v = p[key];
    if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
    value += Number(v);
    from++;
  }
  return { value, from };
}

const reported = (now: ReportPost[], before: ReportPost[], key: "reach" | "shares"): Reported => {
  const a = summed(now, key);
  const b = summed(before, key);
  return { ...figure(a.value, b.value), from: a.from, fromBefore: b.from };
};

/** Accounts and outlets that posted, each once (src/lib/voices.ts names them). */
const voiceCount = (posts: ReportPost[]) =>
  new Set(posts.map((p) => voiceOf(p)?.key).filter(Boolean)).size;

/** The headline numbers for a period's posts, each against the period before. */
export function keyFigures(now: ReportPost[], before: ReportPost[]): KeyFigures {
  return {
    posts: figure(now.length, before.length),
    views: reported(now, before, "reach"),
    shares: reported(now, before, "shares"),
    voices: figure(voiceCount(now), voiceCount(before)),
  };
}

export type Verdict = "Mostly warm" | "Mostly neutral" | "Mostly angry" | "Mixed";
export type MoodScore = {
  posts: number;
  /** Posts whose mood was read. */
  read: number;
  warm: number;
  neutral: number;
  angry: number;
  unread: number;
  /** The warm share less the angry share of the posts read, -100 to 100; null when none was read. */
  net: number | null;
  verdict: Verdict | null;
};

/** The mood of a set of posts as one score, and the mood that holds at least half of those read. */
export function moodScore(posts: ReportPost[]): MoodScore {
  const m = { warm: 0, neutral: 0, angry: 0, unread: 0 };
  for (const p of posts) {
    if (p.sentiment === "positive") m.warm++;
    else if (p.sentiment === "neutral") m.neutral++;
    else if (p.sentiment === "negative") m.angry++;
    else m.unread++;
  }
  const read = m.warm + m.neutral + m.angry;
  const moods = [
    ["Mostly warm", m.warm],
    ["Mostly neutral", m.neutral],
    ["Mostly angry", m.angry],
  ] as const;
  // A mood leads when it holds at least half of the posts read and more than each other mood.
  const top = moods.find(
    ([word, n]) => n * 2 >= read && moods.every(([w, o]) => w === word || o < n),
  );
  return {
    posts: posts.length,
    read,
    ...m,
    net: read ? Math.round(((m.warm - m.angry) / read) * 100) : null,
    verdict: read ? (top ? top[0] : "Mixed") : null,
  };
}

export type MoodDay = {
  day: string;
  warm: number;
  neutral: number;
  angry: number;
  unread: number;
  /** The day's posts, newest first, up to IDS. */
  ids: string[];
};

/** Posts per Nairobi day and mood across the days `from` to `to`, oldest first, empty days kept. */
export function moodDays(posts: ReportPost[], span: { from: string; to: string }): MoodDay[] {
  const out = new Map<string, MoodDay>();
  for (let day = span.from; day <= span.to; day = addDays(day, 1))
    out.set(day, { day, warm: 0, neutral: 0, angry: 0, unread: 0, ids: [] });
  for (const p of newestFirst(posts)) {
    const row = out.get(postDay(p));
    if (!row) continue;
    if (p.sentiment === "positive") row.warm++;
    else if (p.sentiment === "neutral") row.neutral++;
    else if (p.sentiment === "negative") row.angry++;
    else row.unread++;
    if (row.ids.length < IDS) row.ids.push(p.id);
  }
  return [...out.values()];
}

/** The day with the most warm posts and the day with the most angry (the later day on a tie). */
export function moodPeaks(days: MoodDay[]): { warm: MoodDay | null; angry: MoodDay | null } {
  const peak = (mood: "warm" | "angry") =>
    days.reduce<MoodDay | null>(
      (best, d) => (d[mood] > 0 && d[mood] >= (best?.[mood] ?? 0) ? d : best),
      null,
    );
  return { warm: peak("warm"), angry: peak("angry") };
}

export type Row = {
  key: string;
  label: string;
  posts: number;
  /** Of all the rows' posts, to one decimal. */
  share: number;
  /** Views summed where the platform counts them; null when none did. */
  views: number | null;
  /** The row's posts, newest first, up to IDS. */
  ids: string[];
};

function row(key: string, label: string, posts: ReportPost[]): Omit<Row, "share"> {
  const seen = summed(posts, "reach");
  return {
    key,
    label,
    posts: posts.length,
    views: seen.from ? seen.value : null,
    ids: newestIds(posts),
  };
}

/** Where the posts were found, the busiest platform first. */
export function sourceMix(posts: ReportPost[]): Row[] {
  const by = new Map<string, ReportPost[]>();
  for (const p of posts) {
    const list = by.get(p.source);
    if (list) list.push(p);
    else by.set(p.source, [p]);
  }
  return [...by.entries()]
    .map(([source, list]) => ({
      ...row(source, sourceName(source), list),
      share: share(list.length, posts.length),
    }))
    .sort((a, b) => b.posts - a.posts || a.label.localeCompare(b.label));
}

export type VoiceShare = Row & { kind: "you" | "rival" };

/**
 * The share of the conversation you hold against each rival: your own keywords' posts as one
 * voice, each rival keyword as its own. Issue, county and national keywords are the conversation
 * the candidates compete in, not a voice in it, so they are left out, as are the candidates' own
 * posts. A post belongs to the keyword that found it first (Listening keeps each address once per
 * campaign), so a post naming you and a rival counts for one of you only. A paused rival keyword
 * with nothing found is left out. Empty when no rival is followed: there is nothing to compare.
 */
export function shareOfVoice(
  topics: { id: string; label: string; kind: string; active: boolean }[],
  posts: ReportPost[],
): VoiceShare[] {
  const rivals = topics.filter((t) => t.kind === "rival");
  if (!rivals.length) return [];
  const said = posts.filter((p) => !p.rivalId);
  const rows: Omit<VoiceShare, "share">[] = [
    {
      ...row(
        "you",
        "You",
        said.filter((p) => p.topicKind === "campaign"),
      ),
      kind: "you" as const,
    },
    ...rivals.map((t) => ({
      ...row(
        t.id,
        t.label,
        said.filter((p) => p.topicId === t.id),
      ),
      kind: "rival" as const,
    })),
  ].filter((r) => r.kind === "you" || r.posts > 0 || rivals.find((t) => t.id === r.key)?.active);
  const total = rows.reduce((s, r) => s + r.posts, 0);
  return rows
    .map((r) => ({ ...r, share: share(r.posts, total) }))
    .sort(
      (a, b) =>
        b.posts - a.posts ||
        (a.kind === "you" ? -1 : b.kind === "you" ? 1 : 0) ||
        a.label.localeCompare(b.label),
    );
}

export type Phrase = { phrase: string; posts: number; ids: string[] };

// Words that join a sentence rather than say what it is about, in English, Kiswahili and Sheng, the
// words every social post carries, and a headline's own filler. A filler word breaks a phrase, so
// "chapati na masala chai" gives "masala chai". (Daraja Pulse's list, with headline words added.)
const FILLER = new Set(
  `
a about above after again against ago all almost also always am among an and another any anyone anything are around as at away
back be because been before being below between both but by can cannot could did do does doing done down during each either else
enough even ever every everyone everything few for from further get gets getting give go goes going gone gonna got gotta had has
have having he her here hers herself him himself his how however i if in instead into is it its itself just keep know least less let
lets like ll lot lots made make makes many may me might mine more most much must my myself need needs never next no nobody none nor
not nothing now of off often oh ok okay on once one only or other others our ours ourselves out over own per please put quite rather
re really s said same say says see seen she should since so some someone something sometimes soon still such sure t take than thank
thanks that the their theirs them themselves then there these they thing things think this those though through till to too under
until up upon ur us use used very via was way we well were what whatever when where whether which while who whom whose why will with
within without would yeah yes yet you your yours yourself yourselves u ya yo hey hi hello wow lol lmao omg haha hahaha pls plz
im i'm i've ive i'll i'd you're youre you've you'll he's she's it's we're we've they're they've that's thats there's theres what's
whats who's here's let's don't dont doesn't doesnt didn't didnt isn't isnt aren't wasn't weren't won't wont can't cant couldn't
shouldn't wouldn't haven't hasn't hadn't ain't
na ya wa za la kwa ni katika hii hizi huu hiyo hayo haya huo hao hawa huyu yule ile ule hicho hiki kile vile hivi hivyo kama lakini
au ama pia sana tu hapa pale huko kuna kuwa yangu yako yake yetu yenu yao wangu wako wake wetu wenu mimi wewe yeye sisi nyinyi ninyi
ndio ndiyo hapana nini gani je si hata bila zaidi kila baada kabla sasa tena bado kwenye kutoka mpaka hadi ili kwamba ambayo ambao
ambaye ambapo cha vya mwa pa ku nami nawe naye nasi nao wote yote zote vyote nina una ana tuna mna wana sina huna hana hatuna
aje niaje manze buda msee bana basi ati eti yaani
video videos vid tiktok tiktoks instagram insta ig youtube yt reel reels short shorts subscribe subscribed subscribers follow
following followers comment comments share shared link bio watch watching channel full part episode ep live post posts duet stitch
breaking latest news update updates today exclusive photos
`
    .trim()
    .split(/\s+/),
);

/** Hashtags nearly every video carries, which say nothing about what it is about. */
const noiseTag = (tag: string) =>
  /^(fy+p+|for_?you|(go)?viral|trending|trend$|explore|reels?$|insta(gram|good|daily)?$|tiktok|kenyantiktok|youtube|shorts?$|capcut|xyzbca|parati$|duet$|stitch$|creatorsearchinsights$)/u.test(
    tag,
  );

/** The two-word phrases and hashtags in one post, each once. */
function postPhrases(p: ReportPost): Set<string> {
  const found = new Set<string>();
  const text = [p.title, p.snippet]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, "\n")
    .replace(/@[\p{L}\p{N}_.]+/gu, "\n")
    .replace(/[’`]/g, "'")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ");
  // Anything but letters, numbers, hashtags, apostrophes and spaces ends a phrase.
  for (const part of text.split(/[^\p{L}\p{N}#' \t]+/u)) {
    let previous: string | null = null;
    for (const raw of part.split(/[ \t]+/)) {
      const word = raw.replace(/^'+|'+$/g, "").replace(/'s$/, "");
      if (word.startsWith("#")) {
        const tag = word.replace(/#/g, "");
        if (tag.length >= 3 && /\p{L}/u.test(tag) && !noiseTag(tag)) found.add(`#${tag}`);
        previous = null;
      } else if (
        word.length < 2 ||
        FILLER.has(word) ||
        /^\p{N}+$/u.test(word) ||
        word.includes("#")
      ) {
        previous = null;
      } else {
        if (previous) found.add(`${previous} ${word}`);
        previous = word;
      }
    }
  }
  return found;
}

/**
 * What people say: two-word phrases and hashtags, each counted once per post, most used first. A
 * phrase in a single post is left out unless `minPosts` is 1, which the period before uses so a
 * comparison sees every phrase.
 */
export function popularPhrases(posts: ReportPost[], minPosts = 2): Phrase[] {
  const found = new Map<string, Phrase>();
  for (const p of newestFirst(posts)) {
    for (const phrase of postPhrases(p)) {
      const f = found.get(phrase) ?? { phrase, posts: 0, ids: [] };
      f.posts++;
      if (f.ids.length < IDS) f.ids.push(p.id);
      found.set(phrase, f);
    }
  }
  return [...found.values()]
    .filter((f) => f.posts >= minPosts)
    .sort((a, b) => b.posts - a.posts || a.phrase.localeCompare(b.phrase));
}

export type PhraseRow = Phrase & { before: number; change: number | null; score: number };

/** The top phrases, each scored against the first (100) and set against the period before. */
export function phraseTable(now: Phrase[], before: Phrase[], limit = 10): PhraseRow[] {
  const then = new Map(before.map((p) => [p.phrase, p.posts]));
  const top = now[0]?.posts ?? 0;
  return now.slice(0, limit).map((p) => {
    const b = then.get(p.phrase) ?? 0;
    return {
      ...p,
      before: b,
      change: percentChange(p.posts, b),
      score: top ? Math.round((p.posts / top) * 100) : 0,
    };
  });
}

/**
 * The lanes the sweep still reads: the news, X, and ScrapeCreators' TikTok, YouTube and Reddit
 * search and the candidates' own Facebook pages. Instagram and the open web came through a web
 * search the sweep stopped paying for on 30 October 2026, so their silence says nothing.
 */
export const LIVE_SOURCES = ["news", "x", "tiktok", "youtube", "reddit", "facebook"] as const;

/** Lanes that found nothing for `days` days (three), the most recent first; lanes never seen are left out. */
export function quietSources(
  latest: Partial<Record<string, string | null>>,
  now = Date.now(),
  days = 3,
): { source: string; since: string }[] {
  const out: { source: string; since: string }[] = [];
  for (const source of LIVE_SOURCES) {
    const since = latest[source];
    if (since && now - Date.parse(since) > days * DAY) out.push({ source, since });
  }
  return out.sort((a, b) => b.since.localeCompare(a.since));
}
