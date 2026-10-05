import { useState } from "react";

import { ImportPeople } from "@/components/gw/ImportPeople";
import type { PeopleData } from "@/lib/console.functions";

const nf = new Intl.NumberFormat("en-KE");

/** Importing, where records come in, possible duplicates and consent, in one place. */
export function ManageRecords({
  data,
  canImport,
  onClose,
}: {
  data: PeopleData;
  canImport: boolean;
  onClose: () => void;
}) {
  const [importing, setImporting] = useState(false);
  if (importing)
    return (
      <ImportPeople
        wards={data.wards}
        segments={data.segments}
        onClose={() => setImporting(false)}
      />
    );
  const maxSource = Math.max(...data.bySource.map((s) => s.count), 1);
  const consented = (ch: string) =>
    data.rows.filter((r) => r.channels.includes(ch) && !r.optedOut).length;
  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="mr-title">
      <div className="pb re-panel">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Voters · records</span>
            <h2 id="mr-title">Manage records</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <section className="card">
            <div className="card-head">
              <h2>Bring records in</h2>
            </div>
            <p className="meta">
              {nf.format(data.total)} records on file · {nf.format(data.addedToday)} added today.
            </p>
            {canImport ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => setImporting(true)}
              >
                Import a CSV
              </button>
            ) : (
              <p className="meta">The candidate or campaign manager imports records.</p>
            )}
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Where records come in</h2>
            </div>
            <div className="barlist">
              {data.bySource.map((s) => (
                <div className="barlist-row" key={s.name}>
                  <span className="lbl">{s.name}</span>
                  <span className="barlist-track">
                    <i style={{ width: `${(s.count / maxSource) * 100}%` }} />
                  </span>
                  <span className="val">{nf.format(s.count)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Possible duplicates</h2>
              <span className="mono">{data.duplicates.length} to review</span>
            </div>
            {data.duplicates.length === 0 ? (
              <p className="f-note">No duplicate phone numbers in the loaded records.</p>
            ) : null}
            {data.duplicates.map((d) => (
              <div className="dup" key={d.phone}>
                <b className="mono">{d.phone}</b>
                <span className="meta"> · {d.names.join(" / ")}</span>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Consent, in the open</h2>
            </div>
            <div className="f-rows">
              {[
                ["SMS consented", consented("SMS")],
                ["WhatsApp consented", consented("WA")],
                ["Calls consented", consented("Call")],
                ["Opted out", data.rows.filter((r) => r.optedOut).length],
              ].map(([k, v]) => (
                <div className="f-row" key={String(k)}>
                  <span>{k}</span>
                  <b className="stat">{nf.format(Number(v))}</b>
                </div>
              ))}
            </div>
            <p className="f-note">
              Anyone outside the consent scope drops out of every send, automatically.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
