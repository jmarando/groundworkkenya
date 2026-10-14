// A polling centre on the Voters map: its code, ward, streams and registered voters, from
// IEBC's register of 2022.

import type { Centre } from "@/lib/centres";

const nf = new Intl.NumberFormat("en-KE");

export function CentreCard({
  centre,
  wardName,
  onClose,
}: {
  centre: Centre;
  wardName: string | null;
  onClose: () => void;
}) {
  return (
    <section className="vhouse" aria-label={`Polling centre ${centre.name}`}>
      <div className="card-head">
        <div>
          <span className="eyebrow">Polling centre · {centre.code}</span>
          <h2>{centre.name}</h2>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="meta">
        {wardName ? `${wardName} ward · ` : ""}
        {nf.format(centre.streams)} {centre.streams === 1 ? "stream" : "streams"} ·{" "}
        {nf.format(centre.voters)} registered {centre.voters === 1 ? "voter" : "voters"}
      </p>
    </section>
  );
}
