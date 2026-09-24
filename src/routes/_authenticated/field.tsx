import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FieldApp } from "@/components/gw/FieldApp";
import { getVoters } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/field")({
  component: Field,
  head: () => ({
    meta: [
      { title: "Field app · Groundwork" },
      {
        name: "description",
        content:
          "The canvasser's phone view: walk lists, door visits and sign-ups that keep working offline.",
      },
      { property: "og:title", content: "Field app · Groundwork" },
      {
        property: "og:description",
        content:
          "The canvasser's phone view: walk lists, door visits and sign-ups that keep working offline.",
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

  const allWards = (data?.wards ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const busiest = (data?.wards ?? [])
    .slice()
    .sort((a, b) => b.people - a.people)
    .slice(0, 6);

  return (
    <section className="view active" aria-label="Field app">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Field · the app in a pocket</span>
          <h1>
            Built for the door, <span className="serif">not the desk.</span>
          </h1>
          <p className="meta">
            Pick a ward, knock, tap what happened. Visits save on the phone when there is no signal
            and sync when it comes back.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" />{" "}
            {nf.format(data?.totals.contactedWeek ?? 0)} doors logged this week
          </span>
        </div>
      </div>

      <div className="pgrid fx2">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>At the door</h2>
            <span className="mono">works without signal</span>
          </div>
          {data ? <FieldApp wards={allWards} /> : <p className="f-note">Loading wards…</p>}
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>Where the doors are</h2>
            <span className="mono">busiest wards</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>People</th>
                  <th style={{ textAlign: "right" }}>Done 7d</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {busiest.map((w) => (
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
                {busiest.length === 0 && (
                  <tr>
                    <td colSpan={5} className="meta">
                      Loading wards…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
