import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Access = {
  userId: string;
  roles: string[];
  /** Candidate (admin) or campaign manager (manager) — the money-and-strategy circle. */
  isPrincipal: boolean;
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Access> => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data ?? []).map((r) => r.role as string);
    return {
      userId: context.userId,
      roles,
      isPrincipal: roles.includes("admin") || roles.includes("manager"),
    };
  });
