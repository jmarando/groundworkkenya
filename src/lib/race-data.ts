// A campaign's real race: its rivals and the polls published about it. Pure,
// so every rule here can be checked without a browser or a database.

import type { Tone } from "@/lib/demo/types";

export type RaceRival = {
  id: string;
  name: string;
  party: string | null;
  /** Their base: "Embakasi East MP". */
  office: string | null;
  /** The campaign's own candidate. */
  isUs: boolean;
  tone: Tone;
  sort: number;
  facebook: string | null;
  x: string | null;
  tiktok: string | null;
};

export type PollShare = { name: string; share: number; rivalId: string | null };

export type RacePoll = {
  id: string;
  pollster: string;
  fieldworkFrom: string | null;
  fieldworkTo: string | null;
  publishedOn: string;
  sampleSize: number | null;
  margin: number | null;
  /** Where it was published. */
  sourceUrl: string;
  /** Every named candidate's share, as published. */
  shares: PollShare[];
  undecided: number | null;
  /** Job approval of the sitting office holder, where the poll asked. */
  approval: number | null;
  disapproval: number | null;
};

export type CleanRival = Omit<RaceRival, "id"> & { id: string | null };
export type CleanPoll = Omit<RacePoll, "id"> & { id: string | null };

/** Colours a rival can take; "us" is kept for the campaign's own candidate. */
export const RIVAL_TONES: readonly Tone[] = ["a", "b", "c", "d"];

// ------------------------------------------------------------------ rows

export type RivalRow = {
  id: string;
  name: string;
  party: string | null;
  office: string | null;
  is_us: boolean;
  tone: string;
  sort: number;
  facebook: string | null;
  x: string | null;
  tiktok: string | null;
};

export type PollRow = {
  id: string;
  pollster: string;
  fieldwork_from: string | null;
  fieldwork_to: string | null;
  published_on: string;
  sample_size: number | null;
  margin: number | string | null;
  source_url: string;
  shares: unknown;
  undecided: number | string | null;
  approval: number | string | null;
  disapproval: number | string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function rivalFromRow(r: RivalRow): RaceRival {
  const tones: string[] = ["us", ...RIVAL_TONES];
  return {
    id: r.id,
    name: r.name,
    party: r.party,
    office: r.office,
    isUs: r.is_us,
    tone: tones.includes(r.tone) ? (r.tone as Tone) : "a",
    sort: r.sort,
    facebook: r.facebook,
    x: r.x,
    tiktok: r.tiktok,
  };
}

export function pollFromRow(r: PollRow): RacePoll {
  const shares = Array.isArray(r.shares) ? (r.shares as Record<string, unknown>[]) : [];
  return {
    id: r.id,
    pollster: r.pollster,
    fieldworkFrom: r.fieldwork_from,
    fieldworkTo: r.fieldwork_to,
    publishedOn: r.published_on,
    sampleSize: r.sample_size,
    margin: num(r.margin),
    sourceUrl: r.source_url,
    shares: shares.flatMap((s) => {
      const share = num(s?.["share"]);
      const name = s?.["name"];
      const rivalId = s?.["rival_id"];
      return typeof name === "string" && share !== null
        ? [{ name, share, rivalId: typeof rivalId === "string" ? rivalId : null }]
        : [];
    }),
    undecided: num(r.undecided),
    approval: num(r.approval),
    disapproval: num(r.disapproval),
  };
}

// ------------------------------------------------------------------ input

const text = (v: unknown, max: number): string | null => {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
};

const HANDLES = {
  facebook: {
    re: /^[A-Za-z0-9._-]{2,100}$/,
    hosts: /^(www\.|m\.|web\.)?facebook\.com$/i,
    label: "Facebook page",
  },
  x: {
    re: /^[A-Za-z0-9_]{1,15}$/,
    hosts: /^(www\.|mobile\.)?(x|twitter)\.com$/i,
    label: "X handle",
  },
  tiktok: {
    re: /^[A-Za-z0-9_.]{2,24}$/,
    hosts: /^(www\.|m\.)?tiktok\.com$/i,
    label: "TikTok handle",
  },
} as const;

/** "@Name", "Name" or a link to the profile, as the bare handle; blank is none. */
export function handleOf(kind: "facebook" | "x" | "tiktok", raw: unknown): string | null {
  const h = HANDLES[kind];
  let v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      throw new Error(`That ${h.label} link doesn't look right.`);
    }
    if (!h.hosts.test(u.hostname)) throw new Error(`That ${h.label} link doesn't look right.`);
    v = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (kind === "facebook" && v === "profile.php") v = u.searchParams.get("id") ?? "";
  }
  v = v.replace(/^@/, "");
  if (!h.re.test(v)) throw new Error(`That ${h.label} doesn't look right.`);
  return v;
}

export type RivalInput = {
  id?: string | null;
  name?: string;
  party?: string | null;
  office?: string | null;
  isUs?: boolean;
  tone?: string;
  sort?: number | string | null;
  facebook?: string | null;
  x?: string | null;
  tiktok?: string | null;
};

export function cleanRival(input: RivalInput): CleanRival {
  const name = text(input.name, 80);
  if (!name || name.length < 2) throw new Error("Give the candidate's name.");
  const isUs = input.isUs === true;
  const tone = isUs
    ? "us"
    : (RIVAL_TONES as string[]).includes(String(input.tone))
      ? (input.tone as Tone)
      : null;
  if (!tone) throw new Error("Pick a colour for them.");
  const sort = Math.round(Number(input.sort ?? 0));
  return {
    id: typeof input.id === "string" && input.id ? input.id : null,
    name,
    party: text(input.party, 80),
    office: text(input.office, 80),
    isUs,
    tone,
    sort: Number.isFinite(sort) ? Math.max(0, Math.min(99, sort)) : 0,
    facebook: handleOf("facebook", input.facebook),
    x: handleOf("x", input.x),
    tiktok: handleOf("tiktok", input.tiktok),
  };
}

export type PollInput = {
  id?: string | null;
  pollster?: string;
  fieldworkFrom?: string | null;
  fieldworkTo?: string | null;
  publishedOn?: string;
  sampleSize?: number | string | null;
  margin?: number | string | null;
  sourceUrl?: string;
  shares?: { name?: string; share?: number | string | null; rivalId?: string | null }[];
  undecided?: number | string | null;
  approval?: number | string | null;
  disapproval?: number | string | null;
};

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

function day(v: unknown, what: string): string | null {
  if (blank(v)) return null;
  const s = String(v).trim();
  const t = Date.parse(`${s}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number.isNaN(t) ||
    new Date(t).toISOString().slice(0, 10) !== s
  )
    throw new Error(`${what} isn't a date.`);
  return s;
}

function pct(v: unknown, what: string): number | null {
  if (blank(v)) return null;
  const n = Number(String(v).replace("%", "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100)
    throw new Error(`${what} must be between 0 and 100.`);
  return Math.round(n * 10) / 10;
}

function httpsLink(v: unknown): string | null {
  const s = String(v ?? "").trim();
  try {
    return new URL(s).protocol === "https:" && s.length <= 500 && !/\s/.test(s) ? s : null;
  } catch {
    return null;
  }
}

export function cleanPoll(input: PollInput, rivals: RaceRival[], todayIso: string): CleanPoll {
  const pollster = text(input.pollster, 80);
  if (!pollster || pollster.length < 2) throw new Error("Who ran the poll?");
  const publishedOn = day(input.publishedOn, "The publication date");
  if (!publishedOn) throw new Error("When was it published?");
  if (publishedOn > todayIso) throw new Error("The publication date is in the future.");
  const fieldworkFrom = day(input.fieldworkFrom, "The fieldwork start");
  const fieldworkTo = day(input.fieldworkTo, "The fieldwork end");
  if (fieldworkFrom && fieldworkTo && fieldworkFrom > fieldworkTo)
    throw new Error("Fieldwork ends before it starts.");
  if ((fieldworkTo ?? fieldworkFrom ?? publishedOn) > publishedOn)
    throw new Error("Fieldwork ends after the poll was published.");

  const sampleSize = blank(input.sampleSize)
    ? null
    : Math.round(Number(String(input.sampleSize).replace(/[,\s]/g, "")));
  if (
    sampleSize !== null &&
    (!Number.isFinite(sampleSize) || sampleSize < 50 || sampleSize > 1_000_000)
  )
    throw new Error("The sample size should be a number of people, like 1820.");
  const margin = blank(input.margin) ? null : Number(String(input.margin).replace(/[±%\s]/g, ""));
  if (margin !== null && (!Number.isFinite(margin) || margin <= 0 || margin > 15))
    throw new Error("The margin of error should be a few points, like 2.3.");

  const sourceUrl = httpsLink(input.sourceUrl);
  if (!sourceUrl) throw new Error("Add the link to where the poll was published (https://…).");

  const byId = new Map(rivals.map((r) => [r.id, r]));
  const byName = new Map(rivals.map((r) => [r.name.toLowerCase(), r]));
  const seen = new Map<string, string>();
  const shares: PollShare[] = [];
  for (const row of input.shares ?? []) {
    const name = text(row.name, 80);
    if (!name && blank(row.share)) continue;
    const rival =
      (row.rivalId ? byId.get(row.rivalId) : undefined) ??
      (name ? byName.get(name.toLowerCase()) : undefined);
    const who = rival?.name ?? name;
    if (!who || who.length < 2) throw new Error("Each share needs the candidate's name.");
    if (blank(row.share)) {
      if (rival) continue; // a tracked candidate this poll left out
      throw new Error(`What did ${who} get?`);
    }
    const share = pct(row.share, `${who}'s share`)!;
    const first = seen.get(who.toLowerCase());
    if (first) throw new Error(`${first} is listed twice.`);
    seen.set(who.toLowerCase(), who);
    shares.push({ name: who, share, rivalId: rival?.id ?? null });
  }
  if (!shares.length) throw new Error("Add at least one candidate's share.");
  if (shares.length > 20) throw new Error("At most 20 candidates in one poll.");
  const undecided = pct(input.undecided, "Undecided");
  const total = shares.reduce((t, s) => t + s.share, 0) + (undecided ?? 0);
  if (total > 100.5)
    throw new Error(`The shares add up to ${Math.round(total * 10) / 10}%, more than 100.`);

  return {
    id: typeof input.id === "string" && input.id ? input.id : null,
    pollster,
    fieldworkFrom,
    fieldworkTo,
    publishedOn,
    sampleSize,
    margin: margin === null ? null : Math.round(margin * 100) / 100,
    sourceUrl,
    shares,
    undecided,
    approval: pct(input.approval, "Approval"),
    disapproval: pct(input.disapproval, "Disapproval"),
  };
}

// ------------------------------------------------------------------ reading polls

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
const dayOf = (iso: string) => String(Number(iso.slice(8, 10)));

/** When the poll measured opinion: the end of fieldwork where known. */
export const pollDate = (p: RacePoll): string => p.fieldworkTo ?? p.publishedOn;
export const monthLabel = (iso: string): string => `${month(iso)} ${iso.slice(0, 4)}`;
export const pollLabel = (p: RacePoll): string => `${p.pollster}, ${monthLabel(pollDate(p))}`;

/** "21–28 Aug 2026", "21 Aug – 3 Sep 2026", or when it was published. */
export function fieldworkLabel(p: RacePoll): string {
  const a = p.fieldworkFrom;
  const b = p.fieldworkTo;
  if (a && b) {
    if (a.slice(0, 7) === b.slice(0, 7))
      return `${dayOf(a)}–${dayOf(b)} ${month(b)} ${b.slice(0, 4)}`;
    if (a.slice(0, 4) === b.slice(0, 4))
      return `${dayOf(a)} ${month(a)} – ${dayOf(b)} ${month(b)} ${b.slice(0, 4)}`;
    return `${dayOf(a)} ${month(a)} ${a.slice(0, 4)} – ${dayOf(b)} ${month(b)} ${b.slice(0, 4)}`;
  }
  if (b) return `to ${dayOf(b)} ${month(b)} ${b.slice(0, 4)}`;
  return `published ${dayOf(p.publishedOn)} ${month(p.publishedOn)} ${p.publishedOn.slice(0, 4)}`;
}

/** Newest first: by fieldwork end (or publication), then publication, then pollster. */
export function byRecency(a: RacePoll, b: RacePoll): number {
  return (
    pollDate(b).localeCompare(pollDate(a)) ||
    b.publishedOn.localeCompare(a.publishedOn) ||
    a.pollster.localeCompare(b.pollster)
  );
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Their share in a poll: by rival, or by name for polls entered before they were tracked. */
export function shareOf(p: RacePoll, r: RaceRival): number | null {
  const s =
    p.shares.find((x) => x.rivalId === r.id) ??
    p.shares.find((x) => !x.rivalId && sameName(x.name, r.name));
  return s ? s.share : null;
}

// ------------------------------------------------------------------ the verdict

const PLACES = [
  "",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
];
const list = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

/** Where the latest poll that names our candidate puts them, in one line. */
export function realVerdict(rivals: RaceRival[], polls: RacePoll[]): string {
  const us = rivals.find((r) => r.isUs);
  if (!us) return "";
  const poll = [...polls].sort(byRecency).find((p) => shareOf(p, us) !== null);
  if (!poll) return "";
  const ours = shareOf(poll, us)!;
  const nameOf = (s: PollShare) => rivals.find((r) => r.id === s.rivalId)?.name ?? s.name;
  const isUs = (s: PollShare) => s.rivalId === us.id || (!s.rivalId && sameName(s.name, us.name));
  const others = poll.shares.filter((s) => !isUs(s)).sort((a, b) => b.share - a.share);
  const ahead = others.filter((s) => s.share > ours);
  const level = others.filter((s) => s.share === ours);
  const src = ` (${pollLabel(poll)})`;
  if (!ahead.length) {
    if (level.length) return `Level with ${list(level.map(nameOf))} on ${ours}%${src}.`;
    const next = others[0];
    return next ? `Leading ${nameOf(next)} by ${(ours - next.share).toFixed(1)} points${src}.` : "";
  }
  if (ahead.length === 1)
    return `Second, ${(ahead[0]!.share - ours).toFixed(1)} points behind ${nameOf(ahead[0]!)}${src}.`;
  const place = PLACES[ahead.length + 1] ?? `Number ${ahead.length + 1}`;
  return `${place}, behind ${list(ahead.map(nameOf))}${src}.`;
}

// ------------------------------------------------------------------ rival moves

export type RivalMove = { title: string; detail: string };

/**
 * The biggest change for a rival between one pollster's last two polls, when
 * the newer one came out in the last `withinDays` and moved at least `minPoints`.
 */
export function rivalMove(
  rivals: RaceRival[],
  polls: RacePoll[],
  todayIso: string,
  minPoints = 2,
  withinDays = 30,
): RivalMove | null {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const byPollster = new Map<string, RacePoll[]>();
  for (const p of polls) {
    const k = p.pollster.trim().toLowerCase();
    byPollster.set(k, [...(byPollster.get(k) ?? []), p]);
  }
  let best: {
    r: RaceRival;
    from: number;
    to: number;
    older: RacePoll;
    newer: RacePoll;
    d: number;
  } | null = null;
  for (const mine of byPollster.values()) {
    const [newer, older] = [...mine].sort(byRecency);
    if (!newer || !older) continue;
    if ((today - Date.parse(`${newer.publishedOn}T00:00:00Z`)) / 864e5 > withinDays) continue;
    for (const r of rivals) {
      if (r.isUs) continue;
      const to = shareOf(newer, r);
      const from = shareOf(older, r);
      if (to === null || from === null) continue;
      const d = Math.round(Math.abs(to - from) * 10) / 10;
      if (d < minPoints) continue;
      if (!best || d > best.d || (d === best.d && r.name < best.r.name))
        best = { r, from, to, older, newer, d };
    }
  }
  if (!best) return null;
  return {
    title: `${best.r.name} ${best.to > best.from ? "up" : "down"} ${best.d.toFixed(1)} points in ${best.newer.pollster}'s latest poll`,
    detail: `From ${best.from}% in ${monthLabel(pollDate(best.older))} to ${best.to}% in ${monthLabel(pollDate(best.newer))}.`,
  };
}

// ------------------------------------------------------------------ the chart

export type ChartSeries = {
  key: string;
  label: string;
  tone: Tone | "und";
  values: (number | null)[];
};
export type PollChartModel = {
  /** Oldest first. */
  polls: RacePoll[];
  /** Each poll's place along the time axis, 0 to 1, by date. */
  xs: number[];
  labels: string[];
  series: ChartSeries[];
  /** Top of the scale, a multiple of 10 with room above the highest share. */
  max: number;
};

/** Every poll placed by date, a series per candidate it named, and undecided. */
export function pollChart(rivals: RaceRival[], polls: RacePoll[]): PollChartModel {
  const sorted = [...polls].sort(byRecency).reverse();
  const t = sorted.map((p) => Date.parse(`${pollDate(p)}T00:00:00Z`));
  const t0 = t[0] ?? 0;
  const t1 = t.at(-1) ?? 0;
  const xs = t.map((v) => (t1 > t0 ? (v - t0) / (t1 - t0) : 0.5));
  const ordered = [...rivals].sort(
    (a, b) => Number(b.isUs) - Number(a.isUs) || a.sort - b.sort || a.name.localeCompare(b.name),
  );
  const series: ChartSeries[] = ordered
    .map((r) => ({
      key: r.id,
      label: r.name,
      tone: r.tone as Tone | "und",
      values: sorted.map((p) => shareOf(p, r)),
    }))
    .filter((s) => s.values.some((v) => v !== null));
  if (sorted.some((p) => p.undecided !== null)) {
    series.push({
      key: "undecided",
      label: "Undecided",
      tone: "und",
      values: sorted.map((p) => p.undecided),
    });
  }
  const top = Math.max(
    0,
    ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)),
  );
  return {
    polls: sorted,
    xs,
    labels: sorted.map((p) => monthLabel(pollDate(p))),
    series,
    max: Math.max(10, Math.ceil((top + 2) / 10) * 10),
  };
}
