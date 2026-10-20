// The caller's role on their campaign, checked on the server before a server function reads or
// writes anything a page guard alone would hide. The database's own policies still apply.

import { OFFICE_ROLES, type MyRole } from "@/lib/access";

type Rpc = {
  rpc: (
    fn: "my_campaign_role",
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** The caller's role when it is one of `allowed`; throws `refusal` otherwise. */
export async function requireRole(
  sb: Rpc,
  allowed: readonly MyRole[],
  refusal = "That is for the campaign office.",
): Promise<MyRole> {
  const { data, error } = await sb.rpc("my_campaign_role");
  const role = (typeof data === "string" ? data : null) as MyRole;
  if (error || !allowed.includes(role)) throw new Error(refusal);
  return role;
}

/** Everyone on the team but field agents: the office reads the voter file and the inbox. */
export const requireOffice = (sb: Rpc, refusal?: string) => requireRole(sb, OFFICE_ROLES, refusal);
