import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { VotersMap } from "@/components/gw/VotersMap";
import { getVoters } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/voters")({
  component: Voters,
  head: () => ({
    meta: [
      { title: "Know your voters · Groundwork" },
      {
        name: "description",
        content:
          "The county to the doorstep: wards, buildings and every household the canvass has reached.",
      },
      { property: "og:title", content: "Know your voters · Groundwork" },
      {
        property: "og:description",
        content:
          "The county to the doorstep: wards, buildings and every household the canvass has reached.",
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

function Voters() {
  const fetchVoters = useServerFn(getVoters);
  const { data } = useQuery({ queryKey: ["voters"], queryFn: () => fetchVoters() });
  const [constituency, setConstituency] = useState<string | null>(null);
  const [activeWard, setActiveWard] = useState<string | null>(null);
  const [tab, setTab] = useState<"ward" | "feed">("ward");
  const navigate = useNavigate();

  const consts = useMemo(
    () => [...new Set((data?.wards ?? []).map((w) => w.constituency))].sort(),
    [data],
  );
  const wards = useMemo(
    () =>
      (data?.wards ?? [])
        .filter((w) => !constituency || w.constituency === constituency)
        .sort((a, b) => b.registered - a.registered),
    [data, constituency],
  );

  if (!data) {
    return (
      <section className="view active" aria-label="Know your voters">
        <div className="vh">
          <div>
            <span className="eyebrow">Know your voters · county to doorstep</span>
            <h1>
              Every door, <span className="serif">known.</span>
            </h1>
            <p className="meta">Loading ward data…</p>
          </div>
        </div>
      </section>
    );
  }

  const selected = wards.find((w) => w.id === activeWard) ?? wards[0] ?? null;
  const maxReg = Math.max(...wards.map((w) => w.registered), 1);
  const wardPeople = selected
    ? data.people
        .filter((r) => r.wardId === selected.id)
        .sort(
          (a, b) =>
            new Date(b.lastTouch ?? 0).getTime() - new Date(a.lastTouch ?? 0).getTime() ||
            b.support - a.support,
        )
    : [];

  return (
    <section className="view active" aria-label="Know your voters">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Know your voters · county to doorstep</span>
          <h1>
            Every door, <span className="serif">known.</span>
          </h1>
          <p className="meta">
            Pan and zoom the county, drop into a ward, and see every building the canvass has
            reached: who lives there, how the door went and what they raised.
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" />{" "}
            {nf.format(data.wards.reduce((s, w) => s + w.pinned, 0))} households pinned
          </span>
        </div>
      </div>

      <VotersMap wards={data.wards} totals={data.totals} />

      <div className="card-head fx3" style={{ marginTop: 26 }}>
        <div>
          <h2>Every ward, by the numbers</h2>
          <p className="meta">
            Registered voters, the number you need, and how many you have reached.
          </p>
        </div>
      </div>

      <div className="seg fx3" style={{ marginTop: 14 }} role="group" aria-label="Constituency">
        <button type="button" aria-pressed={constituency === null} onClick={() => setConstituency(null)}>
          All constituencies
        </button>
        {consts.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={constituency === c}
            onClick={() => setConstituency(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="pgrid fx4">
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-head">
            <div>
              <h2>Ward coverage</h2>
              <p className="meta">Supporters against the number needed to win the ward.</p>
            </div>
            <span className="mono">{wards.length} wards</span>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Constituency</th>
                  <th style={{ textAlign: "right" }}>Registered</th>
                  <th style={{ textAlign: "right" }}>Target</th>
                  <th style={{ textAlign: "right" }}>Supporters</th>
                  <th>Progress</th>
                  <th style={{ textAlign: "right" }}>Contacted 7d</th>
                </tr>
              </thead>
              <tbody>
                {wards.map((w) => (
                  <tr
                    key={w.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setActiveWard(w.id);
                      setTab("ward");
                    }}
                    aria-selected={selected?.id === w.id}
                  >
                    <td>
                      <b>{w.name}</b>
                    </td>
                    <td className="meta">{w.constituency}</td>
                    <td className="num">{nf.format(w.registered)}</td>
                    <td className="num">{nf.format(w.target)}</td>
                    <td className="num">{nf.format(w.supporters)}</td>
                    <td style={{ minWidth: 120 }}>
                      <span className="cov-bar">
                        <i
                          style={{
                            width: `${w.target ? Math.min((w.supporters / w.target) * 100, 100) : 0}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td className="num">{nf.format(w.contacted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card prec">
          {selected ? (
            <>
              <div className="prec-top">
                <span className="prec-av" aria-hidden="true">
                  {selected.name.slice(0, 1)}
                </span>
                <div>
                  <b>{selected.name}</b>
                  <div className="meta">{selected.constituency}</div>
                </div>
              </div>
              <div className="f-rows">
                <div className="f-row">
                  <span>Registered</span>
                  <b className="stat">{nf.format(selected.registered)}</b>
                </div>
                <div className="f-row">
                  <span>Votes needed</span>
                  <b className="stat">{nf.format(selected.target)}</b>
                </div>
                <div className="f-row">
                  <span>Supporters identified</span>
                  <b className="stat">{nf.format(selected.supporters)}</b>
                </div>
                <div className="f-row">
                  <span>People on file here</span>
                  <b className="stat">{nf.format(selected.people)}</b>
                </div>
                <div className="f-row">
                  <span>Contacted this week</span>
                  <b className="stat">{nf.format(selected.contacted)}</b>
                </div>
                <div className="f-row">
                  <span>Gap to target</span>
                  <b className="stat">
                    {nf.format(Math.max(selected.target - selected.supporters, 0))}
                  </b>
                </div>
              </div>
              <div className="barlist" style={{ marginTop: 12 }}>
                <div className="barlist-row">
                  <span className="lbl">Share of register</span>
                  <span className="barlist-track">
                    <i style={{ width: `${(selected.registered / maxReg) * 100}%` }} />
                  </span>
                  <span className="val">{nf.format(selected.registered)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="f-note">No wards in this constituency.</p>
          )}
        </div>
      </div>

      <div className="card fx5" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>{tab === "ward" ? `People in ${selected?.name ?? "this ward"}` : "Latest contact"}</h2>
            <p className="meta">
              {tab === "ward"
                ? "Everyone on file here — open a record to see the full timeline."
                : "The most recent doorstep, call and reply, newest first."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-label="Bottom list">
              <button type="button" aria-pressed={tab === "ward"} onClick={() => setTab("ward")}>
                Ward roster
              </button>
              <button type="button" aria-pressed={tab === "feed"} onClick={() => setTab("feed")}>
                Latest contact
              </button>
            </div>
            {tab === "ward" && wardPeople.length ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  downloadCSV(
                    stampName(
                      `groundwork-${(selected?.name ?? "ward").toLowerCase().replace(/\s+/g, "-")}-roster`,
                    ),
                    ["Name", "Phone", "Support score", "Last contact", "Status"],
                    wardPeople.map((r) => [
                      r.name,
                      r.phone ?? "",
                      r.support,
                      r.lastTouch ? r.lastTouch.slice(0, 10) : "",
                      r.optedOut ? "opted out" : "contactable",
                    ]),
                  )
                }
              >
                Download roster · CSV
              </button>
            ) : null}
          </div>
        </div>

        {tab === "ward" ? (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th style={{ textAlign: "right" }}>Support</th>
                  <th style={{ textAlign: "right" }}>Last contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {wardPeople.map((r) => (
                  <tr
                    key={r.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate({ to: "/people", search: { person: r.id } })}
                  >
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td className="mono">{r.phone ?? "—"}</td>
                    <td className="num">{r.support || "—"}</td>
                    <td className="num mono">{r.lastTouch ? stamp(r.lastTouch) : "never"}</td>
                    <td className="meta">{r.optedOut ? "Opted out" : "Contactable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wardPeople.length === 0 && (
              <p className="f-note">No one on file in this ward yet.</p>
            )}
          </div>
        ) : (
          <div className="t-list">
            {data.feed.map((f) => (
              <button
                type="button"
                className="t-row t-row--link"
                key={f.id}
                onClick={() => navigate({ to: "/people", search: { person: f.id } })}
              >
                <span className="t-when mono">{stamp(f.when)}</span>
                <span className="t-what">
                  <b>{f.name}</b> · {f.ward ?? "ward unknown"}
                  {f.phone ? <span className="mono"> · {f.phone}</span> : null}
                </span>
                <span className="t-who">support {f.support || "—"}</span>
              </button>
            ))}
            {data.feed.length === 0 && <p className="f-note">No contact recorded yet.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
