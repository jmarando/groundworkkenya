import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Roles that count as being on the team. Mirrors public.is_team_member(). */
const TEAM_ROLES = ["admin", "manager", "organiser", "agent"];

export type Access = {
  userId: string;
  roles: string[];
  /** Candidate (admin) or campaign manager (manager) — the money-and-strategy circle. */
  isPrincipal: boolean;
  /** Can admit people and change roles. */
  isAdmin: boolean;
  /** Signed up but not admitted: no role that grants any data. */
  isPending: boolean;
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Access> => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not check your access.");
    const roles = (data ?? []).map((r) => r.role as string);
    return {
      userId: context.userId,
      roles,
      isPrincipal: roles.includes("admin") || roles.includes("manager"),
      isAdmin: roles.includes("admin"),
      isPending: !roles.some((r) => TEAM_ROLES.includes(r)),
    };
  });
