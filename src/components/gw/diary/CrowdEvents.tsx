import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useAccess } from "@/hooks/useAccess";
import { CROWD_KIND_NAMES, type CrowdEvent } from "@/lib/crowd-events";
import { addCrowdEvent, dismissCrowdEvent, getCrowdEvents } from "@/lib/crowd-events.functions";
import { dayName } from "@/lib/diary";

/** The events found in the news for the campaign's area, read once a minute at most. */
function useCrowdEvents() {
  const { campaign } = useAccess();
  const fetchEvents = useServerFn(getCrowdEvents);
  return useQuery({
    queryKey: ["crowd-events", campaign?.id ?? null],
    queryFn: () => fetchEvents(),
    enabled: Boolean(campaign?.id),
    staleTime: 60_000,
  });
}

function EventRow({ e, canEdit }: { e: CrowdEvent; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const add = useServerFn(addCrowdEvent);
  const dismiss = useServerFn(dismissCrowdEvent);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["crowd-events"] });
    await queryClient.invalidateQueries({ queryKey: ["diary"] });
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    await queryClient.invalidateQueries({ queryKey: ["findings"] });
  };
  const adding = useMutation({
    mutationFn: () => add({ data: { id: e.id } }),
    onSuccess: async () => {
      toast.success(`Added to ${dayName(e.day)}.`);
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const setting = useMutation({
    mutationFn: () => dismiss({ data: { id: e.id } }),
    onSuccess: refresh,
    onError: (err: Error) => toast.error(err.message),
  });
  const where = [e.place, e.wardName].filter(Boolean).join(" · ");
  return (
    <li className="crowd-row">
      <span className="mb-time-at">
        {dayName(e.day)}
        {e.startsAt ? <span className="crowd-at">{e.startsAt}</span> : null}
      </span>
      <div>
        <p className="diary-entry-kind">
          {CROWD_KIND_NAMES[e.kind]}
          {where ? ` · ${where}` : ""}
        </p>
        <p className="diary-entry-title">{e.title}</p>
        {e.why || e.crowd ? (
          <p className="mb-time-why">{[e.crowd, e.why].filter(Boolean).join(". ")}</p>
        ) : null}
        <div className="diary-actions">
          <a className="diary-link" href={e.url} target="_blank" rel="noreferrer">
            {e.sourceName ? `Read it in ${e.sourceName}` : "Read the source"}
          </a>
          {e.status === "added" ? (
            <span className="crowd-added">In the diary</span>
          ) : canEdit ? (
            <>
              <button
                type="button"
                className="diary-link crowd-add"
                onClick={() => adding.mutate()}
                disabled={adding.isPending || setting.isPending}
              >
                Add to the diary
              </button>
              <button
                type="button"
                className="diary-link"
                onClick={() => setting.mutate()}
                disabled={adding.isPending || setting.isPending}
              >
                Not for us
              </button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Where the crowds are: funerals, church events, harambees, tournaments and shows in the
 * campaign's area, found in the news each day, for the team to add to the diary or set aside.
 */
export function CrowdEvents({ canEdit }: { canEdit: boolean }) {
  const { data } = useCrowdEvents();
  const events = data?.events ?? [];
  return (
    <section className="card crowd" aria-labelledby="crowd-title">
      <div className="card-head">
        <h2 id="crowd-title">Where the crowds are</h2>
        <span className="mono">next three weeks · found in the news</span>
      </div>
      {events.length ? (
        <ol className="mb-time crowd-list">
          {events.map((e) => (
            <EventRow key={e.id} e={e} canEdit={canEdit} />
          ))}
        </ol>
      ) : (
        <p className="meta">
          {data
            ? "No funerals, church events, harambees, tournaments or shows found in your area yet. The news is read for them once a day."
            : "Reading what's coming up…"}
        </p>
      )}
    </section>
  );
}
