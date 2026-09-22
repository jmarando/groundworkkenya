import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getWarRoom } from "@/lib/console.functions";

export const Route = createFileRoute("/_authenticated/warroom")({
  component: WarRoom,
  head: () => ({
    meta: [
      { title: "War room · Groundwork" },
      {
        name: "description",
        content: "Polling station coverage, agent staffing and incidents as election day runs.",
      },
      { property: "og:title", content: "War room · Groundwork" },
      {
        property: "og:description",
        content: "Polling station coverage, agent staffing and incidents as election day runs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function WarRoom() {
  const fetchWarRoom = useServerFn(getWarRoom);
  const { data } = useQuery({ queryKey: ["warroom"], queryFn: () => fetchWarRoom() });

  if (!data) {
    return (
      <section className="view active" aria-label="War room">
        <div className="vh">
          <div>
            <span className="eyebrow">Election day · war room</span>
            <h1>
              Every station, <span className="serif">covered.</span>
            </h1>
            <p className="meta">Loading station coverage…</p>
          </div>
        </div>
      </section>
    );
  }

  const s = data.stations;
  const coverage = s.total ? (s.confirmed / s.total) * 100 : 0;
  const maxReg = Math.max(...data.constituencies.map((c) => c.registered), 1);

  return (
    <section className="view active" aria-label="War room">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Election day · war room</span>
          <h1>
            Every station, <span className="serif">covered.</span>
          </h1>
          <p className="meta">
            Agent staffing, stream counts and incidents in one place, so nothing goes unwatched.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(s.total)} stations tracked
          </span>
        </div>
      </div>

      <div className="g4 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">Agent coverage</span>
          <span className="kpi-val stat">{coverage.toFixed(0)}%</span>
          <div className="minibar">
            <i style={{ width: `${coverage}%` }} />
          </div>
          <span className="kpi-sub">
            {nf.format(s.confirmed)} confirmed of {nf.format(s.total)}
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Unstaffed</span>
          <span className="kpi-val stat">{nf.format(s.unstaffed)}</span>
          <span className="kpi-sub">stations still needing an agent</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Streams</span>
          <span className="kpi-val stat">{nf.format(data.streams)}</span>
          <span className="kpi-sub">one tally form per stream</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Registered at these stations</span>
          <span className="kpi-val stat">{nf.format(s.registered)}</span>
          <span className="kpi-sub">voters in the catchment</span>
        </div>
      </div>

      <div className="g2 fx3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <h2>Coverage by constituency</h2>
            <span className="mono">confirmed / stations</span>
          </div>
          <div className="barlist">
            {data.constituencies.map((c) => (
              <div className="barlist-row" key={c.name}>
                <span className="lbl">{c.name}</span>
                <span className="barlist-track">
                  <i style={{ width: `${(c.registered / maxReg) * 100}%` }} />
                </span>
                <span className="val">
                  {c.confirmed}/{c.stations}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Incidents</h2>
            <span className="mono">{data.incidents.length} logged</span>
          </div>
          <div className="t-list">
            {data.incidents.map((i) => (
              <div className="inc-row" key={i.id}>
                <span
                  className={`pill ${
                    i.severity === "critical" || i.severity === "high"
                      ? "pill--outline-red"
                      : i.severity === "warn"
                        ? "pill--amber"
                        : "pill--ok"
                  }`}
                >
                  <span className="g" aria-hidden="true">
                    ●
                  </span>{" "}
                  {i.severity}
                </span>
                <div>
                  <b>{i.title}</b>
                  <div className="meta">
                    {i.ward ?? "ward unknown"} · {stamp(i.occurredAt)} ·{" "}
                    {i.reportedBy ?? "unattributed"}
                  </div>
                  {i.detail && <p className="meta">{i.detail}</p>}
                </div>
                <span className="mono dim">{i.status}</span>
              </div>
            ))}
            {data.incidents.length === 0 && <p className="f-note">No incidents logged.</p>}
          </div>
        </div>
      </div>

      <div className="card fx4" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Stations still needing an agent</h2>
            <p className="meta">Fill these first — biggest register at the top of the list.</p>
          </div>
          <span className="mono">{nf.format(s.unstaffed)} open</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Station</th>
                <th>Ward</th>
                <th style={{ textAlign: "right" }}>Registered</th>
              </tr>
            </thead>
            <tbody>
              {data.unstaffedList.map((u) => (
                <tr key={u.code}>
                  <td className="mono">{u.code}</td>
                  <td>
                    <b>{u.name}</b>
                  </td>
                  <td className="meta">{u.ward ?? "—"}</td>
                  <td className="num">{nf.format(u.registered)}</td>
                </tr>
              ))}
              {data.unstaffedList.length === 0 && (
                <tr>
                  <td colSpan={4} className="meta">
                    Every station has a confirmed agent.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
