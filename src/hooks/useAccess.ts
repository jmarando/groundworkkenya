import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyAccess, type Access } from "@/lib/access.functions";

export function useAccess() {
  const fetchAccess = useServerFn(getMyAccess);
  const { data, isPending, isError, refetch, isFetching } = useQuery<Access>({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess(),
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
