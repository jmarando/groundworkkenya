import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getVoters } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/field")({
  component: Field,
  head: () => ({
    meta: [
      { title: "Field app · Groundwork" },
      {
        name: "description",
        content: "The canvasser's phone view: walk lists, quick scripts and offline door logging.",
      },
      { property: "og:title", content: "Field app · Groundwork" },
      {
        property: "og:description",
        content: "The canvasser's phone view: walk lists, quick scripts and offline door logging.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");

function Field() {
  const fetchVoters = useServerFn(getVoters);
  const { data } = useQuery({ queryKey: ["voters"], queryFn: () => fetchVoters() });

  const wards = (data?.wards ?? []).slice().sort((a, b) => b.people - a.people).slice(0, 6);
  const top = wards[0];

  return (
    <section className="view active" aria-label="Field app">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Field · the app in a pocket</span>
          <h1>
            Built for the door, <span className="serif">not the desk.</span>
          </h1>
          <p className="meta">
            A walk list, three taps per door, and it keeps working when the network does not.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(data?.totals.contactedWeek ?? 0)}{" "}
            doors logged this week
          </span>
        </div>
      </div>

      <div className="pgrid fx2">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>Today&apos;s walk lists</h2>
            <span className="mono">assigned by ward</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>On the list</th>
                  <th style={{ textAlign: "right" }}>Done 7d</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {wards.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <b>{w.name}</b>
                    </td>
                    <td className="meta">{w.constituency}</td>
                    <td className="num">{nf.format(w.people)}</td>
                    <td className="num">{nf.format(w.contacted)}</td>
                    <td style={{ minWidth: 120 }}>
                      <span className="cov-bar">
                        <i
                          style={{
                            width: `${w.people ? Math.min((w.contacted / w.people) * 100, 100) : 0}%`,
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
                {wards.length === 0 && (
                  <tr>
                    <td colSpan={5} className="meta">
                      Loading walk lists…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="f-rows" style={{ marginTop: 14 }}>
            <div className="f-row">
              <span>Works offline</span>
              <b>Doors queue on the handset and sync when signal returns</b>
            </div>
            <div className="f-row">
              <span>Three taps per door</span>
              <b>Who answered · support 1–5 · the issue they raised</b>
            </div>
            <div className="f-row">
              <span>Consent captured at the door</span>
              <b>Per channel, with the time and the canvasser on the record</b>
            </div>
            <div className="f-row">
              <span>Data cost</span>
              <b>Under 1 MB for a full day of canvassing</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>On the handset</h2>
            <span className="mono">preview</span>
          </div>
          <div className="phone">
            <div className="phone-screen">
              <div className="ph-top">
                <b>{top?.name ?? "Your ward"}</b>
                <span className="mono">{nf.format(top?.people ?? 0)} doors</span>
              </div>
              <div className="ph-card">
                <b>House 214, Block C</b>
                <span className="meta">Last spoken to: never</span>
              </div>
              <div className="ph-actions">
                <button type="button" className="btn btn--primary btn--sm">
                  Spoke to them
                </button>
                <button type="button" className="btn btn--ghost btn--sm">
                  Not home
                </button>
                <button type="button" className="btn btn--ghost btn--sm">
                  Refused
                </button>
              </div>
              <div className="ph-scale" role="group" aria-label="Support score">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="fchip">
                    {n}
                  </button>
                ))}
              </div>
              <div className="ph-issues">
                {["Water", "Rubbish", "Lighting", "Bursaries", "Jobs"].map((i) => (
                  <span className="tag" key={i}>
                    {i}
                  </span>
                ))}
              </div>
              <p className="f-note">Saved locally · syncs when you are back on signal.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
