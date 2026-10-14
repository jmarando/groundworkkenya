// A house on the Voters map: its plus code and footprint (from the house
// file, so a link opens it as well as a click), a note when the outline is
// big enough to be several homes, who is on file there, and its visits.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { PersonRow } from "@/lib/console.functions";
import { houseAt } from "@/lib/house-source";
import { band, BAND_COLOUR, blockNote, OUTCOME_COLOUR, OUTCOME_LABEL } from "@/lib/houses";
import { getHouse } from "@/lib/houses.functions";
import type { MapArea } from "@/lib/map-areas";
import { maskPhone } from "@/lib/phone";

const nf = new Intl.NumberFormat("en-KE");
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

export function HouseCard({
  pc,
  mapArea,
  people,
  onClose,
  onPerson,
}: {
  pc: string;
  mapArea: MapArea;
  /** Everyone on file; null for agents, who don't get the People list. */
  people: PersonRow[] | null;
  onClose: () => void;
  /** Opens a record on the People tab; left out for agents. */
  onPerson?: (id: string) => void;
}) {
  const fetchHouse = useServerFn(getHouse);
  const { data: house, isPending: outlinePending } = useQuery({
    queryKey: ["house-at", mapArea.id, pc],
    queryFn: () => houseAt(mapArea, pc),
    staleTime: Infinity,
  });
  const { data: visits } = useQuery({
    queryKey: ["house", pc],
    queryFn: () => fetchHouse({ data: { pc } }),
  });
  const here = (people ?? []).filter((p) => p.house === pc);
  const note = blockNote(house?.area ?? null);

  return (
    <section className="vhouse" aria-label={`House ${pc}`}>
      <div className="card-head">
        <div>
          <span className="eyebrow">House</span>
          <h2 className="mono">{pc}</h2>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="meta">
        {house
          ? `Footprint about ${nf.format(house.area)} m²`
          : outlinePending
            ? "Reading its outline…"
            : "Its outline isn't in the house file."}
      </p>
      {note ? <p className="vhouse-note">{note}</p> : null}

      {people ? (
        <>
          <h3>On file here</h3>
          {here.length ? (
            <div className="f-rows">
              {here.map((p) => {
                const b = band(p.support);
                return (
                  <div className="f-row" key={p.id}>
                    <span>
                      {onPerson ? (
                        <button type="button" className="vt-link" onClick={() => onPerson(p.id)}>
                          {p.name}
                        </button>
                      ) : (
                        <b>{p.name}</b>
                      )}{" "}
                      <span className="mono dim">{maskPhone(p.phone)}</span>
                    </span>
                    <span>
                      {b ? (
                        <>
                          <i className="vdot" style={{ background: BAND_COLOUR[b] }} />
                          Support {b} of 5
                        </>
                      ) : (
                        "Not scored"
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="meta">No one on file is placed at this house yet.</p>
          )}
        </>
      ) : null}

      <h3>Visits</h3>
      {visits === undefined ? (
        <p className="meta">Reading the visits…</p>
      ) : visits === null ? (
        <p className="meta">The house data isn't in yet.</p>
      ) : visits.length ? (
        <ol className="vvisits">
          {visits.map((v, i) => (
            <li key={`${v.at}-${i}`}>
              <span className="mono">{day(v.at)}</span>
              <span>
                <b style={{ color: OUTCOME_COLOUR[v.outcome] }}>{OUTCOME_LABEL[v.outcome]}</b>
                {v.support ? ` · support ${v.support} of 5` : ""}
                {v.issue ? ` · ${v.issue}` : ""}
              </span>
              <small>
                {v.agent ?? "Agent not on record"}
                {v.person ? ` · ${v.person.name}` : ""}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">No visits recorded at this house yet.</p>
      )}
    </section>
  );
}
