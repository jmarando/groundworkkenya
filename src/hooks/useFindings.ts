// The findings for the campaign in view, read once and shared by every
// screen that shows them: Strategy, Home, Elections, Voters and the Diary.
// Field agents and people not yet admitted don't ask.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAccess } from "@/hooks/useAccess";
import { getFindings } from "@/lib/findings.functions";
import { FINDINGS_READERS } from "@/lib/findings/core";

export function useFindings() {
  const { access, campaign } = useAccess();
  const fetchFindings = useServerFn(getFindings);
  return useQuery({
    queryKey: ["findings", campaign?.id ?? null],
    queryFn: () => fetchFindings(),
    enabled: Boolean(campaign?.id) && FINDINGS_READERS.includes(String(access?.role)),
    staleTime: 5 * 60_000,
  });
}
