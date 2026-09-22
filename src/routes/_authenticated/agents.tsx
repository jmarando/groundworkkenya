import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getAgents } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/agents")({
  component: Agents,
  head: () => ({
    meta: [
      { title: "Agents & stipends · Groundwork" },
      {
        name: "description",
        content:
          "Polling agent cover by ward and the stipend run: who is owed, who is approved, who has been paid.",
      },
      { property: "og:title", content: "Agents & stipends · Groundwork" },
      {
        property: "og:description",
        content:
          "Polling agent cover by ward and the stipend run: who is owed, who is approved, who has been paid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const money = (n: number) => `KES ${nf.format(Math.round(n))}`;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";

const STATUS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

const STATION_VIEWS: { key: string; label: string }[] = [
  { key: "", label: "All stations" },
  { key: "confirmed", label: "Staffed" },
  { key: "open", label: "No agent" },
  { key: "reported", label: "Reported" },
];

function Agents() {
  const fetchAgents = useServerFn(getAgents);
  const { data } = useQuery({ queryKey: ["agents"], queryFn: () => fetchAgents() });
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [stationView, setStationView] = useState("");
  const [sq, setSq] = useState("");

  const stations = useMemo(() => {
    const list = data?.board ?? [];
    const needle = sq.trim().toLowerCase();
    return list.filter((b) => {
      const viewOk =
        stationView === ""
          ? true
          : stationView === "confirmed"
            ? b.status === "confirmed"
            : stationView === "open"
              ? b.status !== "confirmed"
              : b.turnout != null || b.reportedAt != null;
      return (
        viewOk &&
        (!needle ||
          b.name.toLowerCase().includes(needle) ||
          b.code.toLowerCase().includes(needle) ||
          (b.ward ?? "").toLowerCase().includes(needle) ||
          (b.agent ?? "").toLowerCase().includes(needle))
      );
    });
  }, [data, stationView, sq]);

  function exportBoard() {
    downloadCSV(
      stampName("groundwork-polling-stations"),
      [
        "Code",
        "Station",
        "Ward",
        "Constituency",
        "Registered voters",
        "Streams",
        "Agent",
        "Phone",
        "Status",
        "Turnout reported",
        "Reported at",
        "Owed KES",
      ],
      stations.map((b) => [
        b.code,
        b.name,
        b.ward ?? "",
        b.constituency ?? "",
        b.registered,
        b.streams,
        b.agent ?? "",
        b.phone ?? "",
        b.status,
        b.turnout ?? "",
        b.reportedAt ? b.reportedAt.slice(0, 16).replace("T", " ") : "",
        b.owed,
      ]),
    );
  }

  const rows = useMemo(() => {
    const list = data?.roster ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter(
      (r) =>
        (!status || r.status === status) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          (r.ward ?? "").toLowerCase().includes(needle) ||
          (r.station ?? "").toLowerCase().includes(needle) ||
          (r.phone ?? "").includes(needle)),
    );
  }, [data, status, q]);

  const s = data?.stations;
  const m = data?.money;
  const owed = (m?.pending ?? 0) + (m?.approved ?? 0);
  const cover = s?.total ? (s.confirmed / s.total) * 100 : 0;
  const filteredTotal = rows.reduce((a, r) => a + r.amount, 0);

  function exportRun() {
    downloadCSV(
      stampName("groundwork-stipend-run"),
      [
        "Name",
        "Phone",
        "Role",
        "Ward",
        "Station",
        "Rate KES",
        "Days",
        "Amount KES",
        "Status",
        "M-Pesa reference",
        "Paid on",
      ],
      rows.map((r) => [
        r.name,
        r.phone ?? "",
        r.role,
        r.ward ?? "",
        r.station ?? "",
        r.rate,
        r.days,
        r.amount,
        r.status,
        r.reference ?? "",
        r.paidAt ? r.paidAt.slice(0, 10) : "",
      ]),
    );
  }

  return (
    <section className="view active" aria-label="Agents and stipends">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Operate · agents &amp; stipends</span>
          <h1>
            Every station staffed, <span className="serif">every shilling accounted.</span>
          </h1>
          <p className="meta">
            Who is standing in which station, what they are owed, and the receipt when they are paid.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {money(owed)} still to pay out
          </span>
        </div>
      </div>

      <div className="g5 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">Stations staffed</span>
          <span className="kpi-val stat">
            {nf.format(s?.confirmed ?? 0)}/{nf.format(s?.total ?? 0)}
          </span>
          <div className="minibar">
            <i style={{ width: `${cover}%` }} />
          </div>
          <span className="kpi-sub">{cover.toFixed(0)}% cover confirmed</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Stations with nobody</span>
          <span className="kpi-val stat">{nf.format(s?.unstaffed ?? 0)}</span>
          <span className="kpi-sub">
            {nf.format((data?.gaps ?? []).reduce((a, g) => a + g.registered, 0))} registered voters
            unwatched
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Owed · pending and approved</span>
          <span className="kpi-val stat">{money(owed)}</span>
          <span className="kpi-sub">
            {money(m?.pending ?? 0)} pending · {money(m?.approved ?? 0)} approved
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Paid to date</span>
          <span className="kpi-val stat">{money(m?.paid ?? 0)}</span>
          <span className="kpi-sub">{nf.format(data?.counts.lines ?? 0)} stipend lines raised</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">On the payroll</span>
          <span className="kpi-val stat">{nf.format(data?.counts.agents ?? 0)}</span>
          <span className="kpi-sub">
            plus {nf.format(data?.counts.coordinators ?? 0)} ward coordinators
          </span>
        </div>
      </div>

      <div className="pgrid fx2">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>Cover by ward</h2>
            <span className="mono">stations staffed · money owed</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th style={{ textAlign: "right" }}>Stations</th>
                  <th style={{ textAlign: "right" }}>Staffed</th>
                  <th style={{ textAlign: "right" }}>Owed</th>
                </tr>
              </thead>
              <tbody>
                {(data?.wards ?? []).slice(0, 14).map((w) => (
                  <tr key={w.id}>
                    <td>
                      <b>{w.name}</b>
                    </td>
                    <td className="num">{nf.format(w.stations)}</td>
                    <td className="num">{nf.format(w.staffed)}</td>
                    <td className="num">{w.owed ? money(w.owed) : "—"}</td>
                  </tr>
                ))}
                {(data?.wards ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="meta">
                      Loading cover…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Recruit here first</h2>
            <span className="mono">no agent yet</span>
          </div>
          <div className="f-rows">
            {(data?.gaps ?? []).slice(0, 10).map((g) => (
              <div className="f-row" key={g.code}>
                <span>
                  {g.name} · <span className="mono">{g.code}</span>
                </span>
                <b>
                  {g.ward ?? "—"} · {nf.format(g.registered)} voters
                </b>
              </div>
            ))}
            {(data?.gaps ?? []).length === 0 && (
              <p className="meta">Every station has an agent. Good.</p>
            )}
          </div>
          <p className="f-note" style={{ marginTop: 12 }}>
            Stipends are paid by M-Pesa against the station record, and each payment posts to Finance
            as a field expense with its receipt.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Stipend run</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {STATUS.map((x) => (
              <button
                key={x.key || "all"}
                type="button"
                className="fchip"
                aria-pressed={status === x.key}
                onClick={() => setStatus(x.key)}
              >
                {x.label}
              </button>
            ))}
            <span className="pbar">
              <label className="sr" htmlFor="agentQ">
                Search agents
              </label>
              <input
                id="agentQ"
                type="search"
                placeholder="Search name, ward or station"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportRun}>
              Download {nf.format(rows.length)} lines · CSV
            </button>
          </div>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Ward</th>
                <th>Station</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Days</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td className="mono">{r.phone ?? "—"}</td>
                  <td className="meta">{r.role}</td>
                  <td className="meta">{r.ward ?? "—"}</td>
                  <td className="meta">{r.station ?? "—"}</td>
                  <td className="num">{nf.format(r.rate)}</td>
                  <td className="num">{r.days}</td>
                  <td className="num">{nf.format(r.amount)}</td>
                  <td className="meta">{r.status}</td>
                  <td className="mono">
                    {r.reference ? `${r.reference} · ${day(r.paidAt)}` : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="meta">
                    Nothing matches that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="f-note" style={{ marginTop: 10 }}>
          Showing the first 60 of {nf.format(rows.length)} lines · {money(filteredTotal)} in view.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Station board</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {STATION_VIEWS.map((x) => (
              <button
                key={x.key || "all"}
                type="button"
                className="fchip"
                aria-pressed={stationView === x.key}
                onClick={() => setStationView(x.key)}
              >
                {x.label}
              </button>
            ))}
            <span className="pbar">
              <label className="sr" htmlFor="stationQ">
                Search stations
              </label>
              <input
                id="stationQ"
                type="search"
                placeholder="Search station, code or ward"
                value={sq}
                onChange={(e) => setSq(e.target.value)}
              />
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportBoard}>
              Download {nf.format(stations.length)} stations · CSV
            </button>
          </div>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Station</th>
                <th>Ward</th>
                <th style={{ textAlign: "right" }}>Voters</th>
                <th style={{ textAlign: "right" }}>Streams</th>
                <th>Agent</th>
                <th>Phone</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Turnout</th>
                <th style={{ textAlign: "right" }}>Owed</th>
              </tr>
            </thead>
            <tbody>
              {stations.slice(0, 100).map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.code}</td>
                  <td>
                    <b>{b.name}</b>
                  </td>
                  <td className="meta">{b.ward ?? "—"}</td>
                  <td className="num">{nf.format(b.registered)}</td>
                  <td className="num">{b.streams}</td>
                  <td>{b.agent ?? <span className="meta">nobody yet</span>}</td>
                  <td className="mono">{b.phone ?? "—"}</td>
                  <td className="meta">{b.status}</td>
                  <td className="num">{b.turnout != null ? nf.format(b.turnout) : "—"}</td>
                  <td className="num">{b.owed ? nf.format(b.owed) : "—"}</td>
                </tr>
              ))}
              {stations.length === 0 && (
                <tr>
                  <td colSpan={10} className="meta">
                    No stations match that view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="f-note" style={{ marginTop: 10 }}>
          {nf.format(stations.length)} stations in view ·{" "}
          {nf.format(stations.reduce((a, b) => a + b.registered, 0))} registered voters behind them.
        </p>
      </div>
    </section>
  );
}
