// The database counts as the rules read them: each row checked, anything
// malformed dropped. Pure.

import {
  ISSUE_SOURCES,
  type IssueSource,
  type IssueWeek,
  type RivalWeek,
  type WardIssue,
} from "@/lib/findings/core";

type Row = Record<string, unknown>;

const rowsOf = (data: unknown): Row[] =>
  Array.isArray(data) ? data.filter((r): r is Row => typeof r === "object" && r !== null) : [];

/** A whole number from a count or a numeric column (which can arrive as text). */
const whole = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const source = (v: unknown): IssueSource | null =>
  (ISSUE_SOURCES as string[]).includes(String(v)) ? (v as IssueSource) : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function toWardIssues(data: unknown): WardIssue[] {
  return rowsOf(data).flatMap((r) => {
    const wardId = text(r["ward_id"]);
    const s = source(r["source"]);
    const issue = text(r["issue"]);
    const n = whole(r["n"]);
    return wardId && s && issue && n !== null ? [{ wardId, source: s, issue, n }] : [];
  });
}

export function toIssueWeeks(data: unknown): IssueWeek[] {
  return rowsOf(data).flatMap((r) => {
    const week = whole(r["week"]);
    const s = source(r["source"]);
    const issue = text(r["issue"]);
    const n = whole(r["n"]);
    return week !== null && s && issue && n !== null ? [{ week, source: s, issue, n }] : [];
  });
}

export function toRivalWeeks(data: unknown): RivalWeek[] {
  return rowsOf(data).flatMap((r) => {
    const week = whole(r["week"]);
    const n = whole(r["n"]);
    const rival = r["rival_id"];
    if (week === null || n === null || (rival !== null && typeof rival !== "string")) return [];
    return [{ week, rivalId: rival, n }];
  });
}

export function toWardSpend(data: unknown): { wardId: string; kes: number }[] {
  return rowsOf(data).flatMap((r) => {
    const wardId = text(r["ward_id"]);
    const kes = whole(r["kes"]);
    return wardId && kes !== null ? [{ wardId, kes }] : [];
  });
}

export function toWardSupporters(data: unknown): { wardId: string; supporters: number }[] {
  return rowsOf(data).flatMap((r) => {
    const wardId = text(r["ward_id"]);
    const supporters = whole(r["supporters"]);
    return wardId && supporters !== null ? [{ wardId, supporters }] : [];
  });
}
