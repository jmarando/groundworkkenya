// "Your walk lists": the lists out with this person, each with its centre, how far along it is
// (visits waiting on the phone count) and when it was given. Opening one is a tap.

import { useMyWalkLists } from "@/hooks/useMyWalkLists";
import type { Queued } from "@/lib/field";
import { givenText } from "@/lib/walk-list-run";
import { progressText, queuedDoors } from "@/lib/walk-lists";

export function WalkLists({
  online,
  queue,
  onOpen,
}: {
  online: boolean;
  queue: Queued[];
  onOpen: (id: string) => void;
}) {
  const { data: lists, isError } = useMyWalkLists(online);

  if (!lists)
    return (
      <p className="f-note">
        {isError
          ? online
            ? "Your walk lists aren't available yet. Today's ward list is below."
            : "Your walk lists need signal once to open. Today's ward list is below."
          : "Reading your walk lists…"}
      </p>
    );
  if (lists.length === 0)
    return <p className="f-note">No lists given to you yet. Today's ward list is below.</p>;

  return (
    <ul className="wl-lists">
      {lists.map((l) => {
        const done = Math.min(l.doors, l.done + queuedDoors(queue, l.id).size);
        return (
          <li key={l.id}>
            <button type="button" className="wl-row" onClick={() => onOpen(l.id)}>
              <b>{l.name}</b>
              <span className="wl-count">{progressText(done, l.doors)}</span>
              <small>
                {[l.centreName, givenText(l.givenAt)].filter(Boolean).join(" · ") || "Walk list"}
              </small>
              <span
                className="wl-bar"
                role="progressbar"
                aria-label={progressText(done, l.doors)}
                aria-valuemin={0}
                aria-valuemax={l.doors}
                aria-valuenow={done}
              >
                <i style={{ width: `${l.doors ? Math.round((100 * done) / l.doors) : 0}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
