import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyAccess, type Access } from "@/lib/access.functions";

export function useAccess() {
  const fetchAccess = useServerFn(getMyAccess);
  const { data, isPending } = useQuery<Access>({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess(),
    staleTime: 5 * 60_000,
  });
  return {
    access: data,
    loading: isPending,
    isPrincipal: data?.isPrincipal ?? false,
  };
}
