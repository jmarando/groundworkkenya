// The poll engine as pure functions: no database, no network.
//
// Shaped by what a voter can type on a feature phone. Replies come back as
// "1", "ndio", "Ndiyo.", "2 maji" or a shouted "ACHA", and all of it has to
// land in the right place.

export type PollKind = "single_choice" | "yesno" | "open";
export type PollLang = "sw" | "en";
export type RewardMethod = "none" | "airtime" | "mpesa";

export type PollOption = { key: string; label: string; labelSw?: string };

export type EnginePoll = {
  id: string;
  code: string;
  question: string;
  questionSw: string | null;
  kind: PollKind;
  lang: PollLang;
  options: PollOption[];
  weighting: boolean;
  rewardMethod: RewardMethod;
  rewardAmount: number;
};

/** Max reward per respondent. Mirrored by a CHECK constraint on polls. */
export const REWARD_MAX_KES = 500;

/** Anything a person might send to get out. Deliberately generous. */
const STOP_WORDS = [
  "stop",
  "stopall",
  "stop all",
  "unsubscribe",
  "end",
  "quit",
  "acha",
  "achana",
  "simama",
  "ondoa",
  "ondoka",
  "sitaki",
];

/** And back in again. */
const START_WORDS = ["start", "anza", "subscribe", "rudi", "nataka", "join"];

const YES = ["1", "yes", "y", "ndio", "ndiyo", "sawa", "eeh", "yeah", "yep"];
const NO = ["2", "no", "n", "hapana", "la", "sio", "apana"];

const clean = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[.!,]+$/, "");

export function isStopWord(text: string): boolean {
  return STOP_WORDS.includes(clean(text));
}

export function isStartWord(text: string): boolean {
  return START_WORDS.includes(clean(text));
}

/* ------------------------------------------------------------- validation */

export type PollDraft = {
  question: string;
  kind: PollKind;
  options: { label: string }[];
  channels: string[];
  rewardMethod: RewardMethod;
  rewardAmount: number;
};

/** A human sentence, or null when the draft is sound. Shared by builder and server. */
export function validateDraft(d: PollDraft): string | null {
  const q = d.question.trim();
  if (q.length < 5) return "Write the question out in full — at least a few words.";
  if (q.length > 300) return "Keep the question under 300 characters so it fits an SMS.";
  if (d.kind !== "open") {
    const n = d.options.filter((o) => o.label.trim()).length;
    if (n < 2) return "Give people at least two options to choose from.";
    // Replies are single digits, and a USSD menu has to fit one screen.
    if (n > 9) return "SMS and USSD replies are single digits, so nine options is the limit.";
  }
  if (!d.channels.length) return "Pick at least one channel.";
  if (d.rewardMethod !== "none") {
    if (!(d.rewardAmount > 0)) return "Set the reward amount, or choose no reward.";
    if (d.rewardAmount > REWARD_MAX_KES) {
      return `Rewards are capped at KES ${REWARD_MAX_KES} per person.`;
    }
    if (d.rewardMethod === "mpesa" && d.rewardAmount < 10) return "M-Pesa payouts start at KES 10.";
  }
  return null;
}

/** Options get stable single-digit keys: that is what people reply with. */
export function keyedOptions(options: { label: string; labelSw?: string | null }[]): PollOption[] {
  return options
    .filter((o) => o.label.trim())
    .slice(0, 9)
    .map((o, i) => {
      const opt: PollOption = { key: String(i + 1), label: o.label.trim() };
      const sw = o.labelSw?.trim();
      if (sw) opt.labelSw = sw;
      return opt;
    });
}

/** Six characters for /p/<code>, without O/0 or I/1 to misread aloud. */
export function shortCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return out;
}

/**
 * Does a person fall inside a poll's audience? Audiences look like
 * {"wardIds": [...], "segments": [...]}, and an empty or missing list means
 * "any". Mirrors public.in_poll_audience() in the database — change both.
 */
export function inAudience(
  audience: unknown,
  wardId: string | null,
  segment: string | null,
): boolean {
  const a = (audience && typeof audience === "object" ? audience : {}) as Record<string, unknown>;
  const matches = (list: unknown, value: string | null) =>
    !Array.isArray(list) || list.length === 0 || (value !== null && list.includes(value));
  return matches(a["wardIds"], wardId) && matches(a["segments"], segment);
}

/** The human label the existing poll cards show, e.g. "Airtime KES 20". */
export function rewardLabel(method: RewardMethod, amount: number): string | null {
  if (method === "none" || amount <= 0) return null;
  return `${method === "mpesa" ? "M-Pesa" : "Airtime"} KES ${amount}`;
}

/* ------------------------------------------------------------------- text */

const optionText = (o: PollOption, sw: boolean) =>
  (sw && o.labelSw ? o.labelSw : o.label).replace(/^\d\s*[·.)]\s*/, "");

export function questionText(poll: EnginePoll): string {
  return poll.lang === "sw" && poll.questionSw ? poll.questionSw : poll.question;
}

/**
 * The invite as it arrives on a handset. Identical for everyone on purpose:
 * Africa's Talking sends one body to up to 100 numbers in a single request,
 * and a per-person greeting would turn one request into a hundred.
 */
export function smsInvite(poll: EnginePoll, campaign: string): string {
  const sw = poll.lang === "sw";
  const q = questionText(poll);
  const tag = campaign.toUpperCase().replace(/\s+/g, "");
  const outro = sw ? "Bure. STOP kujiondoa" : "Free. STOP to opt out";
  if (poll.kind === "open") {
    return `${tag}: ${q} ${sw ? "Jibu kwa ujumbe." : "Reply with your answer."} ${outro}`;
  }
  const opts = poll.options.map((o) => `${o.key} ${optionText(o, sw)}`).join(", ");
  return `${tag}: ${q} ${sw ? "Jibu" : "Reply"} ${opts}. ${outro}`;
}

export function rewardLine(poll: EnginePoll, sw: boolean): string {
  if (poll.rewardMethod === "none" || poll.rewardAmount <= 0) return "";
  if (poll.rewardMethod === "mpesa") {
    return sw
      ? ` Tunakutumia KES ${poll.rewardAmount} kwa M-Pesa.`
      : ` KES ${poll.rewardAmount} is on its way to your M-Pesa.`;
  }
  return sw
    ? ` Tumekutumia KES ${poll.rewardAmount} ya airtime.`
    : ` KES ${poll.rewardAmount} airtime is on its way.`;
}

export function thanksText(poll: EnginePoll, campaign: string, rewarded: boolean): string {
  const sw = poll.lang === "sw";
  const r = rewarded ? rewardLine(poll, sw) : "";
  return sw
    ? `Asante! Jibu lako limepokelewa.${r} — ${campaign}`
    : `Thank you! Your answer is in.${r} — ${campaign}`;
}

export function helpText(poll: EnginePoll): string {
  const n = poll.options.length;
  return poll.lang === "sw"
    ? `Samahani, hatukuelewa. Jibu kwa namba 1-${n}. STOP kujiondoa`
    : `Sorry, we didn't catch that. Reply with a number 1-${n}. STOP to opt out`;
}

export function optOutText(campaign: string): string {
  return `Umejiondoa. Hutapokea ujumbe zaidi kutoka ${campaign}. Tuma START kurudi.`;
}

/** Double opt-in: sent once, and consent is only recorded if they reply START. */
export function consentRequestText(campaign: string): string {
  return `${campaign}: Mtu aliomba taarifa za kampeni kwa namba hii. Jibu START kukubali. Usipojibu, hutapokea ujumbe zaidi.`;
}

/* ---------------------------------------------------------------- answers */

export type ParsedAnswer = { optionKey: string | null; freeText: string | null };

/**
 * Make sense of a reply: a leading digit, then yes/no words, then a match
 * against the option labels in either language. Returns null when it cannot
 * tell — the caller sends helpText rather than guessing, because a wrong
 * guess is a wrong data point in the results.
 */
export function parseAnswer(poll: EnginePoll, raw: string): ParsedAnswer | null {
  const t = clean(raw);
  if (!t) return null;

  if (poll.kind === "open") return { optionKey: null, freeText: raw.trim().slice(0, 500) };

  const lead = t.match(/^(\d)\b/);
  if (lead?.[1] && poll.options.some((o) => o.key === lead[1])) {
    return { optionKey: lead[1], freeText: null };
  }

  if (poll.kind === "yesno") {
    if (YES.includes(t)) return { optionKey: "1", freeText: null };
    if (NO.includes(t)) return { optionKey: "2", freeText: null };
  }

  const hit = poll.options.find((o) =>
    [o.label, o.labelSw ?? ""].some((label) => {
      const l = label.toLowerCase();
      if (!l) return false;
      return l === t || l.startsWith(t + " ") || (t.length >= 4 && l.includes(t));
    }),
  );
  return hit ? { optionKey: hit.key, freeText: null } : null;
}

/* ---------------------------------------------------------------- results */

/** One aggregate row from poll_tallies(): answers by ward, option and channel. */
export type Tally = { wardId: string | null; optionKey: string | null; channel: string; n: number };
export type FrameRow = { wardId: string | null; n: number };

export type WeightedOption = {
  key: string;
  label: string;
  count: number;
  share: number;
  weighted: number;
};

export type PollResults = {
  responses: number;
  invites: number;
  responseRate: number | null;
  marginOfError: number | null;
  options: WeightedOption[];
};

/**
 * Weight every ward to its share of the audience frame, so a ward that happens
 * to reply enthusiastically does not swamp a quiet one. Without this, results
 * describe who answered rather than who lives there.
 */
export function weightedResults(
  poll: EnginePoll,
  tallies: Tally[],
  frame: FrameRow[],
  invites: number,
): PollResults {
  const n = tallies.reduce((s, t) => s + t.n, 0);
  const frameTotal = frame.reduce((s, f) => s + f.n, 0);
  const key = (w: string | null) => w ?? "—";

  const frameByWard = new Map(frame.map((f) => [key(f.wardId), f.n]));
  const respByWard = new Map<string, number>();
  for (const t of tallies)
    respByWard.set(key(t.wardId), (respByWard.get(key(t.wardId)) ?? 0) + t.n);

  const weightOf = (wardId: string | null): number => {
    if (!poll.weighting || !frameTotal || !n) return 1;
    const got = respByWard.get(key(wardId)) ?? 0;
    const want = frameByWard.get(key(wardId)) ?? 0;
    // A ward outside the frame (e.g. someone who moved) keeps its raw weight.
    if (!got || !want) return 1;
    return want / frameTotal / (got / n);
  };

  const totalWeight = tallies.reduce((s, t) => s + t.n * weightOf(t.wardId), 0) || 1;

  const options = poll.options.map((o) => {
    const mine = tallies.filter((t) => t.optionKey === o.key);
    const count = mine.reduce((s, t) => s + t.n, 0);
    return {
      key: o.key,
      label: o.label,
      count,
      share: n ? count / n : 0,
      weighted: mine.reduce((s, t) => s + t.n * weightOf(t.wardId), 0) / totalWeight,
    };
  });

  // Design effect: weighting buys representativeness at the cost of
  // precision, so the interval is widened rather than overstating confidence.
  const deff = poll.weighting ? 1.4 : 1;

  return {
    responses: n,
    invites,
    responseRate: invites ? n / invites : null,
    marginOfError: n > 30 ? Math.round((98 / Math.sqrt(n / deff)) * 10) / 10 : null,
    options,
  };
}
