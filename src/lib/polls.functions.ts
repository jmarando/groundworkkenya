// Poll lifecycle for the console: draft -> live -> closed, plus results.
//
// Everything runs under the caller's own JWT (requireSupabaseAuth), so row
// level security decides who may do what: admins and managers run polls, the
// wider team reads them, and a signup awaiting approval gets nothing.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  keyedOptions,
  rewardLabel,
  shortCode,
  smsInvite,
  validateDraft,
  weightedResults,
  type FrameRow,
  type PollKind,
  type PollLang,
  type PollResults,
  type RewardMethod,
  type Tally,
} from "@/lib/polls.engine";

const CAMPAIGN = process.env["CAMPAIGN_NAME"] ?? "Groundwork";
const ORIGIN = process.env["PUBLIC_ORIGIN"] ?? "https://groundworkkenya.lovable.app";

/* ----------------------------------------------------------------- create */

export type CreatePollInput = {
  question: string;
  questionSw: string;
  kind: PollKind;
  lang: PollLang;
  options: { label: string; labelSw: string }[];
  channels: string[];
  wardIds: string[];
  segments: string[];
  sampleTarget: number;
  rewardMethod: RewardMethod;
  rewardAmount: number;
  closesInDays: number;
};

const CHANNELS = ["sms", "ussd", "web", "wa"];

export const createPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreatePollInput) => {
    const problem = validateDraft({
      question: String(input.question ?? ""),
      kind: input.kind,
      options: (input.options ?? []).map((o) => ({ label: String(o.label ?? "") })),
      channels: (input.channels ?? []).filter((c) => CHANNELS.includes(c)),
      rewardMethod: input.rewardMethod,
      rewardAmount: Number(input.rewardAmount) || 0,
    });
    if (problem) throw new Error(problem);
    if (!["single_choice", "yesno", "open"].includes(input.kind))
      throw new Error("Unknown poll type.");
    if (!["sw", "en"].includes(input.lang)) throw new Error("Unknown language.");
    if (!["none", "airtime", "mpesa"].includes(input.rewardMethod))
      throw new Error("Unknown reward.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const options =
      data.kind === "open"
        ? []
        : keyedOptions(data.options.map((o) => ({ label: o.label, labelSw: o.labelSw })));
    const days = Math.min(Math.max(Math.round(Number(data.closesInDays) || 3), 1), 30);
    const amount = data.rewardMethod === "none" ? 0 : Math.round(Number(data.rewardAmount) || 0);

    const { data: row, error } = await context.supabase
      .from("polls")
      .insert({
        code: shortCode(6),
        question: data.question.trim(),
        question_sw: data.questionSw.trim() || null,
        kind: data.kind,
        lang: data.lang,
        options,
        channels: data.channels.filter((c) => CHANNELS.includes(c)),
        audience: {
          wardIds: [...new Set(data.wardIds ?? [])],
          segments: [...new Set(data.segments ?? [])],
        },
        status: "draft",
        sample_target: Math.max(0, Math.round(Number(data.sampleTarget) || 0)),
        reward_method: data.rewardMethod,
        reward_amount: amount,
        reward: rewardLabel(data.rewardMethod, amount),
        closes_at: new Date(Date.now() + days * 864e5).toISOString(),
        created_by: context.userId,
      })
      .select("id, code")
      .single();

    if (error || !row) throw new Error("Only an admin or manager can create polls.");
    return { id: row.id, code: row.code };
  });

/* ----------------------------------------------------------------- launch */

export type LaunchSummary = {
  code: string;
  audience: number;
  reachable: number;
  queued: number;
  live: boolean;
  webLink: string | null;
};

export const launchPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Which poll?");
    return input;
  })
  .handler(async ({ data, context }): Promise<LaunchSummary> => {
    const { rowToEnginePoll, POLL_COLUMNS } = await import("@/lib/inbound.server");
    const { channelsAreLive, settleIfDryRun } = await import("@/lib/outbox.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: poll } = await context.supabase
      .from("polls")
      .select(`${POLL_COLUMNS}, channels`)
      .eq("id", data.id)
      .maybeSingle();
    if (!poll) throw new Error("That poll no longer exists.");

    // One body for everyone: the provider sends it to a hundred numbers a call.
    const body = smsInvite(rowToEnginePoll(poll), CAMPAIGN);

    // launch_poll claims the draft before it queues anything, so a second
    // press — here or by someone else — is refused rather than doubling up.
    const { data: result, error } = await context.supabase.rpc("launch_poll", {
      _poll_id: data.id,
      _sms_body: body,
    });
    if (error) {
      throw new Error(
        error.code === "P0001"
          ? "That poll is already live, or only an admin or manager can launch it."
          : "Could not launch the poll.",
      );
    }

    // In dry run the console shows at once what would have gone out.
    await settleIfDryRun(supabaseAdmin);

    const r = (result ?? {}) as Partial<
      Record<"code" | "audience" | "reachable" | "queued", unknown>
    >;
    return {
      code: String(r.code ?? poll.code),
      audience: Number(r.audience ?? 0),
      reachable: Number(r.reachable ?? 0),
      queued: Number(r.queued ?? 0),
      live: channelsAreLive(),
      webLink: (poll.channels ?? []).includes("web") ? `${ORIGIN}/p/${poll.code}` : null,
    };
  });

/* ------------------------------------------------------------------ close */

export const closePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Which poll?");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("polls")
      .update({ status: "closed", closes_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "live")
      .select("id");
    if (error || !rows?.length) throw new Error("Only an admin or manager can close a live poll.");
    return { ok: true };
  });

/* ---------------------------------------------------------------- results */

export type PollDetail = PollResults & {
  id: string;
  weighting: boolean;
  byChannel: { channel: string; count: number }[];
  openAnswers: string[];
};

export const getPollDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<PollDetail> => {
    const { rowToEnginePoll, POLL_COLUMNS } = await import("@/lib/inbound.server");
    const sb = context.supabase;

    const [{ data: poll }, { data: tallies }, { data: open }] = await Promise.all([
      sb.from("polls").select(POLL_COLUMNS).eq("id", data.id).maybeSingle(),
      sb.rpc("poll_tallies", { _poll_id: data.id }),
      sb
        .from("poll_responses")
        .select("free_text")
        .eq("poll_id", data.id)
        .not("free_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (!poll) throw new Error("That poll no longer exists.");

    const engine = rowToEnginePoll(poll);
    const t = (tallies ?? {}) as { responses?: Tally[]; frame?: FrameRow[]; invites?: number };
    const rows = t.responses ?? [];
    const results = weightedResults(engine, rows, t.frame ?? [], t.invites ?? 0);

    const byChannel = new Map<string, number>();
    for (const r of rows) byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + r.n);

    return {
      ...results,
      id: engine.id,
      weighting: engine.weighting,
      byChannel: [...byChannel.entries()].map(([channel, count]) => ({ channel, count })),
      openAnswers: (open ?? []).map((o) => o.free_text).filter((x): x is string => Boolean(x)),
    };
  });

/* --------------------------------------------------------------- audience */

export type AudienceOptions = {
  wards: { id: string; name: string; constituency: string; people: number }[];
  segments: { slug: string; name: string; people: number }[];
  total: number;
  reachableBySms: number;
};

export const getAudienceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AudienceOptions> => {
    const sb = context.supabase;
    const [{ data: wards }, { data: segments }, { data: counts }] = await Promise.all([
      sb.from("wards").select("id, name, constituency").order("constituency").order("name"),
      sb.from("segments").select("slug, name").order("name"),
      sb.rpc("audience_counts"),
    ]);

    const c = (counts ?? {}) as {
      total?: number;
      reachableBySms?: number;
      byWard?: { wardId: string; people: number }[];
      bySegment?: { segment: string; people: number }[];
    };
    const wardPeople = new Map((c.byWard ?? []).map((w) => [w.wardId, w.people]));
    const segPeople = new Map((c.bySegment ?? []).map((s) => [s.segment, s.people]));

    return {
      wards: (wards ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        constituency: w.constituency,
        people: wardPeople.get(w.id) ?? 0,
      })),
      segments: (segments ?? []).map((s) => ({
        slug: s.slug,
        name: s.name,
        people: segPeople.get(s.slug) ?? 0,
      })),
      total: c.total ?? 0,
      reachableBySms: c.reachableBySms ?? 0,
    };
  });

/** Exact reach for a candidate audience, for the builder's running estimate. */
export const estimateAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardIds: string[]; segments: string[] }) => ({
    wardIds: (input?.wardIds ?? []).slice(0, 500),
    segments: (input?.segments ?? []).slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    const { data: est } = await context.supabase.rpc("audience_estimate", { _audience: data });
    const e = (est ?? {}) as { people?: number; reachable?: number };
    return { people: e.people ?? 0, reachable: e.reachable ?? 0 };
  });
