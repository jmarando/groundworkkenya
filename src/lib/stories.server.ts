// The hourly story job. For each campaign with an active keyword, the posts of the last week are
// grouped into stories (src/lib/stories.ts, plain code), saved with their counts, and each new story
// is named by the AI from its first posts, or by its first headline when the AI is off or fails. A
// saved story keeps its id and its name; a post that no longer matches is let go. A story is what was
// published, and nothing here records or guesses anyone's community. Server only.

import { askAiJson } from "@/lib/listening.server";
import { groupStories, type SavedStory, type StoryPost } from "@/lib/stories";
import { OFF_TOPIC } from "@/lib/top-of-mind";
import { voiceOf } from "@/lib/voices";

type AnyClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the service-role Supabase client, loosely
  from: (table: string) => any;
};

const DAY = 86_400_000;
const WINDOW_DAYS = 7;
const NAMES_PER_RUN = 8;
const PAGE = 1000;
const CAP = 3000;
const CHUNK = 200;
const COLUMNS =
  "id, url, source, domain, author, title, snippet, published_at, found_at, refers_to, story_id, reach, sentiment, issue, topic_id, rival_id";
const NO_ISSUE = new Set(["general", "campaign", OFF_TOPIC]);

type Row = {
  id: string;
  url: string;
  source: string;
  domain: string | null;
  author: string | null;
  title: string | null;
  snippet: string | null;
  published_at: string | null;
  found_at: string;
  refers_to: string | null;
  story_id: string | null;
  reach: number | null;
  sentiment: string | null;
  issue: string | null;
  topic_id: string | null;
  rival_id: string | null;
};

/** Gives a story a short name from its first posts, or null when it cannot. */
export type Namer = (
  posts: { title: string | null; snippet: string | null; source: string }[],
) => Promise<string | null>;

export type StoriesRun = {
  ran: boolean;
  campaigns: number;
  stories: number;
  created: number;
  named: number;
  notes: string[];
};

/** A post's first line, without links, cut at 60 characters at a word: what stands in for a name. */
export function headlineOf(p: { title: string | null; snippet: string | null }): string {
  const raw = (p.title && p.title.trim()) || (p.snippet && p.snippet.trim()) || "";
  const line = (raw.split("\n")[0] ?? "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return "A story we are following";
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(line[60] === " " || space < 1 ? cut : cut.slice(0, space)).trim()}…`;
}

/** A name from the AI, tidied: no quotation marks, eight words at most. */
function tidyName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .join(" ")
    .slice(0, 120)
    .trim();
  return name || null;
}

const NAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: { title: { type: "string" } },
};

const aiNamer: Namer = async (posts) => {
  const prompt = [
    "You name one story that Kenyan news and social posts are spreading, for a campaign team.",
    "Give it a short plain title of eight words or fewer, in English, saying what happened.",
    "No quotation marks, no hashtags, and never blame a person or a community.",
    "",
    JSON.stringify(
      posts.slice(0, 3).map((p) => ({
        source: p.source,
        text: (p.snippet ?? p.title ?? "").slice(0, 400),
      })),
    ),
  ].join("\n");
  const answer = await askAiJson<{ title?: string }>(
    prompt,
    "story_name",
    NAME_SCHEMA,
    30_000,
    "read",
  );
  return answer.title ?? null;
};

const chunks = <T>(xs: T[], n = CHUNK): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

async function loadRows(sb: AnyClient, campaignId: string, since: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; rows.length < CAP; from += PAGE) {
    const { data, error } = await sb
      .from("listening_mentions")
      .select(COLUMNS)
      .eq("campaign_id", campaignId)
      .gte("found_at", since)
      .order("found_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error("The posts could not be read.");
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

const timeOf = (p: Pick<StoryPost, "publishedAt" | "foundAt">) =>
  new Date(p.publishedAt ?? p.foundAt).toISOString();

export async function runStories(
  sb: AnyClient,
  opts: { now?: number; name?: Namer } = {},
): Promise<StoriesRun> {
  const name = opts.name ?? aiNamer;
  const now = opts.now ?? Date.now();
  const since = new Date(now - WINDOW_DAYS * DAY).toISOString();
  const out: StoriesRun = { ran: true, campaigns: 0, stories: 0, created: 0, named: 0, notes: [] };

  const { data: topics } = await sb
    .from("listening_topics")
    .select("id, campaign_id, kind, active");
  const kindById = new Map(
    ((topics ?? []) as { id: string; kind: string }[]).map((t) => [t.id, t.kind]),
  );
  const campaigns = [
    ...new Set(
      ((topics ?? []) as { campaign_id: string | null; active: boolean }[])
        .filter((t) => t.active && t.campaign_id)
        .map((t) => t.campaign_id as string),
    ),
  ];
  let namesLeft = NAMES_PER_RUN;

  for (const campaign of campaigns) {
    try {
      const rows = (await loadRows(sb, campaign, since)).filter((r) => r.issue !== OFF_TOPIC);
      const posts: StoryPost[] = rows.map((r) => ({
        id: r.id,
        url: r.url,
        source: r.source,
        voiceKey:
          voiceOf({ source: r.source, url: r.url, author: r.author, domain: r.domain })?.key ??
          null,
        title: r.title,
        snippet: r.snippet,
        publishedAt: r.published_at,
        foundAt: r.found_at,
        refersTo: r.refers_to,
        storyId: r.story_id,
        reach: r.reach,
        sentiment: r.sentiment,
        issue: r.issue,
        topicKind: r.topic_id ? (kindById.get(r.topic_id) ?? null) : null,
        rivalId: r.rival_id,
      }));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const postById = new Map(posts.map((p) => [p.id, p]));

      const savedIds = [...new Set(posts.map((p) => p.storyId).filter((id): id is string => !!id))];
      const savedRows: {
        id: string;
        title: string;
        created_at: string;
        first_mention_id: string | null;
      }[] = [];
      for (const part of chunks(savedIds)) {
        const { data } = await sb
          .from("listening_stories")
          .select("id, title, created_at, first_mention_id")
          .eq("campaign_id", campaign)
          .in("id", part);
        savedRows.push(...(data ?? []));
      }
      const saved: SavedStory[] = savedRows.map((s) => ({
        id: s.id,
        createdAt: s.created_at,
        postIds: posts.filter((p) => p.storyId === s.id).map((p) => p.id),
      }));
      const savedById = new Map(savedRows.map((s) => [s.id, s]));

      const groups = groupStories(posts, saved);
      out.campaigns++;
      out.stories += groups.length;

      // What each story now holds.
      const facts = groups.map((g) => {
        const members = g.postIds.map((id) => postById.get(id)!);
        const times = members.map(timeOf).sort();
        const counted = members.filter((m) => m.reach !== null);
        const issues = new Map<string, number>();
        for (const m of members)
          if (m.issue && !NO_ISSUE.has(m.issue))
            issues.set(m.issue, (issues.get(m.issue) ?? 0) + 1);
        return {
          g,
          members,
          row: {
            first_mention_id: g.firstId,
            first_seen_at: times[0]!,
            last_post_at: times[times.length - 1]!,
            posts: members.length,
            voices: new Set(members.map((m) => m.voiceKey ?? `anon:${m.id}`)).size,
            views: counted.length ? counted.reduce((t, m) => t + (m.reach ?? 0), 0) : null,
            issue:
              [...issues.entries()].sort(
                (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
              )[0]?.[0] ?? null,
            updated_at: new Date(now).toISOString(),
          },
        };
      });

      // Keep the stories we had, add the new ones.
      const storyIdOf = new Map<string, string>(); // group's first post id → story id
      const toName: { storyId: string; members: StoryPost[] }[] = [];
      const fresh = facts.filter((f) => !f.g.savedId);
      for (const f of facts.filter((x) => x.g.savedId)) {
        const id = f.g.savedId!;
        storyIdOf.set(f.g.firstId, id);
        await sb.from("listening_stories").update(f.row).eq("id", id);
        const was = savedById.get(id)!;
        const first = byId.get(f.g.firstId)!;
        // Still carrying the stand-in headline, or its first post changed: it wants a name.
        if (was.title === headlineOf(first) || was.first_mention_id !== f.g.firstId)
          toName.push({ storyId: id, members: f.members });
      }
      if (fresh.length) {
        const { data, error } = await sb
          .from("listening_stories")
          .insert(
            fresh.map((f) => ({
              campaign_id: campaign,
              title: headlineOf(byId.get(f.g.firstId)!),
              ...f.row,
            })),
          )
          .select("id");
        if (error || !data) throw new Error("The stories could not be saved.");
        fresh.forEach((f, i) => {
          storyIdOf.set(f.g.firstId, (data as { id: string }[])[i]!.id);
          toName.push({ storyId: (data as { id: string }[])[i]!.id, members: f.members });
        });
        out.created += fresh.length;
      }

      // Posts take their story's id; a post that is in none lets go of the one it had.
      const assigned = new Map<string, string>();
      for (const f of facts)
        for (const id of f.g.postIds) assigned.set(id, storyIdOf.get(f.g.firstId)!);
      const join = [...assigned].filter(([id, story]) => postById.get(id)!.storyId !== story);
      const byStory = new Map<string, string[]>();
      for (const [id, story] of join) byStory.set(story, [...(byStory.get(story) ?? []), id]);
      for (const [story, ids] of byStory)
        for (const part of chunks(ids))
          await sb.from("listening_mentions").update({ story_id: story }).in("id", part);
      const letGo = posts.filter((p) => p.storyId && !assigned.has(p.id)).map((p) => p.id);
      for (const part of chunks(letGo))
        await sb.from("listening_mentions").update({ story_id: null }).in("id", part);

      // A saved story nothing claims any more holds no posts.
      const claimed = new Set(storyIdOf.values());
      const dissolved = savedRows.map((s) => s.id).filter((id) => !claimed.has(id));
      for (const part of chunks(dissolved))
        await sb
          .from("listening_stories")
          .update({ posts: 0, voices: 0, updated_at: new Date(now).toISOString() })
          .in("id", part);

      // Names, a few an hour; the rest keep their headline until the next run.
      for (const item of toName) {
        if (namesLeft <= 0) break;
        namesLeft--;
        try {
          const title = tidyName(
            await name(
              item.members
                .slice(0, 3)
                .map((m) => ({ title: m.title, snippet: m.snippet, source: m.source })),
            ),
          );
          if (title) {
            await sb.from("listening_stories").update({ title }).eq("id", item.storyId);
            out.named++;
          }
        } catch {
          // The headline stands in; the next run tries again.
        }
      }
    } catch (e) {
      out.notes.push(e instanceof Error ? e.message : "A campaign's stories could not be formed.");
    }
  }
  return out;
}
