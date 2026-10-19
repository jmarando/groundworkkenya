// The Daraja Pulse link: the brief Groundwork sends and the report Pulse answers, as the
// contract in docs/superpowers/specs/2026-10-20-daraja-pulse-link-design.md has them. Pure.
// The calls are src/lib/pulse.server.ts; the server functions src/lib/pulse.functions.ts.

export type PulseBrief = {
  campaign_name: string;
  objective: string;
  brief: string;
  tone: string;
  hashtag: string;
  hashtags_extra: string[];
  mandatory_mentions: string[];
  dos: string[];
  donts: string[];
  start_date: string;
  end_date: string;
  budget_kes: number;
  paid_for_by: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** One item a line (or a comma for tags), blanks dropped, at most `n`. */
const lines = (v: unknown, n = 12, max = 200) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n/) : [])
    .map((x) => text(x, max))
    .filter(Boolean)
    .slice(0, n);
const tags = (v: unknown) =>
  (typeof v === "string" ? v.split(/[\s,]+/) : Array.isArray(v) ? v : [])
    .map((x) => text(x, 60))
    .filter(Boolean)
    .map((x) => (x.startsWith("#") || x.startsWith("@") ? x : `#${x}`))
    .slice(0, 10);

/** The brief as Pulse takes it, or the sentence saying what's missing. */
export function checkBrief(
  raw: unknown,
): { ok: true; brief: PulseBrief } | { ok: false; why: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const campaign_name = text(r["campaign_name"], 120);
  if (!campaign_name) return { ok: false, why: "Give the brief a name." };
  const objective = text(r["objective"], 600);
  const brief = text(r["brief"], 4000);
  if (!objective || !brief)
    return { ok: false, why: "Say what the creators should achieve, and the message." };
  const start_date = text(r["start_date"], 10);
  const end_date = text(r["end_date"], 10);
  if (!DATE.test(start_date) || !DATE.test(end_date))
    return { ok: false, why: "Give the dates it runs." };
  if (end_date < start_date) return { ok: false, why: "It can't end before it starts." };
  const budget_kes = Math.round(Number(r["budget_kes"]));
  if (!Number.isFinite(budget_kes) || budget_kes <= 0)
    return { ok: false, why: "Give the budget in shillings." };
  const paid_for_by = text(r["paid_for_by"], 160);
  if (paid_for_by.length < 3)
    return { ok: false, why: 'Give the "Paid for by" line every post carries.' };
  const [hashtag = "", ...hashtags_extra] = tags(r["hashtags"]);
  return {
    ok: true,
    brief: {
      campaign_name,
      objective,
      brief,
      tone: text(r["tone"], 200),
      hashtag,
      hashtags_extra,
      mandatory_mentions: lines(r["mandatory_mentions"], 6, 60),
      dos: lines(r["dos"]),
      donts: lines(r["donts"]),
      start_date,
      end_date,
      budget_kes,
      paid_for_by,
    },
  };
}

export type PulseCreator = {
  id: string;
  name: string;
  handle: string | null;
  platform: string | null;
  followers: number | null;
  fee_kes: number | null;
  status: string | null;
};
export type PulsePost = {
  id: string;
  creator_id: string;
  platform: string | null;
  url: string | null;
  posted_at: string | null;
  status: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
};
export type PulsePayout = {
  id: string;
  creator_id: string;
  gross_kes: number;
  wht_kes: number | null;
  net_kes: number | null;
  status: string | null;
  paid_at: string | null;
};
export type PulseReport = {
  pulse_campaign_id: string;
  status: string | null;
  creators: PulseCreator[];
  posts: PulsePost[];
  payouts: PulsePayout[];
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];
/** Only a web link opens from the screen. */
const webUrl = (v: unknown) => {
  const s = str(v);
  return s && /^https:\/\//i.test(s) ? s : null;
};

/** Pulse's answer as the screen reads it; anything malformed is dropped, never trusted. */
export function readReport(raw: unknown): PulseReport | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r["pulse_campaign_id"]);
  if (!id) return null;
  return {
    pulse_campaign_id: id,
    status: str(r["status"]),
    creators: arr(r["creators"]).flatMap((c) => {
      const cid = str(c["id"]);
      const name = str(c["name"]);
      return cid && name
        ? [
            {
              id: cid,
              name,
              handle: str(c["handle"]),
              platform: str(c["platform"]),
              followers: num(c["followers"]),
              fee_kes: num(c["fee_kes"]),
              status: str(c["status"]),
            },
          ]
        : [];
    }),
    posts: arr(r["posts"]).flatMap((p) => {
      const pid = str(p["id"]);
      const creator = str(p["creator_id"]);
      return pid && creator
        ? [
            {
              id: pid,
              creator_id: creator,
              platform: str(p["platform"]),
              url: webUrl(p["url"]),
              posted_at: str(p["posted_at"]),
              status: str(p["status"]),
              views: num(p["views"]),
              likes: num(p["likes"]),
              comments: num(p["comments"]),
              shares: num(p["shares"]),
              reach: num(p["reach"]),
            },
          ]
        : [];
    }),
    payouts: arr(r["payouts"]).flatMap((p) => {
      const pid = str(p["id"]);
      const creator = str(p["creator_id"]);
      const gross = num(p["gross_kes"]);
      return pid && creator && gross !== null && gross > 0
        ? [
            {
              id: pid,
              creator_id: creator,
              gross_kes: gross,
              wht_kes: num(p["wht_kes"]),
              net_kes: num(p["net_kes"]),
              status: str(p["status"]),
              paid_at: str(p["paid_at"]),
            },
          ]
        : [];
    }),
  };
}

/** What the report adds up to: posts live, views, and money committed and paid. */
export function reportTotals(r: PulseReport) {
  return {
    creators: r.creators.length,
    posts: r.posts.filter((p) => p.url).length,
    views: r.posts.reduce((t, p) => t + (p.views ?? 0), 0),
    fees: r.creators.reduce((t, c) => t + (c.fee_kes ?? 0), 0),
    paid: r.payouts.filter((p) => p.status === "paid").reduce((t, p) => t + p.gross_kes, 0),
  };
}

/** The paid payouts, as record_creator_payouts takes them (each once; the database checks again). */
export function payoutsForFinance(r: PulseReport) {
  const names = new Map(r.creators.map((c) => [c.id, c.name]));
  return r.payouts
    .filter((p) => p.status === "paid")
    .map((p) => ({
      id: p.id,
      creator: names.get(p.creator_id) ?? "",
      gross_kes: p.gross_kes,
      paid_at: p.paid_at,
    }));
}
