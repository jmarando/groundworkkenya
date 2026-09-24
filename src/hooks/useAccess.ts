import { useQuery } from "@tanstack/react-query";
import type { Access } from "@/lib/access.functions";
import { supabase } from "@/integrations/supabase/client";

export function useAccess() {
  const { data, isPending } = useQuery<Access>({
    queryKey: ["my-access"],
    queryFn: async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Not signed in");
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      if (error) throw error;
      const roles = (rows ?? []).map((row) => row.role as string);
      return {
        userId: userData.user.id,
        roles,
        isPrincipal: roles.includes("admin") || roles.includes("manager"),
      };
    },
    staleTime: 5 * 60_000,
  });
  return {
    access: data,
    loading: isPending,
    isPrincipal: data?.isPrincipal ?? false,
  };
}
