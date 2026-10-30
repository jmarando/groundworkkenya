// Which unread posts the mood reader takes next. Posts come newest first; each campaign's newest
// is taken in turn, so one busy campaign (Sakaja's 168 posts in a day, 30 October 2026) never
// keeps another's few unread. Pure; src/lib/listening.server.ts reads the moods.

/** Up to `limit` rows, the campaigns taken in turn, each campaign's rows in the order given. */
export function fairShare<T extends { campaign_id?: string | null }>(
  rows: T[],
  limit: number,
): T[] {
  const queues = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.campaign_id ?? "";
    const q = queues.get(key) ?? [];
    q.push(r);
    queues.set(key, q);
  }
  const out: T[] = [];
  for (let i = 0; out.length < limit; i++) {
    let took = false;
    for (const q of queues.values()) {
      if (out.length >= limit) break;
      const r = q[i];
      if (r) {
        out.push(r);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}
