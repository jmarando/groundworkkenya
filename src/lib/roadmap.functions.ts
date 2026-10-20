// The Road to election day page's reads and writes: the campaign's figures and gaps, its latest
// roadmap (or the starting plan when none is drafted), each milestone's progress, the strategy
// session's notes, and wider news read for the seat. The office reads and marks progress and
// writes notes; the candidate and managers draft the roadmap and have stories read.
//
// The drafts remember: every AI draft is given the campaign's gaps, its latest two-week brief, the
// stories already read for it, the team's notes, the last draft and three months of what Listening
// kept. Nothing is trained; the record is read back each time, and every draft is kept.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { readBrief } from "@/lib/brief";
import { loadDiary } from "@/lib/diary.functions";
import { daysUntil, ELECTION_DAY, keyDates } from "@/lib/election-calendar";
import { addDays, nairobiToday } from "@/lib/nairobi-date";
import { pageAll } from "@/lib/page-all";
import { requireOffice, requireRole } from "@/lib/require-role";
import {
  baseRoadmap,
  gaps,
  PHASE_KEYS,
  phasesFor,
  readImpact,
  readPhases,
  readRoadmap,
  WORKSTREAMS,
  type Figures,
  type Gap,
  type NewsImpact,
  type Roadmap,
} from "@/lib/roadmap";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: schema 39's tables are newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const PUBLIC_KINDS = ["visit", "market", "church", "funeral", "meeting", "media", "rally"];
const sum = (rows: { amount_kes?: unknown }[] | null) =>
  (rows ?? []).reduce((t, r) => t + (Number(r.amount_kes) || 0), 0);

type Campaign = {
  id: string;
  level: string;
  seat: string;
  candidate: string | null;
  name: string;
  limit: number | null;
};

async function loadCampaign(sb: Client): Promise<Campaign> {
  const { data: id } = (await sb.rpc("my_campaign")) as { data: unknown };
  const { data } = (await sb
    .from("campaigns")
    .select("id, level, seat, candidate, name, spending_limit_kes")
    .eq("id", String(id))
    .maybeSingle()) as { data: (Omit<Campaign, "limit"> & { spending_limit_kes: unknown }) | null };
  if (!data) throw new Error("No campaign.");
  return { ...data, limit: Number(data.spending_limit_kes) || null };
}

/** The campaign's figures, each read softly: a count that can't be read is null, not zero. */
export async function loadFigures(
  sb: Client,
  campaign: Pick<Campaign, "level" | "limit">,
  today: string,
): Promise<Figures> {
  const soft = async <T>(p: PromiseLike<T>): Promise<T | null> => {
    try {
      return await p;
    } catch {
      return null;
    }
  };
  const [stations, wards, supporters, reachable, doors, raised, spent, diary] = await Promise.all([
    pageAll<{ streams: number | null; agent_name: string | null }>((a, b) =>
      sb.from("polling_stations").select("streams, agent_name").range(a, b),
    ),
    sb.from("wards").select("registered_voters, target_votes") as Promise<{
      data: { registered_voters: number | null; target_votes: number | null }[] | null;
    }>,
    soft(
      sb.rpc("ward_supporters") as Promise<{
        data: { supporters: number }[] | null;
        error: unknown;
      }>,
    ),
    soft(
      sb
        .from("people")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", false)
        .or("consent_sms.eq.true,consent_whatsapp.eq.true")
        .not("tags", "cs", "{sample}") as Promise<{ count: number | null; error: unknown }>,
    ),
    soft(
      sb.from("house_visits").select("id", { count: "exact", head: true }) as Promise<{
        count: number | null;
        error: unknown;
      }>,
    ),
    soft(
      pageAll<{ amount_kes: unknown }>((a, b) =>
        sb.from("contributions").select("amount_kes").range(a, b),
      ),
    ),
    soft(
      pageAll<{ amount_kes: unknown }>((a, b) =>
        sb.from("expenses").select("amount_kes").neq("status", "rejected").range(a, b),
      ),
    ),
    soft(loadDiary(sb as never, today, addDays(today, 29))),
  ]);
  const ok = <T extends { error?: unknown }>(r: T | null) => (r && !r.error ? r : null);
  return {
    level: campaign.level,
    stations: stations.length,
    streams: stations.reduce((t, s) => t + Math.max(1, s.streams ?? 1), 0),
    staffed: stations.filter((s) => s.agent_name?.trim()).length,
    registered: (wards.data ?? []).reduce((t, w) => t + (w.registered_voters ?? 0), 0),
    target: (wards.data ?? []).reduce((t, w) => t + (w.target_votes ?? 0), 0),
    supporters: ok(supporters)
      ? (supporters!.data ?? []).reduce((t, r) => t + (r.supporters ?? 0), 0)
      : null,
    reachable: ok(reachable)?.count ?? null,
    doors: ok(doors)?.count ?? null,
    raised: raised ? sum(raised) : null,
    spent: spent ? sum(spent) : null,
    limit: campaign.limit,
    appearances30: diary ? diary.filter((e) => PUBLIC_KINDS.includes(e.kind)).length : null,
  };
}

export type RoadmapNote = {
  id: string;
  workstream: string;
  body: string;
  authorName: string | null;
  mine: boolean;
  createdAt: string;
};
export type RoadmapData = {
  today: string;
  seat: string;
  level: string;
  daysLeft: number;
  figures: Figures;
  gaps: Gap[];
  roadmap: Roadmap;
  drafted: boolean;
  drafts: number;
  items: Record<string, { status: string; owner: string | null }>;
  notes: RoadmapNote[];
  impacts: NewsImpact[];
  canWrite: boolean;
};

/** A query limited to one campaign: needed when the caller is the service role, which sees all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
const only = (q: any, campaignId?: string) => (campaignId ? q.eq("campaign_id", campaignId) : q);

export async function loadImpacts(
  sb: Client,
  limit = 12,
  campaignId?: string,
): Promise<NewsImpact[]> {
  const { data } = (await only(sb.from("news_impacts").select("*"), campaignId)
    .order("created_at", { ascending: false })
    .limit(limit)) as { data: Record<string, unknown>[] | null };
  return (data ?? []).flatMap((r) => readImpact(r) ?? []);
}

export const getRoadmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoadmapData> => {
    const role = await requireOffice(
      context.supabase,
      "The road to election day is for the campaign office.",
    );
    const sb = context.supabase as unknown as Client;
    const today = nairobiToday();
    const campaign = await loadCampaign(sb);
    const [figures, saved, count, items, notes, impacts] = await Promise.all([
      loadFigures(sb, campaign, today),
      sb
        .from("campaign_roadmaps")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as Promise<{ data: Record<string, unknown> | null }>,
      sb.from("campaign_roadmaps").select("id", { count: "exact", head: true }) as Promise<{
        count: number | null;
      }>,
      sb.from("roadmap_items").select("key, status, owner") as Promise<{
        data: { key: string; status: string; owner: string | null }[] | null;
      }>,
      sb
        .from("roadmap_notes")
        .select("id, workstream, body, author, author_name, created_at")
        .order("created_at", { ascending: false })
        .limit(200) as Promise<{
        data:
          | {
              id: string;
              workstream: string;
              body: string;
              author: string;
              author_name: string | null;
              created_at: string;
            }[]
          | null;
      }>,
      loadImpacts(sb).catch(() => []),
    ]);
    const stored = readRoadmap(saved.data);
    return {
      today,
      seat: campaign.seat,
      level: campaign.level,
      daysLeft: daysUntil(today, ELECTION_DAY),
      figures,
      gaps: gaps(figures, today),
      roadmap: stored ?? baseRoadmap(figures, today),
      drafted: Boolean(stored),
      drafts: count.count ?? 0,
      items: Object.fromEntries(
        (items.data ?? []).map((i) => [i.key, { status: i.status, owner: i.owner }]),
      ),
      notes: (notes.data ?? []).map((n) => ({
        id: n.id,
        workstream: n.workstream,
        body: n.body,
        authorName: n.author_name,
        mine: n.author === context.userId,
        createdAt: n.created_at,
      })),
      impacts,
      canWrite: PRINCIPAL_ROLES.includes(role),
    };
  });

const STATUSES = ["todo", "doing", "done", "dropped"];

export const setRoadmapItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; status: string; owner?: string | null }) => {
    const key = String(input?.key ?? "");
    if (!/^[a-z0-9-]{1,80}$/.test(key)) throw new Error("No such milestone.");
    if (!STATUSES.includes(String(input?.status))) throw new Error("No such status.");
    const owner = typeof input.owner === "string" ? input.owner.trim().slice(0, 80) || null : null;
    return { key, status: String(input.status), owner };
  })
  .handler(async ({ data, context }) => {
    await requireOffice(context.supabase);
    const sb = context.supabase as unknown as Client;
    const { error } = await sb.from("roadmap_items").upsert(
      {
        key: data.key,
        status: data.status,
        owner: data.owner,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id,key" },
    );
    if (error) throw new Error("Could not save that.");
    return { ok: true };
  });

export const addRoadmapNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workstream: string; body: string }) => {
    const workstream = String(input?.workstream ?? "general");
    if (workstream !== "general" && !WORKSTREAMS.some((w) => w.key === workstream))
      throw new Error("No such workstream.");
    const body = String(input?.body ?? "").trim();
    if (!body || body.length > 2000) throw new Error("A note is 1 to 2,000 characters.");
    return { workstream, body };
  })
  .handler(async ({ data, context }) => {
    await requireOffice(context.supabase);
    const sb = context.supabase as unknown as Client;
    const email = String((context.claims as Record<string, unknown>)["email"] ?? "");
    const { data: prof } = (await sb
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle()) as { data: { full_name: string | null } | null };
    const { error } = await sb.from("roadmap_notes").insert({
      workstream: data.workstream,
      body: data.body,
      author: context.userId,
      author_name: (prof?.full_name || email.split("@")[0] || "").slice(0, 120) || null,
    });
    if (error) throw new Error("Could not save the note.");
    return { ok: true };
  });

export const removeRoadmapNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 40) }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Client;
    const { error } = await sb.from("roadmap_notes").delete().eq("id", data.id);
    if (error) throw new Error("Could not remove the note.");
    return { ok: true };
  });

/* ------------------------------------------------------------ the AI's memory */

/** What every draft is given: the campaign's record, read back. Plain text, trimmed. */
export async function campaignMemory(
  sb: Client,
  today: string,
  campaignId?: string,
): Promise<string> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString();
  const [brief, impacts, notes, last, posts, topics] = await Promise.all([
    only(sb.from("campaign_briefs").select("*"), campaignId)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{ data: Record<string, unknown> | null }>,
    loadImpacts(sb, 15, campaignId).catch(() => []),
    only(sb.from("roadmap_notes").select("workstream, body, author_name, created_at"), campaignId)
      .order("created_at", { ascending: false })
      .limit(40) as Promise<{
      data:
        | { workstream: string; body: string; author_name: string | null; created_at: string }[]
        | null;
    }>,
    only(sb.from("campaign_roadmaps").select("headline, summary, created_at"), campaignId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{
      data: { headline: string; summary: string; created_at: string } | null;
    }>,
    only(
      sb
        .from("listening_mentions")
        .select("title, source, sentiment, issue, topic_id, published_at, found_at"),
      campaignId,
    )
      .gte("found_at", since)
      .order("found_at", { ascending: false })
      .limit(80) as Promise<{
      data:
        | {
            title: string | null;
            source: string;
            sentiment: string | null;
            issue: string | null;
            topic_id: string | null;
            published_at: string | null;
            found_at: string;
          }[]
        | null;
    }>,
    only(sb.from("listening_topics").select("id, label, kind"), campaignId) as Promise<{
      data: { id: string; label: string; kind: string }[] | null;
    }>,
  ]);
  const topic = new Map((topics.data ?? []).map((t) => [t.id, t]));
  const b = readBrief(brief.data);
  const parts: string[] = [];
  if (b)
    parts.push(
      `LATEST TWO-WEEK BRIEF (${b.startsOn} to ${b.endsOn}): ${b.headline}`,
      ...b.read.map((r) => `- [${r.stance}] ${r.title}: ${r.body.slice(0, 600)}`),
    );
  if (last.data)
    parts.push(
      `LAST ROADMAP DRAFT (${last.data.created_at.slice(0, 10)}): ${last.data.headline}. ${last.data.summary}`,
    );
  if (impacts.length)
    parts.push(
      "WIDER NEWS ALREADY READ FOR THIS SEAT:",
      ...impacts.map(
        (i) =>
          `- ${i.publishedOn ?? i.createdAt.slice(0, 10)} [${i.scope}, ${i.stance}] ${i.title}: ${i.reading.slice(0, 400)}`,
      ),
    );
  if (notes.data?.length)
    parts.push(
      "THE TEAM'S STRATEGY NOTES (newest first):",
      ...notes.data.map(
        (n) =>
          `- ${n.created_at.slice(0, 10)} ${n.author_name ?? "someone"} on ${n.workstream}: ${n.body.slice(0, 400)}`,
      ),
    );
  if (posts.data?.length)
    parts.push(
      "WHAT LISTENING KEPT, LAST 90 DAYS (newest first; titles only):",
      ...posts.data
        .filter((p) => p.title)
        .slice(0, 60)
        .map((p) => {
          const t = p.topic_id ? topic.get(p.topic_id) : null;
          return `- ${(p.published_at ?? p.found_at).slice(0, 10)} ${p.source}${t ? ` (${t.kind}: ${t.label})` : ""}${p.sentiment ? ` ${p.sentiment}` : ""}${p.issue ? ` #${p.issue}` : ""}: ${p.title!.split("\n")[0]!.slice(0, 160)}`;
        }),
    );
  return parts.join("\n");
}

const RULES = [
  "Rules you must follow:",
  "- Places, never people: speak of wards, constituencies, counties and regions. Never name, guess or target any ethnic community or person's identity.",
  "- Use only the figures given. Do not invent polls, numbers, names or events; if something isn't known, say what to find out.",
  "- Kenyan law: no open campaigning before the seat's campaign period; police notice 3 to 14 days before any public meeting; spending within the gazetted limit; no inducements to voters.",
  "- Plain, direct English. Strong recommendations are welcome; hedging is not.",
].join("\n");

const MILESTONE = {
  type: "object",
  additionalProperties: false,
  required: ["key", "workstream", "title", "why", "how", "by", "measure"],
  properties: {
    key: { type: "string" },
    workstream: { type: "string", enum: WORKSTREAMS.map((w) => w.key) },
    title: { type: "string" },
    why: { type: "string" },
    how: { type: "array", items: { type: "string" } },
    by: { type: ["string", "null"] },
    measure: { type: ["string", "null"] },
  },
};
const ROADMAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "phases"],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    phases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "focus", "milestones"],
        properties: {
          key: { type: "string", enum: [...PHASE_KEYS] },
          focus: { type: "string" },
          milestones: { type: "array", items: MILESTONE },
        },
      },
    },
  },
};

/** A new draft of the road to election day, written by the AI from the record and kept. */
export const draftRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ask?: string } | undefined) => ({
    ask: String(input?.ask ?? "")
      .trim()
      .slice(0, 1500),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers draft the plan.",
    );
    const sb = context.supabase as unknown as Client;
    const today = nairobiToday();
    const campaign = await loadCampaign(sb);
    const [figures, memory] = await Promise.all([
      loadFigures(sb, campaign, today),
      campaignMemory(sb, today),
    ]);
    const base = baseRoadmap(figures, today);
    const shell = phasesFor(campaign.level, today);
    const prompt = [
      `You are the chief strategist for ${campaign.candidate ?? campaign.name}, running for ${campaign.seat} in Kenya's general election on ${ELECTION_DAY} (${daysUntil(today, ELECTION_DAY)} days from today, ${today}).`,
      "Write the road to election day: for each phase, its focus and 3 to 7 milestones across the workstreams, shaped around THIS campaign's gaps, its news and its team's notes. Put the biggest gaps first. Every milestone says why, how (concrete steps, places by name), a date to have it done by inside the phase, and how to measure it. Keep a milestone's key when it is the same milestone as the starting plan's, so the team's progress carries over; new milestones get a new key like phase-workstream-word.",
      RULES,
      "",
      "PHASES (fixed dates):",
      ...shell.map((p) => `- ${p.key}: ${p.title}, ${p.from} to ${p.to}`),
      "",
      "IEBC DATES:",
      ...keyDates(campaign.level).map(
        (d) => `- ${d.on}${d.until ? ` to ${d.until}` : ""} (${d.sureness}): ${d.title}`,
      ),
      "",
      "THE CAMPAIGN'S FIGURES:",
      JSON.stringify(figures),
      "THE GAPS:",
      ...gaps(figures, today).map((g) => `- [${g.tone}] ${g.workstream}: ${g.headline}. ${g.why}`),
      "",
      "THE STARTING PLAN (milestone keys to keep where they fit):",
      ...base.phases.flatMap((p) => p.milestones.map((m) => `- ${m.key}: ${m.title}`)),
      "",
      memory,
      data.ask ? `\nWHAT THE CANDIDATE OR MANAGER ASKS FOR IN THIS DRAFT:\n${data.ask}` : "",
    ].join("\n");
    const { askAiJson } = await import("@/lib/listening.server");
    const out = await askAiJson<{
      headline: string;
      summary: string;
      phases: { key: string; focus: string; milestones: unknown[] }[];
    }>(prompt, "roadmap", ROADMAP_SCHEMA);
    const phases = readPhases(
      shell.map((p) => {
        const drafted = out.phases.find((x) => x.key === p.key);
        return { ...p, focus: drafted?.focus || p.focus, milestones: drafted?.milestones ?? [] };
      }),
    );
    if (!out.headline || phases.every((p) => p.milestones.length === 0))
      throw new Error("The draft came back empty. Try again.");
    const { error } = await sb.from("campaign_roadmaps").insert({
      headline: out.headline.slice(0, 300),
      summary: (out.summary ?? "").slice(0, 4000),
      phases,
      gaps: gaps(figures, today),
      written_by: "Drafted with AI from the campaign's record",
    });
    if (error) throw new Error("Could not save the draft.");
    return { ok: true };
  });

/* ------------------------------------------------------------ wider news */

const IMPACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scope", "stance", "reading", "moves"],
  properties: {
    scope: { type: "string", enum: ["national", "county", "local"] },
    stance: { type: "string", enum: ["strength", "threat", "opening", "context"] },
    reading: { type: "string" },
    moves: { type: "array", items: { type: "string" } },
  },
};

type Story = {
  title: string;
  url: string | null;
  text: string;
  publishedOn: string | null;
  mentionId: string | null;
};

/**
 * One story read for one campaign's seat by the AI, with the campaign's record, and kept. The
 * campaign is named explicitly, so the hourly job (the service role, which sees every campaign)
 * reads and writes only that campaign's rows.
 */
export async function readForSeat(
  sb: Client,
  campaign: Pick<Campaign, "id" | "name" | "candidate" | "seat">,
  data: Story,
  writtenBy: string,
): Promise<{ error: { code?: string } | null }> {
  const today = nairobiToday();
  const memory = await campaignMemory(sb, today, campaign.id);
  const prompt = [
    `You advise ${campaign.candidate ?? campaign.name}, running for ${campaign.seat} in Kenya on ${ELECTION_DAY}.`,
    "Read this story for THIS seat. Say whether it is national, county or local news; whether it is a strength, threat, opening or context for this campaign; what it means here in 3 to 6 plain sentences (who it helps among the parties and candidates in this race, why, and whether it reaches this seat's voters); and 2 to 4 concrete moves for the next fortnight.",
    RULES,
    "",
    `THE STORY (${data.publishedOn ?? "date not given"}): ${data.title}`,
    data.url ? `Link: ${data.url}` : "",
    data.text ? `Text: ${data.text}` : "",
    "",
    memory,
  ].join("\n");
  const { askAiJson } = await import("@/lib/listening.server");
  const out = await askAiJson<{
    scope: string;
    stance: string;
    reading: string;
    moves: string[];
  }>(prompt, "news_impact", IMPACT_SCHEMA);
  const { error } = await sb.from("news_impacts").insert({
    campaign_id: campaign.id,
    mention_id: data.mentionId,
    title: data.title,
    url: data.url,
    published_on: data.publishedOn,
    scope: out.scope,
    stance: out.stance,
    reading: out.reading.slice(0, 3000),
    moves: (out.moves ?? []).slice(0, 6).map((m) => String(m).slice(0, 400)),
    sources: data.url
      ? [{ label: data.title.slice(0, 160), url: data.url, date: data.publishedOn }]
      : [],
    written_by: writtenBy,
  });
  return { error };
}

/** One story read for this seat: what it means here and what to do, kept with its link. */
export const readStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      title: string;
      url?: string | null;
      text?: string;
      publishedOn?: string | null;
      mentionId?: string | null;
    }) => {
      const title = String(input?.title ?? "")
        .trim()
        .slice(0, 300);
      if (!title) throw new Error("Give the story's headline.");
      const url = String(input?.url ?? "").trim();
      if (url && !/^https:\/\//.test(url)) throw new Error("The link must start with https://");
      const on = String(input?.publishedOn ?? "");
      return {
        title,
        url: url || null,
        text: String(input?.text ?? "")
          .trim()
          .slice(0, 3000),
        publishedOn: /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : null,
        mentionId: /^[0-9a-f-]{36}$/.test(String(input?.mentionId ?? ""))
          ? String(input.mentionId)
          : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers have stories read.",
    );
    const sb = context.supabase as unknown as Client;
    const campaign = await loadCampaign(sb);
    const { error } = await readForSeat(sb, campaign, data, "Read with AI for this seat");
    if (error?.code === "23505") throw new Error("That story has already been read for this seat.");
    if (error) throw new Error("Could not save the reading.");
    return { ok: true };
  });

/** Stories Listening found under national and county keywords that haven't been read yet. */
export const unreadWiderNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOffice(context.supabase);
    const sb = context.supabase as unknown as Client;
    const { data: topics } = (await sb
      .from("listening_topics")
      .select("id, label, kind")
      .in("kind", ["national", "county"])) as {
      data: { id: string; label: string; kind: string }[] | null;
    };
    if (!topics?.length) return { topics: 0, stories: [] };
    const [{ data: posts }, { data: read }] = await Promise.all([
      sb
        .from("listening_mentions")
        .select("id, title, url, snippet, published_at, found_at, topic_id")
        .in(
          "topic_id",
          topics.map((t) => t.id),
        )
        .order("found_at", { ascending: false })
        .limit(40) as Promise<{
        data:
          | {
              id: string;
              title: string | null;
              url: string;
              snippet: string | null;
              published_at: string | null;
              found_at: string;
              topic_id: string;
            }[]
          | null;
      }>,
      sb.from("news_impacts").select("url, mention_id") as Promise<{
        data: { url: string | null; mention_id: string | null }[] | null;
      }>,
    ]);
    const done = new Set((read ?? []).flatMap((r) => [r.url, r.mention_id]).filter(Boolean));
    const label = new Map(topics.map((t) => [t.id, `${t.kind}: ${t.label}`]));
    return {
      topics: topics.length,
      stories: (posts ?? [])
        .filter((p) => p.title && !done.has(p.url) && !done.has(p.id))
        .slice(0, 12)
        .map((p) => ({
          id: p.id,
          title: p.title!.split("\n")[0]!.slice(0, 300),
          url: /^https:\/\//.test(p.url) ? p.url : null,
          snippet: p.snippet,
          publishedOn: (p.published_at ?? p.found_at).slice(0, 10),
          topic: label.get(p.topic_id) ?? "",
        })),
    };
  });

export const AUTO_READER = "Read with AI for this seat (automatic)";

/**
 * The hourly job's share of wider news: for each campaign, its newest national or county story
 * of the last three days not yet read is read for its seat, at most two a day per campaign.
 * Stops at once when the AI is paused. Returns how many were read.
 */
export async function autoReadWiderNews(sb: Client): Promise<number> {
  const today = nairobiToday();
  const { data: campaigns } = (await sb.from("campaigns").select("id, name, candidate, seat")) as {
    data: Pick<Campaign, "id" | "name" | "candidate" | "seat">[] | null;
  };
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  let read = 0;
  for (const c of campaigns ?? []) {
    const { count } = (await sb
      .from("news_impacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("written_by", AUTO_READER)
      .gte("created_at", `${today}T00:00:00+03:00`)) as { count: number | null };
    if ((count ?? 0) >= 2) continue;
    const { data: topics } = (await sb
      .from("listening_topics")
      .select("id")
      .eq("campaign_id", c.id)
      .in("kind", ["national", "county"])) as { data: { id: string }[] | null };
    if (!topics?.length) continue;
    const { data: posts } = (await sb
      .from("listening_mentions")
      .select("id, title, url, snippet, published_at, found_at")
      .eq("campaign_id", c.id)
      .in(
        "topic_id",
        topics.map((t) => t.id),
      )
      .in("source", ["news", "web", "google_alerts", "x"])
      .gte("found_at", since)
      .order("found_at", { ascending: false })
      .limit(20)) as {
      data:
        | {
            id: string;
            title: string | null;
            url: string;
            snippet: string | null;
            published_at: string | null;
            found_at: string;
          }[]
        | null;
    };
    const { data: done } = (await sb
      .from("news_impacts")
      .select("url, mention_id")
      .eq("campaign_id", c.id)) as {
      data: { url: string | null; mention_id: string | null }[] | null;
    };
    const seen = new Set((done ?? []).flatMap((d) => [d.url, d.mention_id]).filter(Boolean));
    const story = (posts ?? []).find(
      (p) => p.title && /^https:\/\//.test(p.url) && !seen.has(p.url) && !seen.has(p.id),
    );
    if (!story) continue;
    try {
      const { error } = await readForSeat(
        sb,
        c,
        {
          title: story.title!.split("\n")[0]!.slice(0, 300),
          url: story.url,
          text: story.snippet ?? "",
          publishedOn: (story.published_at ?? story.found_at).slice(0, 10),
          mentionId: story.id,
        },
        AUTO_READER,
      );
      if (!error) read++;
    } catch (e) {
      // A paused or unconfigured AI stops the whole pass; any other failure skips this campaign.
      if (/AI (stopped|is not configured)/.test(String((e as Error).message))) break;
    }
  }
  return read;
}
