import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getWarRoom } from "@/lib/console.functions";

const nf = new Intl.NumberFormat("en-KE");
const pct = (n: number) => `${n.toFixed(1)}%`;
const clockOf = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi", hour12: false });
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
  });

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const SEV_COLOUR: Record<string, string> = {
  critical: "var(--gw-accent)",
  high: "var(--gw-accent)",
  warn: "var(--status-onstation)",
  medium: "var(--status-onstation)",
};

/** The war room on the live database: stations, forms filed, incidents. */
export function LiveWarRoom() {
  const now = useClock();
  const fetchWarRoom = useServerFn(getWarRoom);
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["warroom"],
    queryFn: () => fetchWarRoom(),
    refetchInterval: 60_000,
  });

  if (!data) {
    return (
      <section className="view w active" data-surface="warroom" aria-label="War room">
        <div className="w-top">
          <div>
            <span className="eyebrow">Election night · parallel tally</span>
            <div className="w-title">Governor · Nairobi County</div>
            <p className="w-tagline">
              The county, <span className="serif">counted.</span>
            </p>
          </div>
        </div>
        <p className="meta">Loading the tally…</p>
      </section>
    );
  }

  const s = data.stations;
  const t = data.tally;
  const total = s.total || 1;
  const pcOf = (n: number) => (n / total) * 100;
  const leader = t.candidates[0];
  const runner = t.candidates[1];
  const regCoverage = s.registered ? (s.registeredCovered / s.registered) * 100 : 0;
  const syncedAgo = Math.max(0, Math.round((now.getTime() - dataUpdatedAt) / 1000));
  const projLeft = data.projection
    ? Math.min(100, Math.max(0, ((data.projection.share - 48) / 8) * 100))
    : 0;
  const projWidth = data.projection ? Math.min(60, (data.projection.margin / 8) * 100 * 2) : 0;

  return (
    <section className="view w active" data-surface="warroom" aria-label="War room">
      <div className="w-top fx">
        <div>
          <span className="eyebrow">
            Election night ·{" "}
            {now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ·
            parallel tally
          </span>
          <div className="w-title">Governor · Nairobi County</div>
          <p className="w-tagline">
            The county, <span className="serif">counted.</span>
          </p>
        </div>
        <div className="w-clockside">
          <span className="w-clock">
            {clockOf(now)}{" "}
            <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>EAT</span>
          </span>
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> Live · synced {syncedAgo}s ago
          </span>
          <span className="chip">
            Stations{" "}
            <b className="stat" style={{ marginLeft: 4 }}>
              {nf.format(s.reporting)} / {nf.format(s.total)}
            </b>
          </span>
          <Link to="/warroom" search={({ mode: _live, ...rest }) => rest} className="en-mode">
            Election-night simulation
          </Link>
        </div>
      </div>

      <div className="w-grid">
        <div className="card w-span7 fx2">
          {t.candidates.length === 0 ? (
            <>
              <div className="card-head">
                <h2>No forms in yet</h2>
                <span className="mono">tally opens as agents file</span>
              </div>
              <p className="meta">
                Every signed Form 34A your agents photograph lands here. Until the first one is
                filed we show nothing rather than a guess.
              </p>
              <div className="t-chips">
                <span className="chip">
                  Agents confirmed{" "}
                  <b className="stat" style={{ marginLeft: 4 }}>
                    {nf.format(s.confirmed)}
                  </b>
                </span>
                <span className="chip">
                  Stations without an agent{" "}
                  <b className="stat" style={{ marginLeft: 4 }}>
                    {nf.format(s.noAgent)}
                  </b>
                </span>
                <span className="chip">
                  Streams to cover{" "}
                  <b className="stat" style={{ marginLeft: 4 }}>
                    {nf.format(data.streams)}
                  </b>
                </span>
              </div>
            </>
          ) : (
            <>
              {t.candidates.map((c, i) => (
                <div className="t-row" key={c.name}>
                  <span className="t-name">
                    {c.name}
                    {i === 0 && runner ? <small>lead +{nf.format(t.lead)}</small> : null}
                  </span>
                  <span>
                    <span className="t-count stat">{nf.format(c.votes)}</span>
                    <span className="t-share">{pct(c.share)}</span>
                  </span>
                  <span className="t-track">
                    <span className="t-maj" aria-hidden="true" />
                    {i === 0 && <span className="t-majlbl">50 · MAJORITY</span>}
                    <span
                      className={`t-fill ${i === 0 ? "t-fill--w" : "t-fill--o"}`}
                      style={{ width: `${Math.min(100, c.share)}%` }}
                    />
                  </span>
                </div>
              ))}
              {t.otherCount > 0 && (
                <div className="t-small">
                  <span>
                    {t.otherCount} other candidate{t.otherCount === 1 ? "" : "s"}
                  </span>
                  <b className="stat">
                    {nf.format(t.otherVotes)} · {pct(t.otherShare)}
                  </b>
                </div>
              )}
              <div className="t-votesin">
                <span className="pulse-counter">
                  <b>{nf.format(t.validVotes)}</b> valid votes counted
                </span>
                <span>
                  · {pcOf(s.reporting).toFixed(1)}% of stations · {regCoverage.toFixed(1)}% of the
                  register covered
                </span>
              </div>
            </>
          )}
          <p className="method">
            Parallel tally of photographed, signed polling-station result forms as observed by our
            agents. Coverage is stated on every figure. This system reports; it does not declare
            results.
          </p>
        </div>

        <div className="w-rail">
          <div className="card fx3">
            <div className="card-head" style={{ marginBottom: 0 }}>
              <h2>Projection</h2>
              <span className="mono">coverage-weighted</span>
            </div>
            {data.projection && leader ? (
              <>
                <div className="band" role="img" aria-label="Projected share">
                  <span className="band-track" />
                  <span
                    className="band-range"
                    style={{
                      left: `${Math.max(0, projLeft - projWidth / 2)}%`,
                      width: `${projWidth}%`,
                    }}
                  />
                  <span className="band-50" style={{ left: "25%" }} />
                  <span className="band-mark" style={{ left: `${projLeft}%` }} />
                  <span className="band-lbl" style={{ left: `${projLeft}%` }}>
                    {data.projection.share.toFixed(1)} ± {data.projection.margin.toFixed(1)}
                  </span>
                </div>
                <div className="band-ends">
                  <span>48</span>
                  <span>50 = majority</span>
                  <span>56</span>
                </div>
                <p className="method" style={{ marginTop: 12 }}>
                  {leader.name} on reported stations only. Blind spots — {nf.format(s.noAgent)}{" "}
                  stations, {(100 - regCoverage).toFixed(1)}% of the register — are excluded and
                  said so.
                </p>
              </>
            ) : (
              <p className="method" style={{ marginTop: 12, borderTop: 0, paddingTop: 0 }}>
                A projection appears once the first forms are in. No model runs on an empty tally.
              </p>
            )}
          </div>

          <div className="card fx3">
            <div className="card-head" style={{ marginBottom: 4 }}>
              <h2>Against the official stream</h2>
              <span className="mono">read every 5 min</span>
            </div>
            <div className="d-row">
              <span>Our projection</span>
              <b className="stat">{data.projection ? pct(data.projection.share) : "—"}</b>
            </div>
            <div className="d-row">
              <span>IEBC public stream</span>
              <b className="stat">—</b>
            </div>
            <div className="d-row">
              <span>Divergence</span>
              <span className="mono dim">connect the stream to compare</span>
            </div>
          </div>
        </div>

        <div className="card w-span12 fx4">
          <div className="card-head" style={{ marginBottom: 2 }}>
            <h2>Station coverage</h2>
            <span className="mono">
              {nf.format(s.total)} stations · every status carries its glyph and label
            </span>
          </div>
          <div className="cov-bar" role="img" aria-label="Station coverage by status">
            <i style={{ width: `${pcOf(s.reporting)}%`, background: "var(--status-reporting)" }} />
            <i style={{ width: `${pcOf(s.onStation)}%`, background: "var(--status-onstation)" }} />
            <i style={{ width: `${pcOf(s.missed)}%`, background: "var(--status-missed)" }} />
            <i style={{ width: `${pcOf(s.noAgent)}%`, background: "var(--status-noagent)" }} />
          </div>
          <div className="cov-legend">
            <div className="cov-item" style={{ borderColor: "var(--status-reporting)" }}>
              <span className="g" style={{ color: "var(--status-reporting)" }} aria-hidden="true">
                ●
              </span>
              <span className="n stat">{nf.format(s.reporting)}</span>
              <span className="l">Reporting · {pcOf(s.reporting).toFixed(1)}%</span>
            </div>
            <div className="cov-item" style={{ borderColor: "var(--status-onstation)" }}>
              <span className="g" style={{ color: "var(--status-onstation)" }} aria-hidden="true">
                ◐
              </span>
              <span className="n stat">{nf.format(s.onStation)}</span>
              <span className="l">On station · {pcOf(s.onStation).toFixed(1)}%</span>
            </div>
            <div className="cov-item" style={{ borderColor: "var(--status-missed)" }}>
              <span className="g" style={{ color: "var(--status-missed)" }} aria-hidden="true">
                ▲
              </span>
              <span className="n stat">{nf.format(s.missed)}</span>
              <span className="l">Missed check-in · {pcOf(s.missed).toFixed(1)}%</span>
            </div>
            <div className="cov-item">
              <span className="g" style={{ color: "var(--status-noagent)" }} aria-hidden="true">
                ○
              </span>
              <span className="n stat">{nf.format(s.noAgent)}</span>
              <span className="l">No agent · blind spot</span>
            </div>
          </div>
        </div>

        <div className="card w-span7 fx5">
          <div className="card-head">
            <h2>Constituencies</h2>
            <span className="mono">
              {data.constituencies.length} of {data.constituencies.length} · margin = reported
              stations only
            </span>
          </div>
          <div className="w-tblbox">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Constituency</th>
                  <th>Reporting</th>
                  <th style={{ textAlign: "right" }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.constituencies.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">
                      {c.reportingPct.toFixed(0)}%
                      <span className="repbar">
                        <i style={{ width: `${c.reportingPct}%` }} />
                      </span>
                    </td>
                    <td className="num">
                      {c.leader ? `${c.leader.slice(0, 1)} +${nf.format(c.margin)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-rail fx5">
          <div className="card">
            <div className="card-head">
              <h2>Incidents</h2>
              <span className="mono">{data.incidents.length} logged · chain of custody kept</span>
            </div>
            {data.incidents.slice(0, 6).map((i) => (
              <div
                className="inc-row"
                key={i.id}
                style={{ ["--sev" as string]: SEV_COLOUR[i.severity] ?? "var(--muted-foreground)" }}
              >
                <span className="inc-when">{hhmm(i.occurredAt)}</span>
                <span className="inc-what">
                  {i.title} · {i.severity.toUpperCase()}
                  <small>
                    {i.ward ?? "ward unknown"}
                    {i.detail ? ` · ${i.detail}` : ""}
                    {i.reportedBy ? ` · ${i.reportedBy}` : ""}
                  </small>
                </span>
                <span className="inc-state">{i.status}</span>
              </div>
            ))}
            {data.incidents.length === 0 && <p className="method">Nothing logged tonight.</p>}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Flags for human review</h2>
              <span className="mono">never auto-accusations</span>
            </div>
            {data.flags.map((f) => (
              <div
                className="inc-row"
                key={f.id}
                style={{ ["--sev" as string]: "var(--status-onstation)" }}
              >
                <span className="inc-when">{hhmm(f.at)}</span>
                <span className="inc-what">
                  {f.title}
                  <small>{f.detail}</small>
                </span>
                <span className="inc-state">Review</span>
              </div>
            ))}
            {data.flags.length === 0 && (
              <p className="method">
                No arithmetic or turnout anomalies on the forms filed so far.
              </p>
            )}
          </div>
        </div>

        <div className="card w-span12 fx5">
          <div className="card-head">
            <div>
              <h2>Stations still needing an agent</h2>
              <p className="meta">Fill these first — biggest register at the top.</p>
            </div>
            <span className="mono">{nf.format(s.noAgent)} open</span>
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
      </div>
    </section>
  );
}
