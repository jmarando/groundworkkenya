import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { getCanvassing } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/canvassing")({
  component: Canvassing,
  head: () => ({
    meta: [
      { title: "Canvassing · Groundwork" },
      {
        name: "description",
        content:
          "Turf coverage by ward, the next walk list, door outcomes and the issues raised at the door.",
      },
      { property: "og:title", content: "Canvassing · Groundwork" },
      {
        property: "og:description",
        content:
          "Turf coverage by ward, the next walk list, door outcomes and the issues raised at the door.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    : "never";
const stampAt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Canvassing() {
  const fetchCanvassing = useServerFn(getCanvassing);
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["canvassing"], queryFn: () => fetchCanvassing() });
  const [ward, setWard] = useState("");

  const wards = data?.wards ?? [];
  const t = data?.totals;

  const walk = useMemo(() => {
    const list = data?.walkList ?? [];
    const wardName = wards.find((w) => w.id === ward)?.name;
    return wardName ? list.filter((p) => p.ward === wardName) : list;
  }, [data, ward, wards]);

  const doors = (t?.spoke ?? 0) + (t?.notHome ?? 0) + (t?.refused ?? 0);
  const contactRate = doors ? ((t?.spoke ?? 0) / doors) * 100 : 0;
  const maxIssue = Math.max(...(data?.issues ?? [{ count: 1 }]).map((i) => i.count), 1);

  function exportWalk() {
    downloadCSV(
      stampName(`groundwork-walk-list${ward ? "-" + (wards.find((w) => w.id === ward)?.name ?? "") : ""}`),
      ["Name", "Phone", "Ward", "Group", "Support score", "Last contacted", "Why they are on the list"],
      walk.map((p) => [
        p.name,
        p.phone,
        p.ward ?? "",
        p.segment ?? "",
        p.support,
        p.lastTouch ? p.lastTouch.slice(0, 10) : "never",
        p.reason,
      ]),
    );
  }

  return (
    <section className="view active" aria-label="Canvassing">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Operate · canvassing</span>
          <h1>
            Cover the ground, <span className="serif">door by door.</span>
          </h1>
          <p className="meta">
            Who has been knocked, who is overdue, and what people said when the door opened.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(t?.doors7 ?? 0)} doors in the
            last 7 days
          </span>
        </div>
      </div>

      <div className="g5 fx2">
        <div className="card kpi">
          <span className="kpi-lbl">Doors logged · 30 days</span>
          <span className="kpi-val stat">{nf.format(t?.doors30 ?? 0)}</span>
          <span className="kpi-sub">{nf.format(doors)} on record in total</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Spoke to someone</span>
          <span className="kpi-val stat">{nf.format(t?.spoke ?? 0)}</span>
          <div className="minibar">
            <i style={{ width: `${contactRate}%` }} />
          </div>
          <span className="kpi-sub">{contactRate.toFixed(0)}% of doors knocked</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Not home</span>
          <span className="kpi-val stat">{nf.format(t?.notHome ?? 0)}</span>
          <span className="kpi-sub">go back at a different hour</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Refused</span>
          <span className="kpi-val stat">{nf.format(t?.refused ?? 0)}</span>
          <span className="kpi-sub">kept off the walk list</span>
        </div>
        <div className="card kpi">
          <span className="kpi-lbl">Still to knock</span>
          <span className="kpi-val stat">{nf.format(walk.length)}</span>
          <span className="kpi-sub">
            {nf.format(t?.neverKnocked ?? 0)} never visited, the rest overdue
          </span>
        </div>
      </div>

      <div className="pgrid fx2">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <h2>Turf coverage</h2>
            <span className="mono">click a ward to filter the walk list</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>On file</th>
                  <th style={{ textAlign: "right" }}>Seen 30d</th>
                  <th style={{ textAlign: "right" }}>Never</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {wards.slice(0, 14).map((w) => (
                  <tr
                    key={w.id}
                    className="t-row--link"
                    aria-selected={ward === w.id}
                    onClick={() => setWard(ward === w.id ? "" : w.id)}
                  >
                    <td>
                      <b>{w.name}</b>
                    </td>
                    <td className="meta">{w.constituency}</td>
                    <td className="num">{nf.format(w.people)}</td>
                    <td className="num">{nf.format(w.knocked)}</td>
                    <td className="num">{nf.format(w.never)}</td>
                    <td style={{ minWidth: 120 }}>
                      <span className="cov-bar">
                        <i
                          style={{
                            width: `${w.people ? Math.min((w.knocked / w.people) * 100, 100) : 0}%`,
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
                {wards.length === 0 && (
                  <tr>
                    <td colSpan={6} className="meta">
                      Loading turf…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Raised at the door</h2>
            <span className="mono">from logged conversations</span>
          </div>
          <div className="f-rows">
            {(data?.issues ?? []).map((i) => (
              <div className="f-row" key={i.name}>
                <span>{i.name}</span>
                <b>
                  <span className="cov-bar" style={{ width: 90, display: "inline-block" }}>
                    <i style={{ width: `${(i.count / maxIssue) * 100}%` }} />
                  </span>{" "}
                  {nf.format(i.count)}
                </b>
              </div>
            ))}
            {(data?.issues ?? []).length === 0 && <p className="meta">No issues logged yet.</p>}
          </div>

          <div className="card-head" style={{ marginTop: 18 }}>
            <h2>Latest doors</h2>
            <span className="mono">live</span>
          </div>
          <div className="f-rows">
            {(data?.recent ?? []).slice(0, 8).map((r) => (
              <div className="f-row" key={r.id}>
                <span>
                  {r.person} · {r.ward ?? "—"}
                </span>
                <b>
                  {r.outcome}
                  {r.issue ? ` · ${r.issue}` : ""} <span className="mono">{stampAt(r.at)}</span>
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            Next walk list{ward ? ` · ${wards.find((w) => w.id === ward)?.name}` : ""}
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {ward && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWard("")}>
                All wards
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportWalk}>
              Download {nf.format(walk.length)} doors · CSV
            </button>
          </div>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Ward</th>
                <th>Group</th>
                <th style={{ textAlign: "right" }}>Support</th>
                <th>Last seen</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {walk.slice(0, 60).map((p) => (
                <tr
                  key={p.id}
                  className="t-row--link"
                  onClick={() => navigate({ to: "/people", search: { person: p.id } })}
                >
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td className="mono">{p.phone}</td>
                  <td className="meta">{p.ward ?? "—"}</td>
                  <td className="meta">{p.segment ?? "—"}</td>
                  <td className="num">{p.support}</td>
                  <td className="meta">{day(p.lastTouch)}</td>
                  <td className="meta">{p.reason}</td>
                </tr>
              ))}
              {walk.length === 0 && (
                <tr>
                  <td colSpan={7} className="meta">
                    Nothing outstanding here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="f-note" style={{ marginTop: 10 }}>
          Showing the first 60 of {nf.format(walk.length)}. Download the CSV to hand a full turf to a
          canvasser, or open a row to see the whole record in People.
        </p>
      </div>
    </section>
  );
}
