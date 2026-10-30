// What may be asked of Listening's posts by date: a few posts by id, or a run of Nairobi days a
// page at a time. Anything else is refused before the database is asked. Pure.

export type PostsQuery = { ids: string[] } | { from: string; to: string; cursor?: string };

const MAX_IDS = 200;
const MAX_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;
const CURSOR = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2}))\|([0-9a-f-]{36})$/;

const isDay = (s: unknown): s is string =>
  typeof s === "string" &&
  DAY.test(s) &&
  !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Where the next page starts: after this post, newest first. */
export const encodeCursor = (foundAt: string, id: string): string => `${foundAt}|${id}`;

export function decodeCursor(cursor: string): { foundAt: string; id: string } | null {
  const m = CURSOR.exec(cursor);
  return m ? { foundAt: m[1]!, id: m[2]! } : null;
}

/** The query, checked; throws what to tell the caller when it is not one that may be asked. */
export function parsePostsQuery(input: unknown): PostsQuery {
  if (!input || typeof input !== "object") throw new Error("No posts asked for.");
  const q = input as Record<string, unknown>;

  if ("ids" in q) {
    if (!Array.isArray(q["ids"])) throw new Error("Those posts could not be read.");
    const ids = [
      ...new Set(q["ids"].filter((x): x is string => typeof x === "string" && UUID.test(x))),
    ].slice(0, MAX_IDS);
    if (!ids.length) throw new Error("No posts asked for.");
    return { ids };
  }

  const { from, to, cursor } = q;
  if (!isDay(from) || !isDay(to)) throw new Error("Ask for days written like 2026-10-29.");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days < 1) throw new Error("The first day comes before the last.");
  if (days > MAX_DAYS) throw new Error(`Ask for ${MAX_DAYS} days or fewer.`);
  if (cursor === undefined) return { from, to };
  if (typeof cursor !== "string" || !decodeCursor(cursor))
    throw new Error("That page could not be found.");
  return { from, to, cursor };
}
