// The campaign's own spending limit, as IEBC gazetted it for the seat, and where it came from.
// Null when it isn't on file: the screens say so rather than borrow another seat's limit.

export type SpendingLimit = { kes: number; source: string | null } | null;

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string) => any;
};

export async function spendingLimit(sb: Client): Promise<SpendingLimit> {
  if (!sb.rpc) return null;
  const { data: id } = ((await sb.rpc("my_campaign")) ?? {}) as { data?: unknown };
  if (!id) return null;
  const { data } = (await sb
    .from("campaigns")
    .select("spending_limit_kes, spending_limit_source")
    .eq("id", String(id))
    .maybeSingle()) as {
    data: {
      spending_limit_kes: number | string | null;
      spending_limit_source: string | null;
    } | null;
  };
  const kes = Number(data?.spending_limit_kes ?? 0);
  return kes > 0 ? { kes, source: data?.spending_limit_source ?? null } : null;
}
