// Rapid response: the campaign's reaction to a post that matters. The AI reads the post with the
// campaign's record and drafts whether to react, the angle, a reply in the campaign's own voice and
// a brief for creators; the office edits it, copies it to creators on WhatsApp, or sends it to
// Daraja Pulse (groundwork-rapid) for the creators on the campaign's roster. Every reaction is kept
// (rapid_responses, schema 40). The office reads; the candidate and managers write.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { nairobiToday } from "@/lib/nairobi-date";
import { checkRapid, readReport, RAPID_RULES, type PulseCreator } from "@/lib/pulse";
import { requireOffice, requireRole } from "@/lib/require-role";
import { campaignMemory } from "@/lib/roadmap.functions";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: rapid_responses is newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type Reaction = {
  id: string;
  mentionId: string | null;
  postUrl: string | null;
  platform: string | null;
  whatHappened: string;
  react: boolean;
  angle: string;
  reply: string;
  creatorBrief: string;
  dos: string[];
  donts: string[];
  respondBy: string | null;
  status: "drafted" | "briefed" | "done" | "dropped";
  pulseStatus: string | null;
  pulseDetail: string | null;
  createdAt: string;
};

const strs = (v: unknown, n = 8) =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === "string" && !!x.trim())
    .map((x) => x.trim().slice(0, 300))
    .slice(0, n);

function readReaction(r: Record<string, unknown>): Reaction {
  return {
    id: String(r["id"]),
    mentionId: (r["mention_id"] as string | null) ?? null,
    postUrl: (r["post_url"] as string | null) ?? null,
    platform: (r["platform"] as string | null) ?? null,
    whatHappened: String(r["what_happened"] ?? ""),
    react: r["react"] !== false,
    angle: String(r["angle"] ?? ""),
    reply: String(r["reply"] ?? ""),
    creatorBrief: String(r["creator_brief"] ?? ""),
    dos: strs(r["dos"]),
    donts: strs(r["donts"]),
    respondBy: (r["respond_by"] as string | null) ?? null,
    status: (["drafted", "briefed", "done", "dropped"].find((s) => s === r["status"]) ??
      "drafted") as Reaction["status"],
    pulseStatus: (r["pulse_status"] as string | null) ?? null,
    pulseDetail: (r["pulse_detail"] as string | null) ?? null,
    createdAt: String(r["created_at"] ?? ""),
  };
}

async function campaignOf(sb: Client) {
  const { data: id } = (await sb.rpc("my_campaign")) as { data: unknown };
  const { data } = (await sb
    .from("campaigns")
    .select("id, name, candidate, seat")
    .eq("id", String(id))
    .maybeSingle()) as {
    data: { id: string; name: string; candidate: string | null; seat: string } | null;
  };
  if (!data) throw new Error("No campaign.");
  return data;
}

export type ReactionsData = {
  reactions: Reaction[];
  canWrite: boolean;
  /** Creators on the campaign's Pulse roster, when Pulse is connected and has a campaign. */
  creators: PulseCreator[];
  pulse: "connected" | "not_connected";
};

export const getReactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReactionsData> => {
    const role = await requireOffice(context.supabase);
    const sb = context.supabase as unknown as Client;
    const canWrite = PRINCIPAL_ROLES.includes(role);
    const { data } = (await sb
      .from("rapid_responses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40)) as { data: Record<string, unknown>[] | null };
    let creators: PulseCreator[] = [];
    const { callPulse, pulseConfigured } = await import("@/lib/pulse.server");
    const connected = pulseConfigured();
    if (connected && canWrite) {
      const campaign = await campaignOf(sb);
      const res = await callPulse("groundwork-report", { groundwork_campaign_id: campaign.id });
      if (res.status === 200) creators = readReport(res.json)?.creators ?? [];
    }
    return {
      reactions: (data ?? []).map(readReaction),
      canWrite,
      creators,
      pulse: connected ? "connected" : "not_connected",
    };
  });

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "what_happened",
    "react",
    "why",
    "angle",
    "reply",
    "creator_brief",
    "dos",
    "donts",
    "platforms",
    "respond_within_hours",
  ],
  properties: {
    what_happened: { type: "string" },
    react: { type: "boolean" },
    why: { type: "string" },
    angle: { type: "string" },
    reply: { type: "string" },
    creator_brief: { type: "string" },
    dos: { type: "array", items: { type: "string" } },
    donts: { type: "array", items: { type: "string" } },
    platforms: { type: "array", items: { type: "string" } },
    respond_within_hours: { type: "number" },
  },
};

/** The AI reads one post with the campaign's record and drafts the reaction; it is saved. */
export const draftReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mentionId: string; ask?: string; storyId?: string }) => {
    const mentionId = String(input?.mentionId ?? "");
    if (!/^[0-9a-f-]{36}$/.test(mentionId)) throw new Error("No such post.");
    const storyId = /^[0-9a-f-]{36}$/.test(String(input?.storyId ?? ""))
      ? String(input.storyId)
      : null;
    return {
      mentionId,
      storyId,
      ask: String(input?.ask ?? "")
        .trim()
        .slice(0, 1000),
    };
  })
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, PRINCIPAL_ROLES, "Only the candidate and managers react.");
    const sb = context.supabase as unknown as Client;
    const { data: m } = (await sb
      .from("listening_mentions")
      .select(
        "id, source, url, title, snippet, author, reach, shares, sentiment, issue, published_at, found_at, topic_id",
      )
      .eq("id", data.mentionId)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!m) throw new Error("That post is no longer on file.");
    const { data: topic } = m["topic_id"]
      ? ((await sb
          .from("listening_topics")
          .select("label, kind")
          .eq("id", String(m["topic_id"]))
          .maybeSingle()) as { data: { label: string; kind: string } | null })
      : { data: null };
    const campaign = await campaignOf(sb);
    const memory = await campaignMemory(sb, nairobiToday());
    const prompt = [
      `You run rapid response for ${campaign.candidate ?? campaign.name}, ${campaign.seat}, in Kenya's 2027 election.`,
      "A post is getting attention. Decide whether the campaign should react at all (often silence is right: a small post answered becomes a big one). If yes: the angle (one sentence), a reply in the campaign's own voice for its own accounts (under 60 words, calm, factual, no insults), and a brief for paid creators (what to post, the one point to land, in 2 to 4 sentences), plus dos and don'ts, the platforms to answer on, and how many hours the answer stays useful.",
      "Rules: answer the claim, never the person who posted. Never appeal to or target anyone by tribe or community. Use only facts given here or in the record; if the facts to answer are missing, say what to find out instead. Before 29 May 2027 there is no open campaigning: creators speak about the record and the issue, not 'vote for'. Kiswahili or Sheng is fine where the post uses it.",
      "",
      "THE POST:",
      JSON.stringify({
        platform: m["source"],
        url: m["url"],
        by: m["author"],
        seen: m["reach"],
        shares: m["shares"],
        mood_towards_campaign: m["sentiment"],
        issue: m["issue"],
        found_by: topic ? `${topic.kind}: ${topic.label}` : null,
        when: m["published_at"] ?? m["found_at"],
        title: m["title"],
        text: m["snippet"],
      }),
      data.ask ? `\nWHAT THE OFFICE ASKS: ${data.ask}` : "",
      "",
      memory,
    ].join("\n");
    const { askAiJson } = await import("@/lib/listening.server");
    const out = await askAiJson<{
      what_happened: string;
      react: boolean;
      why: string;
      angle: string;
      reply: string;
      creator_brief: string;
      dos: string[];
      donts: string[];
      platforms: string[];
      respond_within_hours: number;
    }>(prompt, "rapid_response", DRAFT_SCHEMA);
    const hours = Math.min(Math.max(Number(out.respond_within_hours) || 6, 1), 72);
    const url = String(m["url"] ?? "");
    const { data: row, error } = (await sb
      .from("rapid_responses")
      .insert({
        mention_id: data.mentionId,
        // The story the reaction answers (schema 48); left out when there is none.
        ...(data.storyId ? { story_id: data.storyId } : {}),
        post_url: /^https:\/\//.test(url) ? url : null,
        platform: m["source"],
        what_happened: (out.what_happened || String(m["title"] ?? "A post")).slice(0, 2000),
        react: out.react !== false,
        angle: [out.angle, out.why ? `Why: ${out.why}` : ""]
          .filter(Boolean)
          .join("\n")
          .slice(0, 2000),
        reply: (out.reply ?? "").slice(0, 2000),
        creator_brief: (out.creator_brief ?? "").slice(0, 4000),
        dos: [...new Set([...strs(out.dos), ...RAPID_RULES.dos])],
        donts: [...new Set([...strs(out.donts), ...RAPID_RULES.donts])],
        respond_by: new Date(Date.now() + hours * 3600_000).toISOString(),
      })
      .select("id")
      .single()) as { data: { id: string } | null; error: unknown };
    if (error || !row) throw new Error("Could not save the reaction.");
    return { id: row.id };
  });

/** The office's edits to a reaction, or its new status. */
export const updateReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      angle?: string;
      reply?: string;
      creatorBrief?: string;
      dos?: string[];
      donts?: string[];
      status?: string;
    }) => {
      const id = String(input?.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("No such reaction.");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof input.angle === "string") patch["angle"] = input.angle.slice(0, 2000);
      if (typeof input.reply === "string") patch["reply"] = input.reply.slice(0, 2000);
      if (typeof input.creatorBrief === "string")
        patch["creator_brief"] = input.creatorBrief.slice(0, 4000);
      if (input.dos) patch["dos"] = strs(input.dos);
      if (input.donts) patch["donts"] = strs(input.donts);
      if (input.status) {
        if (!["drafted", "briefed", "done", "dropped"].includes(input.status))
          throw new Error("No such status.");
        patch["status"] = input.status;
      }
      return { id, patch };
    },
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, PRINCIPAL_ROLES, "Only the candidate and managers react.");
    const sb = context.supabase as unknown as Client;
    const { error } = await sb.from("rapid_responses").update(data.patch).eq("id", data.id);
    if (error) throw new Error("Could not save that.");
    return { ok: true };
  });

/** Sends the reaction to Daraja Pulse for the creators on the campaign's roster. */
export const sendReactionToPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; creatorIds?: string[] }) => ({
    id: String(input?.id ?? "").slice(0, 40),
    creatorIds: strs(input?.creatorIds, 30),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      PRINCIPAL_ROLES,
      "Only the candidate and managers brief creators.",
    );
    const sb = context.supabase as unknown as Client;
    const campaign = await campaignOf(sb);
    const { data: row } = (await sb
      .from("rapid_responses")
      .select("*")
      .eq("id", data.id)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!row) throw new Error("That reaction is no longer on file.");
    const r = readReaction(row);
    const checked = checkRapid({
      rapid_id: r.id,
      post_url: r.postUrl,
      platform: r.platform,
      what_happened: r.whatHappened,
      angle: r.angle,
      creator_brief: r.creatorBrief,
      dos: r.dos,
      donts: r.donts,
      respond_by: r.respondBy,
      platforms: r.platform ? [r.platform] : [],
      creator_ids: data.creatorIds,
      paid_for_by: `Paid for by ${campaign.candidate ?? campaign.name}'s campaign`,
    });
    if (!checked.ok) throw new Error(checked.why);
    const { callPulse } = await import("@/lib/pulse.server");
    const res = await callPulse("groundwork-rapid", {
      ...checked.rapid,
      groundwork_campaign_id: campaign.id,
    });
    const outcome =
      res.status === 200
        ? { pulse_status: "sent", pulse_detail: null, status: "briefed" }
        : res.status === 0
          ? { pulse_status: "not_connected", pulse_detail: "why" in res ? res.why : null }
          : res.status === 404
            ? {
                pulse_status: "not_supported",
                pulse_detail:
                  "Daraja Pulse can't take reaction briefs yet. Copy the brief to the creators on WhatsApp.",
              }
            : { pulse_status: "failed", pulse_detail: `Daraja Pulse answered ${res.status}.` };
    await sb
      .from("rapid_responses")
      .update({ ...outcome, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (outcome.pulse_status !== "sent") throw new Error(outcome.pulse_detail ?? "Not sent.");
    return { ok: true };
  });
