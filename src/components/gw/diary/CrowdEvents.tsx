import { useCrowdActions, useCrowdEvents } from "@/components/gw/diary/hooks";
import { CROWD_KIND_NAMES, type CrowdEvent } from "@/lib/crowd-events";
import { dayName } from "@/lib/diary";

function EventRow({ e, canEdit }: { e: CrowdEvent; canEdit: boolean }) {
  const { adding, setting, busy } = useCrowdActions(e);
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
                disabled={busy}
              >
                Add to the diary
              </button>
              <button
                type="button"
                className="diary-link"
                onClick={() => setting.mutate()}
                disabled={busy}
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
