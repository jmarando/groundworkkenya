// The data side of Big voices: reads the window the Voices tab is on (7, 30 or 90 days), so the
// columns are not capped at the latest 600 posts the page loads. The screen is BigVoices.tsx.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BigVoicesView } from "@/components/gw/listening/BigVoices";
import { QueryState } from "@/components/gw/QueryState";
import type { BigVoice, Level } from "@/lib/big-voices";
import { getBigVoices } from "@/lib/big-voices.functions";

export function BigVoicesPanel({
  days,
  open,
  brief,
  react,
}: {
  days: number;
  open: (v: BigVoice) => void;
  brief?: (v: BigVoice, level: Level) => void;
  react?: ((mentionId: string) => void) | undefined;
}) {
  const fetchData = useServerFn(getBigVoices);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["big-voices", days],
    queryFn: () => fetchData({ data: { days } }),
  });
  return (
    <>
      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="the big voices"
      />
      {data && (
        <BigVoicesView
          data={data}
          open={open}
          {...(brief ? { brief } : {})}
          {...(react ? { react } : {})}
        />
      )}
    </>
  );
}
