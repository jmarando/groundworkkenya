// The campaign's next two weeks: the brief written for it (the political read, the moves by days,
// what to watch) and what its own data says needs doing in the same fortnight. Pure. The brief is
// stored as JSON (campaign_briefs, schema 38) and read here without trust: anything malformed is
// dropped, never shown half-formed.

import type { DiaryEntry } from "@/lib/diary";
import type { PlanList, PlanWard } from "@/lib/field-plan";
import { addDays } from "@/lib/nairobi-date";

export type Source = { label: string; url: string | null; date: string | null };
export type Stance = "strength" | "threat" | "opening" | "context";
export type ReadSection = { title: string; body: string; stance: Stance; sources: Source[] };
export type Move = {
  /** Day of the fortnight it starts and ends, 1 to 14. */
  from: number;
  to: number;
  title: string;
  why: string;
  how: string[];
  /** Wards or places, as written. */
  where: string[];
  measure: string | null;
  /** What the move puts in the diary, when it is a public appearance. */
  diary: { kind: DiaryEntry["kind"]; title: string } | null;
  sources: Source[];
};
export type Watch = { title: string; body: string; sources: Source[] };
export type Brief = {
  id: string;
  startsOn: string;
  endsOn: string;
  headline: string;
  read: ReadSection[];
  moves: Move[];
  watch: Watch[];
  writtenBy: string | null;
  createdAt: string;
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STANCES: Stance[] = ["strength", "threat", "opening", "context"];
const KINDS: DiaryEntry["kind"][] = [
  "visit",
  "market",
  "church",
  "funeral",
  "meeting",
  "media",
  "rally",
  "watch",
];

/** Sources with an https link or none; a link that isn't https is dropped, the label kept. */
export function readSources(v: unknown): Source[] {
  return list(v).flatMap((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const label = str(o["label"], 160);
    if (!label) return [];
    const url = str(o["url"], 500);
    const date = str(o["date"], 10);
    return [
      { label, url: /^https:\/\//.test(url) ? url : null, date: DAY.test(date) ? date : null },
    ];
  });
}

const day = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 14 ? n : null;
};

/** A stored brief, or null when the row isn't one. */
export function readBrief(row: Record<string, unknown> | null | undefined): Brief | null {
  if (!row) return null;
  const id = str(row["id"], 40);
  const startsOn = str(row["starts_on"], 10);
  const endsOn = str(row["ends_on"], 10);
  const headline = str(row["headline"], 300);
  if (!id || !DAY.test(startsOn) || !DAY.test(endsOn) || !headline) return null;
  const read = list(row["the_read"]).flatMap((s): ReadSection[] => {
    const o = (s ?? {}) as Record<string, unknown>;
    const title = str(o["title"], 160);
    const body = str(o["body"], 4000);
    if (!title || !body) return [];
    const stance = STANCES.find((x) => x === o["stance"]) ?? "context";
    return [{ title, body, stance, sources: readSources(o["sources"]) }];
  });
  const moves = list(row["moves"]).flatMap((m): Move[] => {
    const o = (m ?? {}) as Record<string, unknown>;
    const from = day(o["from"]);
    const to = day(o["to"]) ?? from;
    const title = str(o["title"], 200);
    if (!from || !to || to < from || !title) return [];
    const d = (o["diary"] ?? null) as Record<string, unknown> | null;
    const kind = d ? KINDS.find((k) => k === d["kind"]) : undefined;
    return [
      {
        from,
        to,
        title,
        why: str(o["why"], 2000),
        how: list(o["how"])
          .map((h) => str(h, 400))
          .filter(Boolean),
        where: list(o["where"])
          .map((w) => str(w, 80))
          .filter(Boolean),
        measure: str(o["measure"], 400) || null,
        diary: d && kind ? { kind, title: str(d["title"], 120) || title.slice(0, 120) } : null,
        sources: readSources(o["sources"]),
      },
    ];
  });
  const watch = list(row["watch"]).flatMap((w): Watch[] => {
    const o = (w ?? {}) as Record<string, unknown>;
    const title = str(o["title"], 160);
    const body = str(o["body"], 1500);
    return title && body ? [{ title, body, sources: readSources(o["sources"]) }] : [];
  });
  return {
    id,
    startsOn,
    endsOn,
    headline,
    read,
    moves: moves.sort((a, b) => a.from - b.from || a.to - b.to),
    watch,
    writtenBy: str(row["written_by"], 120) || null,
    createdAt: str(row["created_at"], 40),
  };
}

/** The fortnight in four stretches, with each one's dates and the moves that start in it. */
export function bands(brief: Pick<Brief, "startsOn" | "moves">) {
  const parts: [string, number, number][] = [
    ["Days 1–3", 1, 3],
    ["Days 4–7", 4, 7],
    ["Days 8–10", 8, 10],
    ["Days 11–14", 11, 14],
  ];
  return parts.map(([label, from, to]) => ({
    label,
    from: addDays(brief.startsOn, from - 1),
    to: addDays(brief.startsOn, to - 1),
    moves: brief.moves.filter((m) => m.from >= from && m.from <= to),
  }));
}

/** The date a move's first day falls on. */
export const moveDate = (startsOn: string, m: Pick<Move, "from">) => addDays(startsOn, m.from - 1);

/** Public appearances: what counts as the candidate being out among voters. */
const PUBLIC: DiaryEntry["kind"][] = [
  "visit",
  "market",
  "church",
  "funeral",
  "meeting",
  "media",
  "rally",
];

/** Days in the next fortnight with no public appearance in the diary, from `today`. */
export function diaryGaps(
  entries: Pick<DiaryEntry, "day" | "kind">[],
  today: string,
  days = 14,
): string[] {
  const busy = new Set(entries.filter((e) => PUBLIC.includes(e.kind)).map((e) => e.day));
  return Array.from({ length: days }, (_, i) => addDays(today, i)).filter((d) => !busy.has(d));
}

export type LiveAction = {
  key: string;
  tone: "urgent" | "watch" | "good";
  headline: string;
  why: string;
  to: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weekday = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * What the campaign's own records say needs doing this fortnight: open days in the diary, walk
 * lists not yet on a day or with nobody to walk them, and wards with no doors planned. Every
 * number is a count of the records it names.
 */
export function liveActions(input: {
  today: string;
  diary: Pick<DiaryEntry, "day" | "kind">[];
  lists: Pick<PlanList, "status" | "dueOn" | "givenTo" | "wardName">[];
  wards: Pick<PlanWard, "name" | "targetVotes" | "doorsPlanned" | "doorsKnocked">[];
}): LiveAction[] {
  const out: LiveAction[] = [];
  const gaps = diaryGaps(input.diary, input.today);
  if (gaps.length > 0) {
    const weekend = gaps.filter((d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
    out.push({
      key: "diary-gaps",
      tone: gaps.length >= 7 ? "urgent" : "watch",
      headline: `${plural(gaps.length, "day")} of the next 14 have no public appearance booked`,
      why: weekend.length
        ? `Including ${weekend.slice(0, 3).map(weekday).join(", ")}: weekends are when markets, churches and funerals gather the most people.`
        : `The first is ${weekday(gaps[0]!)}.`,
      to: "/diary",
    });
  }
  const open = input.lists.filter((l) => l.status !== "done");
  const noDay = open.filter((l) => !l.dueOn).length;
  const nobody = open.filter((l) => !l.givenTo).length;
  if (noDay + nobody > 0) {
    out.push({
      key: "lists-unplanned",
      tone: "watch",
      headline: `${plural(noDay, "walk list")} with no day${nobody ? `, ${nobody} with nobody to walk ${nobody === 1 ? "it" : "them"}` : ""}`,
      why: "A list with no day and no walker knocks no doors. Put each on a day and give it to someone.",
      to: "/field-plan",
    });
  }
  const bare = input.wards.filter((w) => w.targetVotes > 0 && w.doorsPlanned === 0);
  if (bare.length > 0) {
    out.push({
      key: "wards-bare",
      tone: bare.length > 1 ? "urgent" : "watch",
      headline: `No doors planned in ${bare
        .map((w) => w.name)
        .slice(0, 4)
        .join(", ")}${bare.length > 4 ? ` and ${bare.length - 4} more` : ""}`,
      why: `${plural(bare.length, "ward")} with a vote target and no walk list this fortnight.`,
      to: "/field-plan",
    });
  }
  const knocked = input.wards.reduce((t, w) => t + w.doorsKnocked, 0);
  const planned = input.wards.reduce((t, w) => t + w.doorsPlanned, 0);
  if (planned > 0) {
    out.push({
      key: "doors",
      tone: knocked >= planned / 2 ? "good" : "watch",
      headline: `${knocked.toLocaleString("en-KE")} of ${planned.toLocaleString("en-KE")} planned doors knocked this fortnight`,
      why: "From the walk lists' door records.",
      to: "/field-plan",
    });
  }
  return out;
}

/** The moves running in the `days` from `today` (started already and not yet over, or starting). */
export function movesAhead(
  brief: Pick<Brief, "startsOn" | "moves">,
  today: string,
  days = 7,
): (Move & { on: string; until: string })[] {
  const last = addDays(today, days - 1);
  return brief.moves
    .map((m) => ({
      ...m,
      on: addDays(brief.startsOn, m.from - 1),
      until: addDays(brief.startsOn, m.to - 1),
    }))
    .filter((m) => m.until >= today && m.on <= last);
}
