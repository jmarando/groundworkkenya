// What the diary's calendar, its panel and the crowd list share: reading again after a
// change, the atlas line and the records for each stop, and the crowd events found in
// the news with what can be done to them.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { useAccess } from "@/hooks/useAccess";
import { useFindings } from "@/hooks/useFindings";
import { briefLine, wardKey } from "@/lib/atlas-app";
import { getAtlas } from "@/lib/atlas.functions";
import type { CrowdEvent } from "@/lib/crowd-events";
import { addCrowdEvent, dismissCrowdEvent, getCrowdEvents } from "@/lib/crowd-events.functions";
import { addDays, dayName, type DiaryEntry } from "@/lib/diary";
import type { DiaryRange } from "@/lib/diary.functions";
import { defaultRace } from "@/lib/elections-view";

export type Ward = DiaryRange["wards"][number];

/** The diary, Home, Strategy and the crowd list all show entries: read them again after a change. */
export function useDiaryRefresh() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all(
      ["diary", "home", "findings", "crowd-events"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }, [queryClient]);
}

/**
 * Each stop in a ward, with a line from the last election there (the atlas). A seat-wide race
 * (an MP's, a governor's) gives every stop the same line: then it is `shared`, to say once.
 */
export function useBriefs(
  entries: DiaryEntry[],
  wards: Ward[],
): { briefs: Record<string, string>; shared: string | null } {
  const { campaign } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data: atlas } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    if (!atlas) return { briefs: {}, shared: null };
    const race = defaultRace(campaign?.level);
    const all: Record<string, string> = {};
    for (const e of entries) {
      const w = e.wardId ? wards.find((x) => x.id === e.wardId) : undefined;
      const line = w ? briefLine(atlas, wardKey(atlas, w.constituency, w.slug), race) : null;
      if (line) all[e.id] = line;
    }
    const lines = Object.values(all);
    const shared = lines.length > 1 && lines.every((l) => l === lines[0]) ? lines[0]! : null;
    return { briefs: shared ? {} : all, shared };
  }, [atlas, entries, wards, campaign?.level]);
}

/** Each stop in the next seven days with a ward: that ward's first two message or field findings. */
export function useStopFindings(entries: DiaryEntry[], today: string): Record<string, string[]> {
  const { data } = useFindings();
  return useMemo(() => {
    if (!data) return {};
    const last = addDays(today, 6);
    const out: Record<string, string[]> = {};
    for (const e of entries) {
      const key = e.wardId ? data.wardKeys[e.wardId] : undefined;
      if (!key || e.day < today || e.day > last) continue;
      const lines = data.findings
        .filter((f) => f.place === key && (f.decision === "message" || f.decision === "field"))
        .slice(0, 2)
        .map((f) => f.line);
      if (lines.length) out[e.id] = lines;
    }
    return out;
  }, [data, entries, today]);
}

/** The events found in the news for the campaign's area, read once a minute at most. */
export function useCrowdEvents(enabled = true) {
  const { campaign } = useAccess();
  const fetchEvents = useServerFn(getCrowdEvents);
  return useQuery({
    queryKey: ["crowd-events", campaign?.id ?? null],
    queryFn: () => fetchEvents(),
    enabled: enabled && Boolean(campaign?.id),
    staleTime: 60_000,
  });
}

/** Put a crowd event in the diary, or set it aside. `onAdded` gets the new entry's id. */
export function useCrowdActions(
  e: CrowdEvent,
  then: { onAdded?: (entryId: string) => void; onSetAside?: () => void } = {},
) {
  const add = useServerFn(addCrowdEvent);
  const dismiss = useServerFn(dismissCrowdEvent);
  const refresh = useDiaryRefresh();
  const adding = useMutation({
    mutationFn: () => add({ data: { id: e.id } }),
    onSuccess: async ({ entryId }) => {
      toast.success(`Added to ${dayName(e.day)}.`);
      await refresh();
      then.onAdded?.(entryId);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const setting = useMutation({
    mutationFn: () => dismiss({ data: { id: e.id } }),
    onSuccess: async () => {
      toast.success("Set aside. It won't be suggested again.");
      then.onSetAside?.();
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return { adding, setting, busy: adding.isPending || setting.isPending };
}
