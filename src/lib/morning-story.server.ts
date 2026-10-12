// This morning's story, written once a day for each campaign from the news
// Listening found in its last day (server only). It rides on the hourly call
// and keeps its own clock: its first run at or after 06:00 Nairobi time. A
// story already there (the team's, or an earlier run's) is never replaced. The
// shared job row says what happened in counts only.

import { nairobiToday } from "@/lib/demo/insights";
import { askAiJson } from "@/lib/listening.server";
import {
  checkStory,
  headlinesStory,
  storyItems,
  type MentionRow,
  type MorningStory,
  type StoryItem,
} from "@/lib/morning-story";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

const JOB_KEY = "morning_story";

/** 06:00 on a Nairobi day, as a moment. */
const sixOn = (day: string) => Date.parse(`${day}T06:00:00+03:00`);

export const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["noStory", "headline", "summary", "why", "rivals", "line", "figures", "items", "also"],
  properties: {
    noStory: { type: "boolean" },
    headline: { type: "string" },
    summary: { type: "string" },
    why: { type: "string" },
    rivals: { type: "string" },
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
};

export type Gathered = {
  items: StoryItem[];
  /** What rivals (not our candidate) posted in the last two days. */
  said: string[];
  rivals: string[];
};

/**
 * The last day's news for one campaign, and what its rivals posted. With a
 * campaign id (the server's key) it filters by campaign; without one (the
 * signed-in person's client) row level security does.
 */
export async function gather(sb: Client, campaignId: string | null, now: Date): Promise<Gathered> {
  const since24 = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const since48 = new Date(now.getTime() - 48 * 3600_000).toISOString();
  const own = <T>(q: T): T =>
    campaignId
      ? (q as unknown as { eq: (c: string, v: string) => T }).eq("campaign_id", campaignId)
      : q;
  const [{ data: rows }, { data: rivals }, { data: posts }] = await Promise.all([
    own(
      sb
        .from("listening_mentions")
        .select("title, snippet, url, source, domain, published_at")
        .is("rival_id", null)
        .gte("found_at", since24),
    )
      .order("found_at", { ascending: false })
      .limit(60),
    own(sb.from("race_rivals").select("id, name, is_us")),
    own(
      sb
        .from("listening_mentions")
        .select("rival_id, source, title")
        .not("rival_id", "is", null)
        .gte("published_at", since48),
    )
      .order("reach", { ascending: false })
      .limit(12),
  ]);
  const names = new Map(
    ((rivals ?? []) as { id: string; name: string; is_us: boolean }[])
      .filter((r) => !r.is_us)
      .map((r) => [r.id, r.name]),
  );
  const said = (
    (posts ?? []) as { rival_id: string; source: string; title: string | null }[]
  ).flatMap((p) =>
    names.has(p.rival_id) && p.title
      ? [`${names.get(p.rival_id)} on ${p.source}: "${p.title.slice(0, 200)}"`]
      : [],
  );
  return { items: storyItems((rows ?? []) as MentionRow[]), said, rivals: [...names.values()] };
}

function storyPrompt(c: CampaignInfo, g: Gathered, lead?: string): string {
  const who = c.candidate ?? c.name;
  const leadItem = lead ? g.items.find((i) => i.url === lead) : undefined;
  return [
    `You write the morning briefing for the campaign of ${who}, running for ${c.seat}.`,
    "Below are the news and social posts found in the last 24 hours, numbered. Use only these.",
    leadItem
      ? `Write the story around item ${leadItem.n}.`
      : "Pick the one story that most shapes the race this morning: the candidates, county services, the issues people face.",
    "Give: a plain headline under 12 words; a summary of two or three sentences of what happened;",
    `why it matters for ${who}'s race; how rivals are playing it, only from the rivals' posts below,`,
    `or "Rivals haven't spoken on it." when none bear on it; one line ${who} could say;`,
    "up to three figures copied exactly from an item's text, each with that item's number;",
    "the numbers of the items the story rests on; and three to five other items worth knowing,",
    "each with one line on why it matters. If nothing bears on the race or the county, set",
    "noStory to true and leave the rest empty. Plain English. Invent no facts, figures or quotes.",
    "",
    `Rivals in the race: ${g.rivals.join(", ") || "none on record"}.`,
    "Rivals' own posts, last two days:",
    ...(g.said.length ? g.said.map((s) => `- ${s}`) : ["- none"]),
    "",
    "Items:",
    ...g.items.map(
      (i) => `[${i.n}] ${i.source} · ${i.publishedAt ?? "undated"} · ${i.text.slice(0, 400)}`,
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
  return story;
}

export type MorningRun = {
  ran: boolean;
  written: number;
  headlines: number;
  /** Campaigns with no news in the last day. */
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
  if (!opts.force && job?.last_run_at && Date.parse(job.last_run_at) >= sixOn(day)) return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  const { data: campaigns } = await sb.from("campaigns").select("id, name, candidate, seat");
  for (const c of (campaigns ?? []) as CampaignInfo[]) {
    const { data: have } = await sb
      .from("morning_stories")
      .select("id")
      .eq("campaign_id", c.id)
      .eq("day", day)
      .maybeSingle();
    if (have) {
      out.kept++;
      continue;
    }
    const g = await gather(sb, c.id, now);
    if (!g.items.length) {
      out.quiet++;
      continue;
    }
    let story: MorningStory | null = null;
    try {
      story = await writeStory(c, g);
    } catch (err) {
      out.notes.push(`${c.name}: ${(err as Error).message}`);
    }
    if (story) out.written++;
    else {
      story = headlinesStory(g.items);
      out.headlines++;
    }
    // Never over a story the team saved while this one was being written.
    const { error } = await sb
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
      out.quiet && `${count(out.quiet, "campaign", "campaigns")} had no news in the last day.`,
      ...out.notes,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "idle",
      locked_until: null,
      last_run_at: now.toISOString(),
      detail,
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );
  return out;
}
