// Storing what one Listening keyword found (listening_mentions), each address once per campaign.
// One upsert takes all its rows or none, so when the database refuses a keyword's batch the posts
// go in one at a time, and a post it can't take costs only itself, not the keyword's whole find.
// Daraja Pulse lost whole scans this way to half an emoji (src/lib/clip.ts keeps that out of the
// text now); this covers whatever else one post may carry.

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the service-role Supabase client, loosely
  from: (table: string) => any;
};

export type Stored = {
  /** Posts that were new. */
  stored: number;
  /** Posts the database refused even on their own. */
  skipped: number;
  /** Why, in the database's words; null when none was refused. */
  reason: string | null;
};

export async function storeMentions(sb: Client, rows: Record<string, unknown>[]): Promise<Stored> {
  const save = async (batch: Record<string, unknown>[]) => {
    const { data, error } = await sb
      .from("listening_mentions")
      .upsert(batch, { onConflict: "campaign_id,url", ignoreDuplicates: true })
      .select("id");
    return {
      count: Array.isArray(data) ? data.length : 0,
      error: error as { message: string } | null,
    };
  };
  if (!rows.length) return { stored: 0, skipped: 0, reason: null };
  const all = await save(rows);
  if (!all.error) return { stored: all.count, skipped: 0, reason: null };

  let stored = 0;
  let skipped = 0;
  let reason: string | null = null;
  for (const row of rows) {
    const one = await save([row]);
    if (one.error) {
      skipped++;
      reason ??= one.error.message;
    } else stored += one.count;
  }
  return { stored, skipped, reason };
}
