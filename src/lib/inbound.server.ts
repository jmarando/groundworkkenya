// Inbound handling: replies arriving by SMS, USSD or the public web page.
//
// Runs with the service-role client, because the sender is a member of the
// public with no account. Written for hostile input: numbers are normalised
// or rejected, text is length-capped, and consent only ever changes through
// an explicit action taken from the phone itself (STOP, START, a USSD menu
// choice) — never because someone typed a number into a web form.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { queueMessages, settleIfDryRun, type QueueItem } from "@/lib/outbox.server";
import { normalizeKePhone } from "@/lib/phone";
import {
  consentRequestText,
  helpText,
  inAudience,
  isStartWord,
  isStopWord,
  optOutText,
  parseAnswer,
  questionText,
  rewardLine,
  thanksText,
  type EnginePoll,
  type ParsedAnswer,
  type PollKind,
  type PollLang,
  type RewardMethod,
} from "@/lib/polls.engine";

type Sb = SupabaseClient<Database>;
type PeopleUpdate = Database["public"]["Tables"]["people"]["Update"];

export const CAMPAIGN = process.env["CAMPAIGN_NAME"] ?? "Groundwork";

export const POLL_COLUMNS =
  "id, code, question, question_sw, kind, lang, options, weighting, reward_method, reward_amount";

type PollRow = {
  id: string;
  code: string;
  question: string;
  question_sw: string | null;
  kind: string;
  lang: string;
  options: unknown;
  weighting: boolean;
  reward_method: string;
  reward_amount: number;
};

type StoredOption = { key: string; label: string; labelSw?: string };

export function rowToEnginePoll(p: PollRow): EnginePoll {
  const opts = Array.isArray(p.options) ? (p.options as StoredOption[]) : [];
  return {
    id: p.id,
    code: p.code,
    question: p.question,
    questionSw: p.question_sw,
    kind: (["single_choice", "yesno", "open"].includes(p.kind)
      ? p.kind
      : "single_choice") as PollKind,
    lang: (p.lang === "en" ? "en" : "sw") as PollLang,
    options: opts.map((o) => {
      const opt: StoredOption = { key: String(o.key), label: String(o.label) };
      if (o.labelSw) opt.labelSw = String(o.labelSw);
      return opt;
    }),
    weighting: p.weighting,
    rewardMethod: (["airtime", "mpesa"].includes(p.reward_method)
      ? p.reward_method
      : "none") as RewardMethod,
    rewardAmount: p.reward_amount ?? 0,
  };
}

/* ----------------------------------------------------------------- people */

export type PersonRef = {
  id: string;
  phone: string;
  wardId: string | null;
  segment: string | null;
  optedOut: boolean;
};

const PERSON_COLUMNS = "id, phone, ward_id, segment, opted_out";

function toPerson(p: {
  id: string;
  phone: string;
  ward_id: string | null;
  segment: string | null;
  opted_out: boolean;
}): PersonRef {
  return { id: p.id, phone: p.phone, wardId: p.ward_id, segment: p.segment, optedOut: p.opted_out };
}

/**
 * Find or create a person by number. Never changes consent: a new record
 * starts with none, because a number arriving here proves only that someone
 * typed it.
 */
export async function upsertPersonByPhone(
  sb: Sb,
  rawPhone: string,
  source: string,
): Promise<PersonRef | null> {
  const phone = normalizeKePhone(rawPhone);
  if (!phone) return null;

  const find = () => sb.from("people").select(PERSON_COLUMNS).eq("phone", phone).maybeSingle();

  const { data: existing } = await find();
  if (existing) {
    await sb
      .from("people")
      .update({ last_inbound_at: new Date().toISOString() })
      .eq("id", existing.id);
    return toPerson(existing);
  }

  const { data: created, error } = await sb
    .from("people")
    .insert({ phone, source, last_inbound_at: new Date().toISOString() })
    .select(PERSON_COLUMNS)
    .single();
  if (created) return toPerson(created);

  // Two messages from a new number at once: the other request created the
  // row first. Use it rather than dropping this message.
  if (error?.code === "23505") {
    const { data: raced } = await find();
    if (raced) return toPerson(raced);
  }
  return null;
}

async function updatePerson(sb: Sb, id: string, patch: PeopleUpdate): Promise<void> {
  await sb.from("people").update(patch).eq("id", id);
}

async function logEvent(
  sb: Sb,
  personId: string,
  kind: string,
  channel: string,
  detail: string,
): Promise<void> {
  await sb
    .from("person_events")
    .insert({ person_id: personId, kind, channel, detail: detail.slice(0, 500) });
}

/** Open (or reuse) an inbox conversation so a human sees this. */
export async function openConversation(
  sb: Sb,
  personId: string,
  subject: string,
  snippet: string,
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from("conversations")
    .select("id")
    .eq("person_id", personId)
    .eq("channel", "sms")
    .eq("status", "open")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await sb
      .from("conversations")
      .update({ snippet: snippet.slice(0, 160), unread: true, last_message_at: now })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created } = await sb
    .from("conversations")
    .insert({
      person_id: personId,
      channel: "sms",
      platform: "sms",
      subject,
      snippet: snippet.slice(0, 160),
      status: "open",
      unread: true,
      last_message_at: now,
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

/* ---------------------------------------------------------------- consent */

const CONSENT_REQUESTS_PER_HOUR = 200;

/**
 * Double opt-in. Ticking "send me updates" on a public form cannot make a
 * number consent — anyone can type anyone's number. Instead the number gets
 * one message asking them to reply START, at most once a day, and never after
 * they have said STOP. Consent is recorded only when START comes back.
 */
export async function requestSmsConsent(sb: Sb, person: PersonRef): Promise<void> {
  if (person.optedOut) return;

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("person_id", person.id)
    .eq("outbox_kind", "consent_check")
    .gte("created_at", since);
  if ((count ?? 0) > 0) return;

  // Every one of these is a paid SMS to a number a stranger typed in. Cap the
  // total, so a script feeding the form random numbers cannot run up the bill.
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const { count: lastHour } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("outbox_kind", "consent_check")
    .gte("created_at", hourAgo);
  if ((lastHour ?? 0) >= CONSENT_REQUESTS_PER_HOUR) return;

  const { data: current } = await sb
    .from("people")
    .select("consent_sms")
    .eq("id", person.id)
    .maybeSingle();
  if (current?.consent_sms) return;

  await queueMessages(sb, [
    {
      personId: person.id,
      phone: person.phone,
      channel: "sms",
      body: consentRequestText(CAMPAIGN),
      kind: "consent_check",
    },
  ]);
  await logEvent(sb, person.id, "consent_requested", "web", "Asked to reply START (web form)");
}

/* -------------------------------------------------------------- responses */

/** Channels where the network vouches for the number: the answer is theirs. */
const VERIFIED = new Set(["sms", "ussd", "wa"]);

export type RecordOutcome = { recorded: boolean; alreadyAnswered: boolean; rewarded: boolean };

/**
 * Record an answer: one per person per poll.
 *
 * The first answer is an atomic insert, and only the request that inserts it
 * earns the reward — two replies landing together cannot both be paid. A
 * later answer on a verified channel updates the first; a later answer typed
 * into the web form does not, or anyone could overwrite someone else's SMS
 * answer by entering their number.
 */
export async function recordResponse(
  sb: Sb,
  poll: EnginePoll,
  person: PersonRef,
  channel: string,
  answer: ParsedAnswer,
): Promise<RecordOutcome> {
  const row = {
    poll_id: poll.id,
    person_id: person.id,
    ward_id: person.wardId,
    channel,
    option_key: answer.optionKey,
    free_text: answer.freeText,
  };

  const { data: inserted, error } = await sb
    .from("poll_responses")
    .upsert(row, { onConflict: "poll_id,person_id", ignoreDuplicates: true })
    .select("id");
  if (error) return { recorded: false, alreadyAnswered: false, rewarded: false };

  const first = (inserted ?? []).length > 0;

  if (!first) {
    if (!VERIFIED.has(channel)) return { recorded: false, alreadyAnswered: true, rewarded: false };
    await sb
      .from("poll_responses")
      .update({ channel, option_key: answer.optionKey, free_text: answer.freeText })
      .eq("poll_id", poll.id)
      .eq("person_id", person.id);
  }

  const label = answer.optionKey
    ? (poll.options.find((o) => o.key === answer.optionKey)?.label ?? answer.optionKey)
    : (answer.freeText ?? "");
  await logEvent(sb, person.id, "poll_answer", channel, `${poll.question} → ${label}`);

  const rewarded = first && poll.rewardMethod !== "none" && poll.rewardAmount > 0;
  if (rewarded) {
    await queueMessages(sb, [
      {
        personId: person.id,
        phone: person.phone,
        channel: poll.rewardMethod === "mpesa" ? "mpesa" : "airtime",
        body: String(poll.rewardAmount),
        kind: "reward",
        pollId: poll.id,
      },
    ]);
  }

  return { recorded: true, alreadyAnswered: !first, rewarded };
}

/** Live polls, newest invite first, that this person was invited to. */
async function invitedLivePoll(sb: Sb, personId: string): Promise<EnginePoll | null> {
  const { data: invites } = await sb
    .from("poll_invites")
    .select("poll_id, sent_at")
    .eq("person_id", personId)
    .order("sent_at", { ascending: false })
    .limit(20);
  const ids = [...new Set((invites ?? []).map((i) => i.poll_id))];
  if (!ids.length) return null;

  const { data: polls } = await sb
    .from("polls")
    .select(`${POLL_COLUMNS}, status, closes_at`)
    .in("id", ids)
    .eq("status", "live");
  const open = (polls ?? []).filter((p) => !p.closes_at || Date.parse(p.closes_at) > Date.now());
  const byId = new Map(open.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = byId.get(id);
    if (p) return rowToEnginePoll(p);
  }
  return null;
}

/* ------------------------------------------------------------ inbound SMS */

export type InboundRoute = "opt_out" | "opt_in" | "poll" | "poll_help" | "inbox" | "ignored";

/**
 * One inbound SMS. STOP is honoured before anything else, so someone trying
 * to leave is never mistaken for someone answering a poll.
 */
export async function handleInboundSms(
  sb: Sb,
  rawFrom: string,
  text: string,
): Promise<InboundRoute> {
  const person = await upsertPersonByPhone(sb, rawFrom, "sms");
  if (!person) return "ignored";

  const body = (text ?? "").trim().slice(0, 1000);
  await logEvent(sb, person.id, "sms_in", "sms", body);

  const saveInbound = (conversationId: string | null) =>
    sb.from("messages").insert({
      person_id: person.id,
      conversation_id: conversationId,
      phone: person.phone,
      channel: "sms",
      direction: "in",
      body,
      status: "received",
      outbox_kind: "reply",
    });

  const reply = (msg: Omit<QueueItem, "personId" | "phone" | "channel">) =>
    queueMessages(sb, [{ personId: person.id, phone: person.phone, channel: "sms", ...msg }]);

  let route: InboundRoute;

  if (isStopWord(body)) {
    await saveInbound(null);
    await updatePerson(sb, person.id, {
      opted_out: true,
      opted_out_at: new Date().toISOString(),
      consent_sms: false,
      consent_whatsapp: false,
      consent_call: false,
    });
    await logEvent(sb, person.id, "opt_out", "sms", "Replied STOP");
    // A 'reply' passes the consent check: confirming the opt-out is the one
    // message someone who just opted out must still get.
    await reply({ body: optOutText(CAMPAIGN), kind: "reply" });
    route = "opt_out";
  } else if (isStartWord(body)) {
    await saveInbound(null);
    await updatePerson(sb, person.id, { opted_out: false, opted_out_at: null, consent_sms: true });
    await logEvent(sb, person.id, "opt_in", "sms", "Replied START");
    await reply({
      body: `${CAMPAIGN}: Umejiunga. Tuma STOP wakati wowote kujiondoa.`,
      kind: "reply",
    });
    route = "opt_in";
  } else {
    const poll = await invitedLivePoll(sb, person.id);
    const answer = poll ? parseAnswer(poll, body) : null;
    if (poll && answer) {
      await saveInbound(null);
      const outcome = await recordResponse(sb, poll, person, "sms", answer);
      await reply({
        body: thanksText(poll, CAMPAIGN, outcome.rewarded),
        kind: "poll_thanks",
        pollId: poll.id,
      });
      route = "poll";
    } else if (poll && /^\d\b/.test(body)) {
      // Looks like an attempt at an answer that did not match: help, don't guess.
      await saveInbound(null);
      await reply({ body: helpText(poll), kind: "reply", pollId: poll.id });
      route = "poll_help";
    } else {
      // Not a command and not an answer: a person wrote to the campaign.
      const conversationId = await openConversation(sb, person.id, "Inbound SMS", body);
      await saveInbound(conversationId);
      route = "inbox";
    }
  }

  await settleIfDryRun(sb);
  return route;
}

/* ------------------------------------------------------------------- USSD */

/** Africa's Talking truncates past 182 characters; better to trim ourselves. */
const USSD_MAX = 182;
const fit = (s: string) => (s.length <= USSD_MAX ? s : s.slice(0, USSD_MAX - 1) + "…");

/** The live USSD poll that best fits this caller: aimed at them, else open to all. */
async function ussdPollFor(sb: Sb, person: PersonRef): Promise<EnginePoll | null> {
  const { data } = await sb
    .from("polls")
    .select(`${POLL_COLUMNS}, audience, channels, closes_at, launched_at`)
    .eq("status", "live")
    .contains("channels", ["ussd"])
    .order("launched_at", { ascending: false });
  const open = (data ?? []).filter((p) => !p.closes_at || Date.parse(p.closes_at) > Date.now());
  const aimed = open.find((p) => inAudience(p.audience, person.wardId, person.segment));
  return aimed ? rowToEnginePoll(aimed) : null;
}

/**
 * One USSD request. Africa's Talking sends the whole path each time as
 * `text` ("1*3"); reply "CON …" to continue or "END …" to close.
 */
export async function handleUssd(sb: Sb, rawPhone: string, text: string): Promise<string> {
  const person = await upsertPersonByPhone(sb, rawPhone, "ussd");
  if (!person) return "END Samahani, namba hii haitambuliki.";

  const parts = text ? text.split("*") : [];
  const [top, ...rest] = parts;
  const poll = await ussdPollFor(sb, person);

  if (!top) {
    return fit(
      [
        `CON ${CAMPAIGN}`,
        poll ? "1. Jibu kura ya maoni" : "1. Hakuna kura sasa",
        "2. Jiunge kama mjitolea",
        "3. Nipigie simu",
        "4. Acha kupokea SMS",
      ].join("\n"),
    );
  }

  if (top === "1") {
    if (!poll) return "END Hakuna kura ya maoni kwa sasa. Asante!";
    if (!rest.length) {
      await sb
        .from("poll_invites")
        .upsert(
          { poll_id: poll.id, person_id: person.id, channel: "ussd" },
          { onConflict: "poll_id,person_id,channel", ignoreDuplicates: true },
        );
      const q = questionText(poll);
      if (poll.kind === "open") return fit(`CON ${q}\n(Andika jibu lako)`);
      const sw = poll.lang === "sw";
      return fit(
        `CON ${q}\n` +
          poll.options.map((o) => `${o.key}. ${sw && o.labelSw ? o.labelSw : o.label}`).join("\n"),
      );
    }
    const answer = parseAnswer(poll, rest.join("*"));
    if (!answer) return "END Jibu si sahihi. Piga tena na uchague namba.";
    const outcome = await recordResponse(sb, poll, person, "ussd", answer);
    await settleIfDryRun(sb);
    return fit(
      `END Asante! Jibu lako limepokelewa.${outcome.rewarded ? rewardLine(poll, true) : ""}`,
    );
  }

  if (top === "2") {
    if (!rest.length) return "CON Andika jina lako:";
    const name = rest.join(" ").trim().slice(0, 60);
    if (!name) return "END Jina halikupatikana. Piga tena.";
    // Dialling in and choosing to volunteer is the person's own action, on
    // their own line: that is consent to be contacted about it.
    const { data: current } = await sb.from("people").select("tags").eq("id", person.id).single();
    await updatePerson(sb, person.id, {
      full_name: name,
      consent_sms: true,
      consent_call: true,
      opted_out: false,
      opted_out_at: null,
      tags: [...new Set([...(current?.tags ?? []), "Volunteer"])],
    });
    await logEvent(sb, person.id, "volunteer", "ussd", "Signed up to volunteer on USSD");
    await openConversation(sb, person.id, "Volunteer sign-up", `${name} wants to volunteer.`);
    return fit(`END Asante ${name.split(" ")[0]}! Mratibu wa wadi atakupigia hivi karibuni.`);
  }

  if (top === "3") {
    await updatePerson(sb, person.id, { consent_call: true });
    await logEvent(sb, person.id, "callback_request", "ussd", "Asked for a call back");
    await openConversation(sb, person.id, "Call-back request", "Asked for a call back on USSD.");
    return "END Tumepokea. Tutakupigia ndani ya saa 24.";
  }

  if (top === "4") {
    await updatePerson(sb, person.id, {
      opted_out: true,
      opted_out_at: new Date().toISOString(),
      consent_sms: false,
      consent_whatsapp: false,
    });
    await logEvent(sb, person.id, "opt_out", "ussd", "Opted out on USSD");
    return "END Umejiondoa. Hutapokea SMS zaidi.";
  }

  return "END Chaguo si sahihi.";
}
