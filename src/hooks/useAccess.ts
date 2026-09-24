import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

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

/**
 * Read in the browser, from the signed-in session: row level security lets
 * each person read only their own roles, and this only decides what the
 * console shows. What data anyone gets is decided in the database.
 */
export function useAccess() {
  const { data, isPending, isError, refetch, isFetching } = useQuery<Access>({
    queryKey: ["my-access"],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Not signed in.");
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id);
      if (error) throw new Error("Could not check your access.");
      const roles = (rows ?? []).map((r) => r.role as string);
      return {
        userId: auth.user.id,
        roles,
        isPrincipal: roles.includes("admin") || roles.includes("manager"),
        isAdmin: roles.includes("admin"),
        isPending: !roles.some((r) => TEAM_ROLES.includes(r)),
      };
    },
    staleTime: 5 * 60_000,
  });
  return {
    access: data,
    loading: isPending,
    failed: isError,
    checking: isFetching,
    recheck: refetch,
    isPrincipal: data?.isPrincipal ?? false,
    isAdmin: data?.isAdmin ?? false,
    isPendingApproval: data?.isPending ?? false,
  };
}
