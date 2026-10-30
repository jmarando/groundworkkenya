// The data side of Big voices: reads the window the Voices tab is on (7, 30 or 90 days), so the
// columns are not capped at the latest 600 posts the page loads, and opens the brief for a voice
// (copying the invitation records the approach). The screens are BigVoices.tsx and BriefVoice.tsx.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { BigVoicesView } from "@/components/gw/listening/BigVoices";
import { BriefVoice } from "@/components/gw/listening/BriefVoice";
import { QueryState } from "@/components/gw/QueryState";
import type { BigVoice, Level } from "@/lib/big-voices";
import { getBigVoices } from "@/lib/big-voices.functions";
import { saveApproach, setApproachStatus } from "@/lib/outreach.functions";

export function BigVoicesPanel({
  days,
  open,
  react,
}: {
  days: number;
  open: (v: BigVoice) => void;
  react?: ((mentionId: string) => void) | undefined;
}) {
  const fetchData = useServerFn(getBigVoices);
  const save = useServerFn(saveApproach);
  const move = useServerFn(setApproachStatus);
  const queryClient = useQueryClient();
  const [briefing, setBriefing] = useState<{ voice: BigVoice; level: Level } | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["big-voices", days],
    queryFn: () => fetchData({ data: { days } }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["big-voices"] });

  if (briefing && data) {
    const { voice, level } = briefing;
    return (
      <BriefVoice
        voice={voice}
        level={level}
        days={days}
        campaign={data.campaign}
        approach={data.approaches[voice.key]}
        pulseConnected={data.pulseConnected}
        close={() => setBriefing(null)}
        copy={async (invitation) => {
          await save({
            data: {
              voice: { key: voice.key, platform: voice.platform, name: voice.name, url: voice.url },
              invitation,
              channel: "copied",
            },
          });
          await refresh();
        }}
        {...(data.canBrief
          ? {
              setStatus: async (status: string) => {
                try {
                  await move({ data: { key: voice.key, status } });
                  await refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "That status could not be set.");
                }
              },
            }
          : {})}
      />
    );
  }

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
          brief={(voice, level) => setBriefing({ voice, level })}
          {...(react ? { react } : {})}
        />
      )}
    </>
  );
}
