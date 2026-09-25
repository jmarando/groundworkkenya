import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getBriefing } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";

const nf = new Intl.NumberFormat("en-KE");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");

const TABS = [
  { key: "constituencies", label: "Constituencies" },
  { key: "wards", label: "Wards" },
  { key: "issues", label: "Issues" },
  { key: "people", label: "People" },
] as const;

/** Today's tables from the live database: constituencies, wards, issues, people. */
export function LiveBriefing() {
  const fetchBriefing = useServerFn(getBriefing);
  const { data } = useQuery({ queryKey: ["briefing"], queryFn: () => fetchBriefing() });
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("constituencies");
  const [q, setQ] = useState("");

  const t = data?.totals;
  const wards = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.wards ?? []).filter(
      (w) =>
        !needle ||
        w.name.toLowerCase().includes(needle) ||
        w.constituency.toLowerCase().includes(needle),
    );
  }, [data, q]);

  function exportWards() {
    downloadCSV(
      stampName("groundwork-ward-briefing"),
      [
        "Ward",
        "Constituency",
        "Registered",
        "Win number",
        "Supporters",
        "Gap",
        "People on file",
        "Contacted this week",
        "Strong",
        "Persuadable",
        "Stations",
        "Staffed",
        "Top issue",
      ],
      wards.map((w) => [
        w.name,
        w.constituency,
        w.registered,
        w.target,
        w.supporters,
        w.gap,
        w.people,
        w.contacted,
        w.strong,
        w.persuadable,
        w.stations,
        w.staffed,
        w.topIssue ?? "",
      ]),
    );
  }

  return (
    <section className="view active" aria-label="Campaign briefing">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Understand · briefing</span>
          <h1>
            The whole race, <span className="serif">in one read.</span>
          </h1>
          <p className="meta">
            Constituency by constituency, ward by ward: where the votes are, who is on the list,
            what people are angry about and what is still unbuilt.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(t?.wards ?? 0)} wards ·{" "}
            {nf.format(t?.constituencies ?? 0)} constituencies
          </span>
        </div>
      </div>

      <div className="g5 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">Registered voters</span>
          <span className="kpi-val stat">{nf.format(t?.registered ?? 0)}</span>
          <span className="kpi-sub">across {nf.format(t?.wards ?? 0)} wards</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Win number</span>
          <span className="kpi-val stat">{nf.format(t?.target ?? 0)}</span>
          <span className="kpi-sub">{pct(t?.supporters ?? 0, t?.target ?? 0)} of it confirmed</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Supporters confirmed</span>
          <span className="kpi-val stat">{nf.format(t?.supporters ?? 0)}</span>
          <span className="kpi-sub">
            {nf.format(Math.max(0, (t?.target ?? 0) - (t?.supporters ?? 0)))} still to find
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">People on file</span>
          <span className="kpi-val stat">{nf.format(t?.people ?? 0)}</span>
          <span className="kpi-sub">{nf.format(t?.contactedWeek ?? 0)} contacted this week</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Stations staffed</span>
          <span className="kpi-val stat">
            {nf.format(t?.staffed ?? 0)}/{nf.format(t?.stations ?? 0)}
          </span>
          <span className="kpi-sub">{nf.format(t?.openIncidents ?? 0)} incidents open</span>
        </div>
      </div>

      <div className="card fx2">
        <div className="card-head">
          <h2>What the numbers say today</h2>
          <span className="mono">auto-written from live data</span>
        </div>
        <div className="f-rows">
          {(data?.headlines ?? []).map((h, i) => (
            <div className="f-row" key={i} style={{ justifyContent: "flex-start" }}>
              <span className="mono" style={{ opacity: 0.55 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{h}</span>
            </div>
          ))}
          {!data && <p className="meta">Reading the campaign…</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Deep dive</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map((x) => (
              <button
                key={x.key}
                type="button"
                className="fchip"
                aria-pressed={tab === x.key}
                onClick={() => setTab(x.key)}
              >
                {x.label}
              </button>
            ))}
            {tab === "wards" && (
              <>
                <span className="pbar">
                  <label className="sr" htmlFor="briefQ">
                    Search wards
                  </label>
                  <input
                    id="briefQ"
                    type="search"
                    placeholder="Search ward or constituency"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={exportWards}>
                  Download {nf.format(wards.length)} wards · CSV
                </button>
              </>
            )}
          </div>
        </div>

        {tab === "constituencies" && (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>Wards</th>
                  <th style={{ textAlign: "right" }}>Registered</th>
                  <th style={{ textAlign: "right" }}>Win number</th>
                  <th style={{ textAlign: "right" }}>Supporters</th>
                  <th style={{ textAlign: "right" }}>On file</th>
                  <th style={{ textAlign: "right" }}>Strong</th>
                  <th style={{ textAlign: "right" }}>Persuadable</th>
                  <th style={{ textAlign: "right" }}>Stations</th>
                  <th style={{ textAlign: "right" }}>Open issues</th>
                </tr>
              </thead>
              <tbody>
                {(data?.constituencies ?? []).map((c) => (
                  <tr key={c.name}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td className="num">{nf.format(c.wards)}</td>
                    <td className="num">{nf.format(c.registered)}</td>
                    <td className="num">{nf.format(c.target)}</td>
                    <td className="num">
                      {nf.format(c.supporters)} · {pct(c.supporters, c.target)}
                    </td>
                    <td className="num">{nf.format(c.people)}</td>
                    <td className="num">{nf.format(c.strong)}</td>
                    <td className="num">{nf.format(c.persuadable)}</td>
                    <td className="num">
                      {nf.format(c.staffed)}/{nf.format(c.stations)}
                    </td>
                    <td className="num">{nf.format(c.incidents)}</td>
                  </tr>
                ))}
                {!data && (
                  <tr>
                    <td colSpan={10} className="meta">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "wards" && (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>Registered</th>
                  <th style={{ textAlign: "right" }}>Win number</th>
                  <th style={{ textAlign: "right" }}>Gap</th>
                  <th style={{ textAlign: "right" }}>On file</th>
                  <th style={{ textAlign: "right" }}>Strong</th>
                  <th style={{ textAlign: "right" }}>Persuadable</th>
                  <th style={{ textAlign: "right" }}>Stations</th>
                  <th>Loudest issue</th>
                </tr>
              </thead>
              <tbody>
                {wards.slice(0, 80).map((w) => (
                  <tr key={w.id}>
                    <td>
                      <b>{w.name}</b>
                    </td>
                    <td className="meta">{w.constituency}</td>
                    <td className="num">{nf.format(w.registered)}</td>
                    <td className="num">{nf.format(w.target)}</td>
                    <td className="num">{nf.format(w.gap)}</td>
                    <td className="num">{nf.format(w.people)}</td>
                    <td className="num">{nf.format(w.strong)}</td>
                    <td className="num">{nf.format(w.persuadable)}</td>
                    <td className="num">
                      {nf.format(w.staffed)}/{nf.format(w.stations)}
                    </td>
                    <td className="meta">{w.topIssue ?? "—"}</td>
                  </tr>
                ))}
                {wards.length === 0 && (
                  <tr>
                    <td colSpan={10} className="meta">
                      Nothing matches that search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "issues" && (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "right" }}>From the inbox</th>
                  <th style={{ textAlign: "right" }}>From the web</th>
                  <th style={{ textAlign: "right" }}>Angry</th>
                  <th>Loudest ward</th>
                </tr>
              </thead>
              <tbody>
                {(data?.issues ?? []).map((i) => (
                  <tr key={i.label}>
                    <td>
                      <b>{i.label}</b>
                    </td>
                    <td className="num">{nf.format(i.total)}</td>
                    <td className="num">{nf.format(i.inbox)}</td>
                    <td className="num">{nf.format(i.web)}</td>
                    <td className="num">{nf.format(i.angry)}</td>
                    <td className="meta">{i.topWard ?? "—"}</td>
                  </tr>
                ))}
                {(data?.issues ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="meta">
                      No issues tagged yet — run a listening sweep or classify the inbox.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "people" && (
          <div className="pgrid" style={{ marginTop: 4 }}>
            <div className="card" style={{ minWidth: 0 }}>
              <div className="card-head">
                <h2>Segments</h2>
                <span className="mono">people · strong · reachable</span>
              </div>
              <div className="f-rows">
                {(data?.segments ?? []).map((s) => (
                  <div className="f-row" key={s.label}>
                    <span>{s.label}</span>
                    <b>
                      {nf.format(s.people)} · {nf.format(s.strong)} strong ·{" "}
                      {nf.format(s.reachable)} reachable
                    </b>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Support &amp; reach</h2>
                <span className="mono">whole list</span>
              </div>
              <div className="f-rows">
                {(data?.support ?? []).map((s) => (
                  <div className="f-row" key={s.label}>
                    <span>{s.label}</span>
                    <b>{nf.format(s.people)}</b>
                  </div>
                ))}
                {(data?.languages ?? []).map((l) => (
                  <div className="f-row" key={l.label}>
                    <span>Language · {l.label}</span>
                    <b>{nf.format(l.people)}</b>
                  </div>
                ))}
                <div className="f-row">
                  <span>Consented · SMS</span>
                  <b>{nf.format(data?.consent.sms ?? 0)}</b>
                </div>
                <div className="f-row">
                  <span>Consented · WhatsApp</span>
                  <b>{nf.format(data?.consent.whatsapp ?? 0)}</b>
                </div>
                <div className="f-row">
                  <span>Consented · calls</span>
                  <b>{nf.format(data?.consent.call ?? 0)}</b>
                </div>
                <div className="f-row">
                  <span>Opted out</span>
                  <b>{nf.format(data?.consent.optedOut ?? 0)}</b>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
