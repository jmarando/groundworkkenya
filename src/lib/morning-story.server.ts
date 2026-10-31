// This morning's story, written once a day for each campaign from the news
// Listening found in the last two days, or the last week when those were thin (server only). It rides on the hourly call
// and keeps its own clock: its first run at or after 06:00 Nairobi time. A
// story already there (the team's, or an earlier run's) is never replaced. The
// shared job row says what happened in counts only.

import { nairobiToday } from "@/lib/nairobi-date";
import { askAiJson, PauseError } from "@/lib/listening.server";
import {
  checkStory,
  headlinesStory,
  outletOf,
  rivalsLately,
  SCOPE_NAMES,
  storyItems,
  type MentionRow,
  type MorningStory,
  type StoryItem,
  type StoryLink,
} from "@/lib/morning-story";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const JOB_KEY = "morning_story";

/** 06:00 on a Nairobi day, as a moment. */
const sixOn = (day: string) => Date.parse(`${day}T06:00:00+03:00`);

/** 20:00 on a Nairobi day: after it, a morning that fell back to headlines is left as it is. */
const eveningOn = (day: string) => Date.parse(`${day}T20:00:00+03:00`);

/** How long a provider pause keeps the AI off before it is tried again. */
const PROBE_AFTER = 6 * 3600_000;

export const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "noStory",
    "headline",
    "summary",
    "why",
    "rivals",
    "rivalItems",
    "line",
    "figures",
    "items",
    "also",
  ],
  properties: {
    noStory: { type: "boolean" },
    headline: { type: "string" },
    summary: { type: "string" },
    why: { type: "string" },
    rivals: { type: "string" },
    rivalItems: { type: "array", items: { type: "integer" } },
    line: { type: "string" },
    figures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "label", "item"],
        properties: {
          value: { type: "string" },
          label: { type: "string" },
          item: { type: "integer" },
        },
      },
    },
    items: { type: "array", items: { type: "integer" } },
    also: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "soWhat"],
        properties: { item: { type: "integer" }, soWhat: { type: "string" } },
      },
    },
  },
};

export type CampaignInfo = {
  id: string | null;
  name: string;
  candidate: string | null;
  seat: string;
  /** "kiambu/githunguri": the county comes first. */
  map_area?: string | null;
};

/** "Kiambu" from the campaign's map area; null when it has none. */
export const countyOf = (c: CampaignInfo): string | null => {
  const k = String(c.map_area ?? "")
    .split("/")[0]
    ?.trim();
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : null;
};

/** Fewer fresh items than this and the morning reaches back a week, so it is never left empty. */
const THIN = 6;

export type Gathered = {
  items: StoryItem[];
  /** How far back the items reach: two days, or a week when the last two were thin. */
  days: number;
  /** What rivals (not our candidate) posted in the last week, said in a line each. */
  said: string[];
  /** The same posts, as links, newest first. */
  saidLinks: StoryLink[];
  rivals: string[];
};

/**
 * The last day's news for one campaign, and what its rivals posted. With a
 * campaign id (the server's key) it filters by campaign; without one (the
 * signed-in person's client) row level security does.
 */
export async function gather(sb: Client, campaignId: string | null, now: Date): Promise<Gathered> {
  // Two days of news, so a quiet night still leaves the county's and the rivals' stories.
  const since48 = new Date(now.getTime() - 48 * 3600_000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const own = <T>(q: T): T =>
    campaignId
      ? (q as unknown as { eq: (c: string, v: string) => T }).eq("campaign_id", campaignId)
      : q;
  const newsSince = (since: string) =>
    own(
      sb
        .from("listening_mentions")
        .select(
          "title, snippet, url, source, domain, published_at, found_at, issue, listening_topics(kind, label)",
        )
        .is("rival_id", null)
        .gte("found_at", since),
    )
      .order("found_at", { ascending: false })
      .limit(240);
  const [{ data: rows }, { data: rivals }, { data: posts }] = await Promise.all([
    newsSince(since48),
    own(sb.from("race_rivals").select("id, name, is_us")),
    own(
      sb
        .from("listening_mentions")
        .select("rival_id, source, domain, url, title, published_at")
        .not("rival_id", "is", null)
        .gte("published_at", since7d),
    )
      .order("published_at", { ascending: false })
      .limit(12),
  ]);
  const names = new Map(
    ((rivals ?? []) as { id: string; name: string; is_us: boolean }[])
      .filter((r) => !r.is_us)
      .map((r) => [r.id, r.name]),
  );
  const theirs = (
    (posts ?? []) as {
      rival_id: string;
      source: string;
      domain: string | null;
      url: string;
      title: string | null;
      published_at: string | null;
    }[]
  ).filter((p) => names.has(p.rival_id) && p.title && /^https?:\/\//i.test(p.url));
  const asMentions = (data: unknown) =>
    (
      (data ?? []) as (MentionRow & { listening_topics: { kind: string; label: string } | null })[]
    ).map(({ listening_topics: t, ...r }) => ({
      ...r,
      kind: t?.kind ?? null,
      label: t?.label ?? null,
    }));
  let items = storyItems(asMentions(rows));
  let days = 2;
  // A quiet seat (a ward with little coverage, a night with none) still gets a morning: reach back
  // a week, newest first, and let the dates on the items say how old they are.
  if (items.length < THIN) {
    const { data: wider } = await newsSince(since7d);
    const more = storyItems(asMentions(wider));
    if (more.length > items.length) {
      items = more;
      days = 7;
    }
  }
  return {
    items,
    days,
    said: theirs.map(
      (p) =>
        `${names.get(p.rival_id)} on ${p.source}, ${p.published_at?.slice(0, 10) ?? "undated"}: "${p.title!.slice(0, 200)}"`,
    ),
    saidLinks: theirs.map((p) => ({
      title: p.title!.slice(0, 300),
      url: p.url,
      source: p.domain ?? p.source,
      publishedAt: p.published_at,
      scope: "rival" as const,
      about: names.get(p.rival_id)!,
    })),
    rivals: [...names.values()],
  };
}

function storyPrompt(c: CampaignInfo, g: Gathered, lead?: string): string {
  const who = c.candidate ?? c.name;
  const county = countyOf(c);
  const leadItem = lead ? g.items.find((i) => i.url === lead) : undefined;
  const tag = (i: StoryItem) =>
    i.scope === "county" && county
      ? `${county} County`
      : i.scope === "rival" && i.about
        ? `About ${i.about}`
        : SCOPE_NAMES[i.scope ?? "seat"];
  return [
    `You write the morning briefing for the campaign of ${who}, running for ${c.seat}.`,
    g.days > 2
      ? "Below are the news and social posts found in the last week, newest first, numbered, each marked with"
      : "Below are the news and social posts found in the last two days, numbered, each marked with",
    `where it comes from: the seat itself, ${county ? `${county} County` : "the county"}, a rival, or the national news. Use only these.`,
    ...(g.days > 2
      ? [
          "The seat has been quiet, so some items are a few days old: prefer the newest, and say so when a story is not from today.",
        ]
      : []),
    leadItem
      ? `Write the story around item ${leadItem.n}.`
      : `Pick the one story that most shapes ${who}'s race this morning. Lead with the seat's own news when something there matters, but do not fixate on it: when ${county ?? "the county"}'s politics and services, a rival's move or a national development shapes the race more, lead with that and say how it lands on the seat. A quiet seat is no reason for no story: the county and the nation still make one.`,
    "Ignore adverts, job listings, items for sale and posts about other counties or constituencies.",
    "Reports by news outlets say what happened; posts on X, Facebook, Reddit and the like show what people are saying. Lead with a report when one bears on the race, and use posts for the mood.",
    "Give: a plain headline under 12 words; a summary of two or three sentences of what happened,",
    "naming the outlet or account that reported it (never 'item 6');",
    `why it matters for ${who}'s race;`,
    "how rivals are playing it: from the rivals' own posts and the items marked as about a rival,",
    "name the rival and what they said or did, with the numbers of those items in rivalItems;",
    "leave rivals empty and rivalItems empty when none of it bears on the race;",
    `one line ${who} could say; up to three figures copied exactly from an item's text, each with`,
    "that item's number; the numbers of the items the story rests on; and four to six other items",
    `worth knowing, each with one line on why it matters, including ${county ? `${county} County` : "county"} stories whenever any bear on residents.`,
    "Set noStory to true only when no item at all bears on the race, the county or the nation, and leave the rest empty.",
    "Plain English. Invent no facts, figures or quotes.",
    "",
    `Rivals in the race: ${g.rivals.join(", ") || "none on record"}.`,
    "Rivals' own posts, last week:",
    ...(g.said.length ? g.said.map((s) => `- ${s}`) : ["- none"]),
    "",
    "Items:",
    ...g.items.map(
      (i) =>
        `[${i.n}] ${tag(i)} · ${outletOf(i)} · ${i.publishedAt ?? "undated"} · ${i.text.slice(0, 400)}`,
    ),
  ].join("\n");
}

/** A story from the gathered news, checked; null when the AI has none that holds up. */
export async function writeStory(
  c: CampaignInfo,
  g: Gathered,
  lead?: string,
): Promise<MorningStory | null> {
  const answer = await askAiJson<unknown>(storyPrompt(c, g, lead), "morning_story", STORY_SCHEMA);
  const story = checkStory(answer, g.items);
  if (lead && story && !story.sources.some((s) => s.url === lead)) return null;
  return story && withRivals(story, g);
}

/** With no line on the rivals, the story still shows what they put out lately. */
export const withRivals = (story: MorningStory, g: Gathered): MorningStory =>
  story.rivals ? story : { ...story, rivalsLately: rivalsLately(g.saidLinks, g.items) };

export type MorningRun = {
  ran: boolean;
  written: number;
  headlines: number;
  /** Campaigns with no news in the last week. */
  quiet: number;
  /** Campaigns whose story was already there. */
  kept: number;
  /** What went wrong, naming the campaign: for the scheduler only. */
  notes: string[];
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runMorningStory(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<MorningRun> {
  const now = opts.now ?? new Date();
  const day = nairobiToday(now);
  const out: MorningRun = { ran: false, written: 0, headlines: 0, quiet: 0, kept: 0, notes: [] };
  if (!opts.force && now.getTime() < sixOn(day)) return out;
  const { data: job } = await sb
    .from("listening_jobs")
    .select("*")
    .eq("key", JOB_KEY)
    .maybeSingle();
  // A provider pause keeps the AI off, but never the morning: the headlines
  // need no AI, and after six hours the AI is tried once more, as collection is.
  let paused: string | null =
    job?.status === "paused" ? String(job.paused_reason ?? "Paused") : null;
  const pausedAt = job?.last_run_at ? Date.parse(job.last_run_at) : 0;
  if (paused && now.getTime() - pausedAt > PROBE_AFTER) {
    const lift = sb
      .from("listening_jobs")
      .update({ status: "idle", paused_reason: null, locked_until: null })
      .eq("key", JOB_KEY)
      .eq("status", "paused");
    const { data: cleared } = await (
      job?.last_run_at ? lift.eq("last_run_at", job.last_run_at) : lift.is("last_run_at", null)
    ).select("key");
    if (cleared?.length) paused = null;
  }
  // Ran without the lease, under a pause: the pause's own time is left as it is.
  const underPause = paused !== null;
  if (!paused) {
    if (
      job?.status !== "paused" &&
      job?.locked_until &&
      Date.parse(job.locked_until) > now.getTime()
    )
      return out;
    const claim = await sb.rpc("claim_morning_job", { _key: JOB_KEY, _now: now.toISOString() });
    if (claim.error) throw new Error("Could not reserve the morning briefing.");
    if (!claim.data) return out;
  }
  out.ran = true;
  const { data: collection } = await sb
    .from("listening_jobs")
    .select("status, paused_reason")
    .eq("key", "listening_scan")
    .maybeSingle();
  if (
    !paused &&
    collection?.status === "paused" &&
    /^AI stopped \((402|403)\)/.test(String(collection.paused_reason))
  ) {
    paused = String(collection.paused_reason);
  }

  const { data: campaigns, error: campaignError } = await sb
    .from("campaigns")
    .select("id, name, candidate, seat, map_area")
    .order("id")
    .limit(50);
  if (campaignError) throw new Error("Could not read campaigns for the morning briefing.");
  for (const c of (campaigns ?? []) as CampaignInfo[]) {
    const { data: have } = await sb
      .from("morning_stories")
      .select("id, story, written_by")
      .eq("campaign_id", c.id)
      .eq("day", day)
      .maybeSingle();
    const settled = have && (have.written_by === "team" || have.story?.kind === "written");
    // Headlines saved because the AI failed that morning are not the day's last word: each run
    // tries the AI again until the evening, and the story replaces them the moment one holds up.
    const retrying =
      Boolean(have) &&
      !settled &&
      Number(have.story?.from) > 0 &&
      !paused &&
      now.getTime() < eveningOn(day);
    if (settled || (have && Number(have.story?.from) > 0 && !retrying)) {
      out.kept++;
      continue;
    }
    const g = await gather(sb, c.id, now);
    if (!g.items.length) {
      out.quiet++;
      {
        const quiet = headlinesStory([]);
        quiet.summary =
          collection?.status === "paused"
            ? "News collection is paused. Today's briefing has no fresh sources; this does not mean there was no news. Open Listening to resolve the collection problem."
            : "No fresh source items were collected for this campaign. This morning's check is saved; new sources will be picked up on the next scheduled run.";
        const quietRow = {
          campaign_id: c.id,
          day,
          story: quiet,
          written_by: "groundwork",
          edited_by: null,
        };
        const { error } = have
          ? await sb
              .from("morning_stories")
              .update(quietRow)
              .eq("id", have.id)
              .eq("written_by", "groundwork")
              .eq("story->>kind", "headlines")
          : await sb
              .from("morning_stories")
              .upsert(quietRow, { onConflict: "campaign_id,day", ignoreDuplicates: true });
        if (error) out.notes.push("A briefing status could not be stored.");
      }
      continue;
    }
    let story: MorningStory | null = null;
    // While the AI is paused, every campaign still gets the morning's headlines.
    if (!paused) {
      try {
        story = await writeStory(c, g);
      } catch (err) {
        out.notes.push(`Story writing: ${(err as Error).message}`);
        if (err instanceof PauseError) paused = err.message;
      }
    }
    if (story) out.written++;
    else {
      story = withRivals(headlinesStory(g.items), g);
      out.headlines++;
    }
    // Never over a story the team saved while this one was being written.
    const row = { campaign_id: c.id, day, story, written_by: "groundwork", edited_by: null };
    const { error } = have
      ? await sb
          .from("morning_stories")
          .update(row)
          .eq("id", have.id)
          .eq("written_by", "groundwork")
          .eq("story->>kind", "headlines")
      : await sb
          .from("morning_stories")
          .upsert(
            { campaign_id: c.id, day, story, written_by: "groundwork", edited_by: null },
            { onConflict: "campaign_id,day", ignoreDuplicates: true },
          );
    if (error) out.notes.push(`${c.name}: the story could not be stored (${error.message}).`);
  }

  const detail =
    [
      out.written && `Wrote ${count(out.written, "story", "stories")}.`,
      out.headlines &&
        `${count(out.headlines, "campaign", "campaigns")} got the top headlines instead.`,
      out.quiet && `${count(out.quiet, "campaign", "campaigns")} had no news in the last week.`,
      ...out.notes,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: paused ? "paused" : "idle",
      paused_reason: paused,
      ...(underPause ? {} : { locked_until: null, last_run_at: now.toISOString() }),
      detail,
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );
  return out;
}
