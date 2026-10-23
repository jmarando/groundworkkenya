// The outbox. Every outbound message is written to public.messages as
// 'queued' first; process_outbox() then re-checks consent at send time and
// decides what happens to it.
//
// Nothing is delivered unless CHANNELS_LIVE is "true" AND Africa's Talking
// credentials are set. Until then queued messages become 'staged': composed,
// addressed and visible in the console, never sent. Dry run is the default so
// a misconfigured deploy cannot text a constituency by accident.
//
// Live, the scheduled drain claims a batch, hands it to Africa's Talking in
// requests of up to 200 numbers and records each answer. A text that may
// have reached the provider is never sent again automatically; the
// 20260928 outbox migration explains how.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import {
  AIRTIME_MAX_KES,
  AIRTIME_MIN_KES,
  atConfigured,
  phoneKey,
  sendAirtime,
  sendSmsBatch,
  type AtBatchResult,
} from "@/lib/at.server";
import { sendSmsBatchTwilio, twilioConfigured } from "@/lib/twilio.server";

type Sb = SupabaseClient<Database>;

export type OutboxKind =
  "poll_invite" | "poll_thanks" | "reply" | "broadcast" | "reward" | "consent_check";

export type QueueItem = {
  personId: string;
  phone: string;
  channel: "sms" | "wa" | "airtime" | "mpesa";
  body: string;
  kind: OutboxKind;
  pollId?: string | null;
  conversationId?: string | null;
};

export function channelsAreLive(): boolean {
  return (
    process.env["CHANNELS_LIVE"] === "true" &&
    (twilioConfigured() || Boolean(process.env["AT_USERNAME"] && process.env["AT_API_KEY"]))
  );
}

/** Write messages to the outbox as 'queued'. */
export async function queueMessages(sb: Sb, items: QueueItem[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map((i) => ({
    person_id: i.personId,
    poll_id: i.pollId ?? null,
    conversation_id: i.conversationId ?? null,
    phone: i.phone,
    channel: i.channel,
    direction: "out",
    body: i.body,
    status: "queued",
    outbox_kind: i.kind,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("messages").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`Could not queue messages: ${error.message}`);
  }
}

export type OutboxResult = {
  live: boolean;
  staged: number;
  blocked: number;
  /** SMS left queued because today's limit is reached. */
  held: number;
  sent: number;
  failed: number;
  /** Interrupted after reaching the provider: may have arrived, never retried. */
  unknown: number;
  /** Claimed but not reached in this run; back in the queue for the next. */
  released: number;
};

type Claimed = { id: string; channel: string; phone: string | null; body: string };

type Recorded = {
  id: string;
  ok: boolean;
  ref?: string | null;
  cost?: number | null;
  error?: string;
};

/** Numbers per request to Africa's Talking. */
export const SMS_PER_REQUEST = 200;

/** Stop starting new requests after this long; the drain runs every minute. */
const TIME_BUDGET_MS = 40_000;

/**
 * Requests to Africa's Talking per run. Each costs three outbound calls
 * (mark, send, record) and the host caps calls per request, so this keeps a
 * run near forty in all. A broadcast is one wording, 200 numbers a request;
 * only replies, each worded for one person, need a request apiece.
 */
export const SMS_REQUESTS_PER_RUN = 12;

/**
 * Most SMS the outbox will hand over per day (Nairobi time), from
 * SMS_DAILY_CAP. The default keeps a runaway loop or a mistaken broadcast
 * to a known, small cost; raise it deliberately before a big send.
 */
export const DEFAULT_SMS_DAILY_CAP = 2000;

export function smsDailyCap(): number {
  const n = Number(process.env["SMS_DAILY_CAP"]);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SMS_DAILY_CAP;
}

const NO_PROVIDER: Record<string, string> = {
  wa: "WhatsApp broadcasts need an approved message template, which is not set up yet.",
  airtime: "No airtime provider is connected yet.",
  mpesa: "M-Pesa thank-yous are not offered; nothing was sent.",
};

/**
 * Most airtime the outbox will send per day (Nairobi time), in shillings, from
 * AIRTIME_DAILY_CAP_KES: a mistaken poll can cost no more than this.
 */
export const DEFAULT_AIRTIME_DAILY_CAP_KES = 1000;

export function airtimeDailyCap(): number {
  const n = Number(process.env["AIRTIME_DAILY_CAP_KES"]);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_AIRTIME_DAILY_CAP_KES;
}

/** Airtime numbers per Africa's Talking request. */
const AIRTIME_PER_REQUEST = 20;

/** An airtime message's amount (its body), when it is one Africa's Talking will send. */
export function airtimeAmount(body: string): number | null {
  const n = Number(body.trim());
  return Number.isInteger(n) && n >= AIRTIME_MIN_KES && n <= AIRTIME_MAX_KES ? n : null;
}

/** Midnight in Nairobi (UTC+3, no daylight saving) at the start of today, as an ISO time. */
function nairobiMidnight(now = new Date()): string {
  const local = new Date(now.getTime() + 3 * 3600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 3 * 3600_000).toISOString();
}

export type SmsBatch = { body: string; items: (Claimed & { key: string })[] };

/**
 * Group claimed texts into requests: same wording, at most `size` numbers,
 * and no number twice in one request, so each report maps back to exactly
 * one message.
 */
export function planSmsBatches(claimed: Claimed[], size = SMS_PER_REQUEST): SmsBatch[] {
  const open = new Map<string, SmsBatch[]>();
  const all: SmsBatch[] = [];
  for (const m of claimed) {
    const key = phoneKey(m.phone);
    const list = open.get(m.body) ?? [];
    let batch = list.find((b) => b.items.length < size && !b.items.some((i) => i.key === key));
    if (!batch) {
      batch = { body: m.body, items: [] };
      list.push(batch);
      all.push(batch);
      open.set(m.body, list);
    }
    batch.items.push({ ...m, key });
  }
  return all;
}

/** Turn Africa's Talking's answer for one request into a result per message. */
export function outcomesFor(items: SmsBatch["items"], reply: AtBatchResult): Recorded[] {
  if (reply.kind === "refused") {
    return items.map((i) => ({ id: i.id, ok: false, error: reply.error }));
  }
  if (reply.kind === "unknown") {
    return items.map((i) => ({
      id: i.id,
      ok: false,
      error: `Outcome unknown: ${reply.error}. Check whether it arrived before sending it again.`,
    }));
  }
  const byKey = new Map(reply.recipients.map((r) => [phoneKey(r.number), r]));
  return items.map((i) => {
    const r = byKey.get(i.key);
    if (!r) {
      return {
        id: i.id,
        ok: false,
        error:
          "Outcome unknown: Africa's Talking did not report on this number. Check whether it arrived before sending it again.",
      };
    }
    return r.ok
      ? { id: i.id, ok: true, ref: r.id, cost: r.costKes }
      : { id: i.id, ok: false, error: r.error };
  });
}

async function record(admin: Sb, claim: string, rows: Recorded[]): Promise<void> {
  if (!rows.length) return;
  const args = { _claim: claim, _results: rows as unknown as Json };
  // One retry: a lost answer here leaves texts that did go out looking
  // unfinished, and after ten minutes they would be marked outcome unknown.
  const first = await admin.rpc("outbox_record", args);
  if (!first.error) return;
  const second = await admin.rpc("outbox_record", args);
  if (second.error) console.error(`Could not record outbox results: ${second.error.message}`);
}

/**
 * Work through the queue. Needs the service-role client: process_outbox()
 * is not callable by console users.
 */
export async function processOutbox(
  admin: Sb,
  limit = 5000,
  { budgetMs = TIME_BUDGET_MS }: { budgetMs?: number } = {},
): Promise<OutboxResult> {
  const started = Date.now();
  const live = channelsAreLive();
  const { data, error } = await admin.rpc(
    "process_outbox",
    live
      ? { _live: true, _limit: limit, _daily_cap: smsDailyCap() }
      : { _live: false, _limit: limit },
  );
  if (error) throw new Error(`Could not process the outbox: ${error.message}`);

  const r = (data ?? {}) as {
    claim?: string | null;
    staged?: number;
    blocked?: number;
    held?: number;
    unknown?: number;
    sending?: Claimed[];
  };
  const out: OutboxResult = {
    live,
    staged: r.staged ?? 0,
    blocked: r.blocked ?? 0,
    held: r.held ?? 0,
    sent: 0,
    failed: 0,
    unknown: r.unknown ?? 0,
    released: 0,
  };
  const claim = r.claim ?? null;
  const claimed = r.sending ?? [];
  if (!claim || !claimed.length) return out;

  // Nothing to hand these to, so nothing was sent.
  const airtimeLive = atConfigured();
  const sendable = (m: Claimed) =>
    Boolean(phoneKey(m.phone)) &&
    (m.channel === "sms" ||
      (m.channel === "airtime" && airtimeLive && airtimeAmount(m.body) !== null));
  const unsendable: Recorded[] = claimed
    .filter((m) => !sendable(m))
    .map((m) => ({
      id: m.id,
      ok: false,
      error: !phoneKey(m.phone)
        ? "There is no phone number on this message."
        : m.channel === "airtime" && airtimeLive
          ? `Airtime of KES ${m.body} can't be sent: Africa's Talking sends ${AIRTIME_MIN_KES} to ${AIRTIME_MAX_KES} whole shillings.`
          : (NO_PROVIDER[m.channel] ?? `No ${m.channel} provider is connected yet.`),
    }));
  await record(admin, claim, unsendable);
  out.failed += unsendable.length;

  // Twilio is primary once its number is set; it takes one request per
  // number, so its batches are smaller.
  const viaTwilio = twilioConfigured();
  const batches = planSmsBatches(
    claimed.filter((m) => m.channel === "sms" && phoneKey(m.phone)),
    viaTwilio ? 20 : SMS_PER_REQUEST,
  );
  const leftover: string[] = [];
  let stopped = false;
  let requests = 0;

  for (const batch of batches) {
    const ids = batch.items.map((i) => i.id);
    if (stopped || requests >= SMS_REQUESTS_PER_RUN || Date.now() - started > budgetMs) {
      leftover.push(...ids);
      continue;
    }

    const { data: moved, error: markError } = await admin.rpc("outbox_mark_submitting", {
      _claim: claim,
      _ids: ids,
    });
    if (markError) {
      // Not marked, so not sent: back to the queue with the rest.
      console.error(`Could not mark texts as submitting: ${markError.message}`);
      stopped = true;
      leftover.push(...ids);
      continue;
    }
    const mine = new Set(moved ?? []);
    const items = batch.items.filter((i) => mine.has(i.id));
    if (!items.length) continue;

    requests++;
    const reply = await (viaTwilio ? sendSmsBatchTwilio : sendSmsBatch)(
      items.map((i) => i.key),
      batch.body,
    );
    const rows = outcomesFor(items, reply);
    await record(admin, claim, rows);

    for (const row of rows) {
      if (row.ok) out.sent++;
      else if (row.error?.startsWith("Outcome unknown")) out.unknown++;
      else out.failed++;
    }
    // A refused request, no answer, or a refusal about the account (credit,
    // sender name) will meet the next request too. Stop, and leave the rest
    // queued for a later run. A bad number only fails its own text.
    if (reply.kind !== "answered" || reply.recipients.some((x) => x.accountWide)) stopped = true;
  }

  // Poll thank-you airtime, within the day's cap; what doesn't fit waits for tomorrow's room.
  const airtime = claimed.filter((m) => m.channel === "airtime" && sendable(m));
  if (airtime.length) {
    const { data: spentRows } = await admin
      .from("messages")
      .select("cost_kes")
      .eq("channel", "airtime")
      .in("status", ["sent", "delivered"])
      .gte("sent_at", nairobiMidnight());
    let room =
      airtimeDailyCap() - (spentRows ?? []).reduce((t, r) => t + Number(r.cost_kes ?? 0), 0);
    const fits: (Claimed & { key: string; amount: number })[] = [];
    for (const m of airtime) {
      const amount = airtimeAmount(m.body)!;
      if (stopped || amount > room || Date.now() - started > budgetMs) leftover.push(m.id);
      else {
        room -= amount;
        fits.push({ ...m, key: phoneKey(m.phone), amount });
      }
    }
    for (let i = 0; i < fits.length; i += AIRTIME_PER_REQUEST) {
      const chunk = fits.slice(i, i + AIRTIME_PER_REQUEST);
      if (stopped) {
        leftover.push(...chunk.map((m) => m.id));
        continue;
      }
      const { data: moved, error: markError } = await admin.rpc("outbox_mark_submitting", {
        _claim: claim,
        _ids: chunk.map((m) => m.id),
      });
      if (markError) {
        console.error(`Could not mark airtime as submitting: ${markError.message}`);
        stopped = true;
        leftover.push(...chunk.map((m) => m.id));
        continue;
      }
      const mine = new Set(moved ?? []);
      const items = chunk.filter((m) => mine.has(m.id));
      if (!items.length) continue;
      const reply = await sendAirtime(items.map((m) => ({ phone: m.key, amountKes: m.amount })));
      const rows = outcomesFor(items, reply);
      await record(admin, claim, rows);
      for (const row of rows) {
        if (row.ok) out.sent++;
        else if (row.error?.startsWith("Outcome unknown")) out.unknown++;
        else out.failed++;
      }
      if (reply.kind !== "answered" || reply.recipients.some((x) => x.accountWide)) stopped = true;
    }
  }

  if (leftover.length) {
    const { data: released, error: releaseError } = await admin.rpc("outbox_release", {
      _claim: claim,
      _ids: leftover,
    });
    // If this fails the rows stay 'sending' and return to the queue after ten minutes.
    if (releaseError) console.error(`Could not release texts: ${releaseError.message}`);
    out.released = Number(released ?? 0);
  }

  return out;
}

/**
 * In dry run, process straight away so the console shows what would have
 * gone out — and what the consent check held back — without waiting on a
 * scheduler. Live, the scheduled drain does the sending.
 */
export async function settleIfDryRun(admin: Sb): Promise<void> {
  if (channelsAreLive()) return;
  await processOutbox(admin, 50000);
}
