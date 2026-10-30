// What the sweeps tell the database about the views and shares they saw on posts it already holds
// (record_post_counts, schema 46). The post keeps the highest count seen; a reading is saved when
// the counts moved or the last one is six hours old, so how a post spread can be drawn later.
// Counts only. History is best effort: a failure here never fails a sweep.

export type Counted = {
  campaign_id: string;
  url: string;
  reach: number | null;
  shares: number | null;
};

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const CHUNK = 200;

const count = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;

const higher = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/** The rows that carry a count: one per post, with the highest views and the highest shares seen. */
export function withCounts(rows: Counted[]): Counted[] {
  const byPost = new Map<string, Counted>();
  for (const r of rows) {
    const reach = count(r.reach);
    const shares = count(r.shares);
    if (reach === null && shares === null) continue;
    const key = `${r.campaign_id}\n${r.url}`;
    const seen = byPost.get(key);
    byPost.set(key, {
      campaign_id: r.campaign_id,
      url: r.url,
      reach: higher(seen?.reach ?? null, reach),
      shares: higher(seen?.shares ?? null, shares),
    });
  }
  return [...byPost.values()];
}

/**
 * An hourly run that gathered records its day for every campaign with a keyword (record_sweep_days).
 * A paused run does not call it, which is what lets Replay tell a paused day from a quiet one.
 */
export async function recordSweepDays(sb: Rpc): Promise<{ swept: number } | { error: string }> {
  try {
    const { data, error } = await sb.rpc("record_sweep_days", {});
    if (error)
      return { error: (error as { message?: string }).message ?? "The day was not recorded." };
    return { swept: typeof data === "number" ? data : 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The day was not recorded." };
  }
}

/** Saves what a sweep saw; returns how many readings were saved. */
export async function recordCounts(sb: Rpc, rows: Counted[]): Promise<number> {
  const counted = withCounts(rows);
  let saved = 0;
  for (let i = 0; i < counted.length; i += CHUNK) {
    try {
      const { data, error } = await sb.rpc("record_post_counts", {
        _rows: counted.slice(i, i + CHUNK),
      });
      if (!error && typeof data === "number") saved += data;
    } catch {
      // History is best effort.
    }
  }
  return saved;
}
