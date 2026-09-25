// What the ward map shows: the households pinned in a ward, rolled up per
// building. Pure, so the colours and counts can be tested without a map.

import { ISSUES } from "@/lib/field";

export type Outcome = "spoke" | "not_home" | "refused";

export type WardMapRow = {
  id: string;
  name: string;
  phoneMasked: string;
  buildingId: string | null;
  lat: number | null;
  lng: number | null;
  /** 0-100; 0 means nobody has said. */
  support: number;
  segment: string | null;
  /** Consented to SMS and has not said STOP. */
  smsOk: boolean;
  optedOut: boolean;
  lastContactedAt: string | null;
  lastOutcome: Outcome | null;
  lastVisitAt: string | null;
  lastIssue: string | null;
};

export type Status = "strong" | "undecided" | "lean" | "partial" | "none";

export const STATUS: Record<Status, { label: string; colour: string }> = {
  strong: { label: "Leaning our way", colour: "hsl(142, 70%, 45%)" },
  undecided: { label: "Undecided", colour: "hsl(45, 95%, 56%)" },
  lean: { label: "Leaning away", colour: "hsl(0, 88%, 60%)" },
  partial: { label: "Partly knocked", colour: "hsl(200, 85%, 62%)" },
  none: { label: "Not yet knocked", colour: "hsl(0, 0%, 100%)" },
};

export type Band = 0 | 1 | 2 | 3 | 4 | 5;

/** The 0-100 score back on the 1-5 door scale; 0 when unknown. The inverse of SUPPORT_SCORE. */
export function band(score: number): Band {
  if (!score || score <= 0) return 0;
  if (score >= 85) return 5;
  if (score >= 62) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export const BAND_COLOUR: Record<Exclude<Band, 0>, string> = {
  1: "hsl(0, 80%, 55%)",
  2: "hsl(22, 90%, 57%)",
  3: "hsl(45, 95%, 56%)",
  4: "hsl(95, 60%, 48%)",
  5: "hsl(142, 70%, 42%)",
};

const ISSUE_PALETTE = [
  "hsl(200, 85%, 55%)",
  "hsl(28, 90%, 55%)",
  "hsl(270, 60%, 62%)",
  "hsl(50, 95%, 52%)",
  "hsl(330, 70%, 60%)",
  "hsl(160, 60%, 45%)",
  "hsl(0, 75%, 58%)",
  "hsl(220, 70%, 62%)",
];
const OTHER_ISSUE = "hsl(150, 6%, 60%)";

/** "water ", "Water" and "WATER" are one issue. */
export function issueKey(issue: string | null): string | null {
  const t = (issue ?? "").trim();
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** The field app's issue chips keep fixed colours; anything typed under "Other" is grey. */
export function issueColour(issue: string | null): string {
  const k = issueKey(issue);
  const i = ISSUES.findIndex((x) => x.toLowerCase() === (k ?? "").toLowerCase());
  return i >= 0 ? ISSUE_PALETTE[i % ISSUE_PALETTE.length]! : OTHER_ISSUE;
}

export type BuildingStats = {
  households: number;
  knocked: number;
  /** Knocked households whose support is known. */
  rated: number;
  supporters: number;
  undecided: number;
  against: number;
  /** Mean 1-5 support of rated households; 0 if none. */
  avgBand: number;
  status: Status;
  topIssue: string | null;
  reachable: number;
  notKnocked: number;
};

export function statusOf(
  s: Pick<BuildingStats, "households" | "knocked" | "rated" | "avgBand">,
): Status {
  if (!s.knocked) return "none";
  if (s.knocked / Math.max(s.households, 1) < 0.45 || !s.rated) return "partial";
  if (s.avgBand >= 3.6) return "strong";
  if (s.avgBand >= 2.7) return "undecided";
  return "lean";
}

/** Households rolled up per building. People pinned by GPS alone are left to the caller. */
export function aggregate(rows: WardMapRow[]): Map<string, BuildingStats> {
  const acc = new Map<string, { rows: WardMapRow[] }>();
  for (const r of rows) {
    if (!r.buildingId) continue;
    const cur = acc.get(r.buildingId) ?? { rows: [] };
    cur.rows.push(r);
    acc.set(r.buildingId, cur);
  }
  const out = new Map<string, BuildingStats>();
  for (const [id, { rows: hh }] of acc) {
    const knocked = hh.filter((h) => h.lastOutcome !== null);
    const bands = knocked.map((h) => band(h.support)).filter((b) => b > 0);
    const issues = new Map<string, number>();
    for (const h of hh) {
      const k = issueKey(h.lastIssue);
      if (k) issues.set(k, (issues.get(k) ?? 0) + 1);
    }
    const topIssue =
      [...issues.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const base = {
      households: hh.length,
      knocked: knocked.length,
      rated: bands.length,
      supporters: hh.filter((h) => band(h.support) >= 4).length,
      undecided: hh.filter((h) => band(h.support) === 3).length,
      against: hh.filter((h) => {
        const b = band(h.support);
        return b > 0 && b <= 2;
      }).length,
      avgBand: bands.length ? bands.reduce<number>((s, b) => s + b, 0) / bands.length : 0,
      topIssue,
      reachable: hh.filter((h) => h.smsOk).length,
      notKnocked: hh.length - knocked.length,
    };
    out.set(id, { ...base, status: statusOf(base) });
  }
  return out;
}

export type Summary = {
  structures: number;
  households: number;
  knocked: number;
  supporters: number;
  reachable: number;
  notKnocked: number;
};

/** Counts for a set of buildings, e.g. an area selected on the map. */
export function summarise(ids: Iterable<string>, stats: Map<string, BuildingStats>): Summary {
  const s: Summary = {
    structures: 0,
    households: 0,
    knocked: 0,
    supporters: 0,
    reachable: 0,
    notKnocked: 0,
  };
  for (const id of ids) {
    s.structures += 1;
    const b = stats.get(id);
    if (!b) continue;
    s.households += b.households;
    s.knocked += b.knocked;
    s.supporters += b.supporters;
    s.reachable += b.reachable;
    s.notKnocked += b.notKnocked;
  }
  return s;
}
