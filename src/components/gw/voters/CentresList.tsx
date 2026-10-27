// A ward's polling centres in the Voters panel: those on the map with their register and the
// houses knocked in their area, then those not on it yet, each with a way to put it there.

import type { Centre, CentreDoors } from "@/lib/centres";
import { nf } from "@/lib/format";

export function CentresList({
  placed,
  waiting,
  doors,
  open,
  canPlace,
  state,
  onOpen,
  onPlace,
}: {
  placed: Centre[];
  waiting: Centre[];
  /** Houses knocked per centre's area; none while they are read or when they can't be. */
  doors: Map<string, CentreDoors> | null | undefined;
  /** The open centre's code. */
  open: string | null;
  canPlace: boolean;
  /** Whether the centres were read: still being, can't be (before schema 27), or are. */
  state: "reading" | "missing" | "ready";
  onOpen: (code: string) => void;
  onPlace: (centre: Centre) => void;
}) {
  const sub = (c: Centre) =>
    `${nf.format(c.streams)} ${c.streams === 1 ? "stream" : "streams"} · ${nf.format(c.voters)} registered ${
      c.voters === 1 ? "voter" : "voters"
    }`;
  return (
    <section className="vcentres" aria-label="Polling centres">
      <div className="card-head">
        <h2>Polling centres</h2>
        <span className="mono">IEBC register of 2022</span>
      </div>
      {state === "reading" ? (
        <p className="meta">Reading the polling centres…</p>
      ) : state === "missing" ? (
        <p className="meta">
          The polling centres aren't in yet: they appear once the database update is applied.
        </p>
      ) : !placed.length && !waiting.length ? (
        <p className="meta">No polling centres on file for this ward.</p>
      ) : (
        <>
          {placed.map((c) => {
            const knocked = doors?.get(c.id)?.knocked;
            return (
              <div
                className="vnext-row"
                key={c.id}
                aria-current={open === c.code ? "true" : undefined}
              >
                <div className="vnext-what">
                  <b>{c.name}</b>
                  <span className="meta">
                    {sub(c)}
                    {knocked === undefined
                      ? ""
                      : ` · ${nf.format(knocked)} ${knocked === 1 ? "house" : "houses"} knocked`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  aria-label={`Details of ${c.name}`}
                  onClick={() => onOpen(c.code)}
                >
                  Details
                </button>
              </div>
            );
          })}
          {waiting.length ? (
            <>
              <h3>Not on the map yet</h3>
              {waiting.map((c) => (
                <div
                  className="vnext-row"
                  key={c.id}
                  aria-current={open === c.code ? "true" : undefined}
                >
                  <div className="vnext-what">
                    <b>{c.name}</b>
                    <span className="meta">{sub(c)}</span>
                  </div>
                  <div className="vcentre-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Details of ${c.name}`}
                      onClick={() => onOpen(c.code)}
                    >
                      Details
                    </button>
                    {canPlace ? (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => onPlace(c)}
                      >
                        Place it
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
