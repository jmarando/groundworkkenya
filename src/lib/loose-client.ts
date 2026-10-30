// A Supabase client read loosely, for the tables and functions a migration adds before
// src/integrations/supabase/types.ts is regenerated (that happens after the migration is applied).
// The database's own policies still apply to whatever client is passed in; this only lifts the
// compile-time types. Drop a use of it once the generated types know the table.

export type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- by design, see above
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- by design, see above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const loose = (sb: unknown): LooseClient => sb as LooseClient;
