// A ward's open walk lists in the Voters panel: each with who has it and how far along it is,
// and a way to open its card.

import { holderText, progressText } from "@/lib/walk-lists";
import type { ListSummary } from "@/lib/walk-lists.functions";

export function WalkListsList({
  lists,
  open,
  onOpen,
}: {
  /** Undefined while they are read, null when they can't be (before schema 28). */
  lists: ListSummary[] | null | undefined;
  /** The open list's id. */
  open: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="vcentres" aria-label="Walk lists">
      <div className="card-head">
        <h2>Walk lists</h2>
        <span className="mono">open in this ward</span>
      </div>
      {lists === undefined ? (
        <p className="meta">Reading the walk lists…</p>
      ) : lists === null ? (
        <p className="meta">
          Walk lists aren't in yet: they appear once the database update is applied.
        </p>
      ) : lists.length === 0 ? (
        <p className="meta">No walk lists are open in this ward.</p>
      ) : (
        lists.map((l) => (
          <div className="vnext-row" key={l.id} aria-current={open === l.id ? "true" : undefined}>
            <div className="vnext-what">
              <b>{l.name}</b>
              <span className="meta">
                {holderText(l.givenToName, l.givenAt)} · {progressText(l.done, l.doors)}
              </span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOpen(l.id)}>
              Open
            </button>
          </div>
        ))
      )}
    </section>
  );
}
