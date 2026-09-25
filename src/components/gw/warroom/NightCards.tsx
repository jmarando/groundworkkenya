import { ChoroplethMap } from "@/components/gw/demo/ChoroplethMap";
import { toneVar } from "@/components/gw/demo/tone";
import type { NightFrame } from "@/lib/demo/election-night";
import type { Scenario } from "@/lib/demo/types";

const nf = new Intl.NumberFormat("en-KE");
const pct = (n: number) => `${n.toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

const CALL_TEXT = {
  early: "Too early",
  close: "Too close to call",
  leaning: "Leaning",
  called: "Projected",
  runoff: "Run-off",
} as const;

export function Tally({ s, f }: { s: Scenario; f: NightFrame }) {
  const president = s.office === "president";
  const order = s.contenders
    .map((c, i) => ({ c, i, votes: f.votes[i] ?? 0, share: f.shares[i] ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
  const lead = (order[0]?.votes ?? 0) - (order[1]?.votes ?? 0);
  return (
    <div className="card w-span7">
      <div className={`en-call en-call--${f.call.state}`} role="status" aria-live="polite">
        <b>{CALL_TEXT[f.call.state]}</b> {f.call.text}
      </div>
      {f.valid === 0 ? (
        <p className="meta en-wait">
          Polls closed at 17:00. Counting starts at each station; the first {s.night.forms.station}{" "}
          photos arrive when it ends.
        </p>
      ) : (
        order.map(({ c, i, votes, share }, rank) => (
          <div className="t-row" key={c.key}>
            <span className="t-name">
              {c.name}
              {rank === 0 && <small>lead +{nf.format(lead)}</small>}
            </span>
            <span>
              <span className="t-count stat">{nf.format(votes)}</span>
              <span className="t-share">{pct(share)}</span>
            </span>
            <span className="t-track">
              {president && <span className="t-maj" aria-hidden="true" />}
              {president && i === 0 && <span className="t-majlbl">50 · MAJORITY</span>}
              <span
                className="t-fill"
                style={{ width: `${Math.min(100, share)}%`, background: toneVar(c.tone) }}
              />
            </span>
          </div>
        ))
      )}
      <div className="t-chips en-chips">
        <span className="chip">
          Valid votes <b className="stat">{nf.format(f.valid)}</b>
        </span>
        <span className="chip">
          Stations <b className="stat">{pct((f.stations.reported / f.stations.total) * 100)}</b>
        </span>
        <span className="chip">
          Register covered{" "}
          <b className="stat">
            {pct(f.registered ? (f.registeredCovered / f.registered) * 100 : 0)}
          </b>
        </span>
        {f.valid > 0 && (
          <span className="chip">
            Turnout <b className="stat">{pct(f.turnout.now)}</b>{" "}
            <span className="dim">
              ({signed(f.turnout.now - f.turnout.then)} on 2022 at these stations)
            </span>
          </span>
        )}
      </div>
      <p className="method">
        Our parallel tally of signed {s.night.forms.station} forms, photographed by our agents. It
        reports what the forms say; only IEBC declares results.
      </p>
    </div>
  );
}

/** Where the final number is likely to land: the range narrows as stations report. */
export function Projection({ s, f }: { s: Scenario; f: NightFrame }) {
  const p = f.projection;
  const president = s.office === "president";
  // President: our share on a 44–56 scale. Others: our lead on a −12..+12 scale.
  const lo = president ? 44 : -12;
  const hi = president ? 56 : 12;
  const value = president ? (p.shares[0] ?? 0) : p.margin;
  const half = president ? p.band : p.marginBand;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const left = Math.max(lo, value - half);
  const right = Math.min(hi, value + half);
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Projection</h2>
        <span className="mono">{president ? "our share" : "our lead, points"}</span>
      </div>
      <div
        className="band"
        role="img"
        aria-label={`Projected ${president ? "share" : "lead"}: ${value.toFixed(1)} plus or minus ${half.toFixed(1)}`}
      >
        <span className="band-track" />
        <span
          className="band-range"
          style={{ left: at(left), width: `calc(${at(right)} - ${at(left)})` }}
        />
        <span className="band-50" style={{ left: at(president ? 50 : 0) }} />
        <span className="band-mark" style={{ left: at(value) }} />
        <span className="band-lbl" style={{ left: at(value) }}>
          {president ? value.toFixed(1) : signed(value)} ± {half.toFixed(1)}
        </span>
      </div>
      <div className="band-ends">
        <span>{president ? lo : lo}</span>
        <span>{president ? "50 = majority" : "0 = tied"}</span>
        <span>{president ? hi : `+${hi}`}</span>
      </div>
      <p className="method" style={{ marginTop: 12 }}>
        Counted stations, plus the model for the rest, moved by the swing seen so far. The range is
        95%; a call needs all of it on one side.
      </p>
    </div>
  );
}

export function PathToWin({ s, f }: { s: Scenario; f: NightFrame }) {
  if (s.office === "president") {
    const us = f.projection.shares[0] ?? 0;
    const cells = [...f.areas].sort((a, b) => b.projectedUs - a.projectedUs);
    return (
      <div className="card">
        <div className="card-head">
          <h2>Path to victory</h2>
          <span className="mono">both tests</span>
        </div>
        <div className="d-row">
          <span>More than half the votes</span>
          <b className="stat">
            {us.toFixed(1)}%{" "}
            {us - f.projection.band > 50 ? "✓" : us + f.projection.band < 50 ? "✕" : "…"}
          </b>
        </div>
        <div className="d-row">
          <span>25% in 24 counties</span>
          <b className="stat">
            {f.at25 ?? 0} / 47 {(f.at25 ?? 0) >= 24 ? "✓" : "…"}
          </b>
        </div>
        <div
          className="en-strip"
          role="img"
          aria-label={`Projected at 25% or more in ${f.at25} counties`}
        >
          {cells.map((a, i) => (
            <span
              key={a.slug}
              title={`${a.name}: ${a.projectedUs.toFixed(0)}%`}
              className={`${a.projectedUs >= 25 ? "is-in" : ""}${i === 23 ? " is-24" : ""}`}
            />
          ))}
        </div>
        <p className="method">Counties by our projected share; the mark is the 24th.</p>
      </div>
    );
  }
  const rival = s.contenders[1]!;
  const stationsOut = f.stations.total - f.stations.reported;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Path to victory</h2>
        <span className="mono">most votes wins</span>
      </div>
      <div className="d-row">
        <span>Projected lead over {rival.short}</span>
        <b className="stat">
          {signed(f.projection.margin)} ± {f.projection.marginBand.toFixed(1)}
        </b>
      </div>
      <div className="d-row">
        <span>Counted lead</span>
        <b className="stat">{nf.format((f.votes[0] ?? 0) - (f.votes[1] ?? 0))} votes</b>
      </div>
      <div className="d-row">
        <span>Stations still out</span>
        <b className="stat">{nf.format(stationsOut)}</b>
      </div>
    </div>
  );
}

export function NightMap({ s, f }: { s: Scenario; f: NightFrame }) {
  const bySlug = new Map(f.areas.map((a) => [a.slug, a]));
  return (
    <div className="card w-span7 en-mapcard">
      <div className="card-head">
        <h2>Who leads where</h2>
        <span className="mono">brighter = more of the {s.geo.unit} counted</span>
      </div>
      <ChoroplethMap
        file={s.geo.file}
        label={`Leader in each ${s.geo.unit}, as counted`}
        fill={(slug) => {
          const a = bySlug.get(slug);
          const c = a?.leader !== null && a?.leader !== undefined ? s.contenders[a.leader] : null;
          return c ? toneVar(c.tone) : "var(--map-none)";
        }}
        opacity={(slug) => {
          const a = bySlug.get(slug);
          return a && a.leader !== null ? 0.35 + 0.65 * (a.reported / 100) : 1;
        }}
        tip={(slug, name) => {
          const a = bySlug.get(slug);
          if (!a) return <b>{name}</b>;
          return (
            <>
              <b>{name}</b>
              <small>{pct(a.reported)} of stations in</small>
              {a.valid > 0 &&
                s.contenders.map((c, i) => (
                  <span key={c.key}>
                    {c.short} <b>{pct(a.shares[i] ?? 0)}</b>
                  </span>
                ))}
              {a.swing !== null && <small>{signed(a.swing)} on our side's 2022 share</small>}
            </>
          );
        }}
      />
      <ul className="mb-map-key">
        {s.contenders.map((c) => (
          <li key={c.key}>
            <i style={{ background: toneVar(c.tone) }} />
            {c.short} leads
          </li>
        ))}
        <li>
          <i style={{ background: "var(--map-none)" }} />
          No results yet
        </li>
      </ul>
    </div>
  );
}

export function Portal({ f }: { f: NightFrame }) {
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 4 }}>
        <h2>Against the IEBC portal</h2>
        <span className="mono">station by station</span>
      </div>
      <div className="d-row">
        <span>Our forms in</span>
        <b className="stat">{pct((f.stations.reported / f.stations.total) * 100)}</b>
      </div>
      <div className="d-row">
        <span>Portal forms in</span>
        <b className="stat">{pct(f.portal.reported)}</b>
      </div>
      <div className="d-row">
        <span>Forms checked against the portal</span>
        <b className="stat">{nf.format(f.portal.checked)}</b>
      </div>
      <div className="d-row">
        <span>Forms that disagree</span>
        <b className="stat">{nf.format(f.portal.mismatches)}</b>
      </div>
      {f.portal.alert ? (
        <p className="en-alert" role="alert">
          <b>
            {f.portal.mismatches} form{f.portal.mismatches === 1 ? "" : "s"} disagree ·{" "}
            {nf.format(f.portal.mismatchVotes)} votes
          </b>{" "}
          {f.portal.alert}
        </p>
      ) : (
        <p className="method">Every form on the portal matches our photo so far.</p>
      )}
    </div>
  );
}

export function Pipeline({ s, f }: { s: Scenario; f: NightFrame }) {
  const st = f.stations;
  const rows = [
    { label: `${s.night.forms.station} photographed`, n: st.reported },
    { label: "Entered twice, independently", n: st.entered },
    { label: "Verified", n: st.verified },
  ];
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 4 }}>
        <h2>Forms</h2>
        <span className="mono">{s.night.forms.levels.join(" → ")}</span>
      </div>
      {rows.map((r) => (
        <div className="en-pipe" key={r.label}>
          <span>{r.label}</span>
          <span className="en-pipe-bar" aria-hidden="true">
            <i style={{ width: `${(r.n / st.total) * 100}%` }} />
          </span>
          <b className="stat">{nf.format(r.n)}</b>
        </div>
      ))}
      <div className="d-row">
        <span>Entries disagree, with a person now</span>
        <b className="stat">{nf.format(st.adjudicating)}</b>
      </div>
      <div className="d-row">
        <span>No agent: portal only</span>
        <b className="stat">{nf.format(st.blind)}</b>
      </div>
    </div>
  );
}

type Row = {
  key: string;
  name: string;
  sub: string;
  reported: number;
  leader: number | null;
  margin: number;
  swing: number | null;
};

/** Areas, or for the governor the constituencies the wards make up. */
export function Areas({ s, f }: { s: Scenario; f: NightFrame }) {
  let rows: Row[];
  if (s.office === "governor") {
    const groups = new Map<
      string,
      { votes: number[]; valid: number; stIn: number; reg: number; us22: number; w: number }
    >();
    for (const [i, a] of f.areas.entries()) {
      const g = groups.get(a.group) ?? {
        votes: s.contenders.map(() => 0),
        valid: 0,
        stIn: 0,
        reg: 0,
        us22: 0,
        w: 0,
      };
      a.votes.forEach((v, c) => (g.votes[c]! += v));
      g.valid += a.valid;
      g.stIn += (a.reported / 100) * a.registered;
      g.reg += a.registered;
      g.us22 += (s.areas[i]?.us2022 ?? 0) * a.registered;
      g.w += a.registered;
      groups.set(a.group, g);
    }
    rows = [...groups.entries()].map(([name, g]) => {
      const shares = g.votes.map((v) => (g.valid ? (v / g.valid) * 100 : 0));
      let leader: number | null = null;
      if (g.valid) {
        leader = 0;
        shares.forEach((x, c) => {
          if (x > shares[leader!]!) leader = c;
        });
      }
      return {
        key: name,
        name,
        sub: "",
        reported: g.reg ? (g.stIn / g.reg) * 100 : 0,
        leader,
        margin: g.valid ? (shares[0] ?? 0) - Math.max(...shares.slice(1)) : 0,
        swing: g.valid ? (shares[0] ?? 0) - g.us22 / g.w : null,
      };
    });
  } else {
    rows = f.areas.map((a) => ({
      key: a.slug,
      name: a.name,
      sub: s.office === "president" ? a.group : "",
      reported: a.reported,
      leader: a.leader,
      margin: a.margin,
      swing: a.swing,
    }));
  }
  rows.sort(
    (x, y) =>
      (y.reported > 0 ? 1 : 0) - (x.reported > 0 ? 1 : 0) ||
      Math.abs(x.margin) - Math.abs(y.margin),
  );
  const unit =
    s.office === "governor" ? "Constituency" : s.geo.unit[0]!.toUpperCase() + s.geo.unit.slice(1);
  return (
    <div className="card w-span7">
      <div className="card-head">
        <h2>
          {s.office === "governor"
            ? "Constituencies"
            : s.office === "president"
              ? "Counties"
              : "Wards"}
        </h2>
        <span className="mono">closest first · swing against our side in 2022</span>
      </div>
      <div className="w-tblbox">
        <table className="tbl">
          <thead>
            <tr>
              <th>{unit}</th>
              <th>Reporting</th>
              <th>Leading</th>
              <th style={{ textAlign: "right" }}>Margin</th>
              <th style={{ textAlign: "right" }}>vs 2022</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.leader !== null ? s.contenders[r.leader] : null;
              return (
                <tr key={r.key}>
                  <td>
                    {r.name} {r.sub && <small className="dim">{r.sub}</small>}
                  </td>
                  <td className="num">
                    {r.reported.toFixed(0)}%
                    <span className="repbar">
                      <i style={{ width: `${r.reported}%` }} />
                    </span>
                  </td>
                  <td>
                    {c ? (
                      <>
                        <i
                          className="en-dot"
                          style={{ background: toneVar(c.tone) }}
                          aria-hidden="true"
                        />
                        {c.short}
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="num">{c ? signed(r.margin) : "—"}</td>
                  <td className="num">{r.swing === null ? "—" : signed(r.swing)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SEV: Record<string, string> = {
  "SEV-1": "var(--gw-accent)",
  "SEV-2": "var(--status-onstation)",
  "SEV-3": "var(--muted-foreground)",
};

export function Incidents({ f }: { f: NightFrame }) {
  const list = [...f.incidents].reverse();
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Incidents</h2>
          <span className="mono">{list.length} logged · evidence kept</span>
        </div>
        {list.map((i) => (
          <div
            className="inc-row"
            key={i.at + i.title}
            style={{ ["--sev" as string]: SEV[i.severity] }}
          >
            <span className="inc-when">{i.at}</span>
            <span className="inc-what">
              {i.title} · {i.severity}
              <small>
                {i.area} · {i.detail}
              </small>
            </span>
            <span className="inc-state">{i.status}</span>
          </div>
        ))}
        {list.length === 0 && <p className="method">Nothing logged yet tonight.</p>}
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Flags for a person to check</h2>
          <span className="mono">never an accusation</span>
        </div>
        {f.flags.map((x) => (
          <div
            className="inc-row"
            key={x.station}
            style={{ ["--sev" as string]: "var(--status-onstation)" }}
          >
            <span className="inc-when">{x.at}</span>
            <span className="inc-what">
              {x.title}
              <small>
                {x.station} · {x.area}
              </small>
            </span>
            <span className="inc-state">Review</span>
          </div>
        ))}
        {f.flags.length === 0 && (
          <p className="method">No arithmetic or turnout anomalies so far.</p>
        )}
      </div>
    </>
  );
}

export function Feed({ s, f }: { s: Scenario; f: NightFrame }) {
  return (
    <div className="card w-span12">
      <div className="card-head">
        <h2>{s.office === "mp" ? "Polling centres reporting" : "Latest forms in"}</h2>
        <span className="mono">newest first</span>
      </div>
      <ul className="en-feed">
        {f.feed.map((r) => {
          const total = r.votes.reduce((x, y) => x + y, 0) || 1;
          return (
            <li key={r.at + r.station}>
              <span className="mono">{r.at}</span>
              <span className="en-feed-st">
                <b>{r.station}</b> <small className="dim">{r.area}</small>
              </span>
              <span className="en-feed-bar" aria-hidden="true">
                {r.votes.map((v, i) => (
                  <i
                    key={i}
                    style={{
                      width: `${(v / total) * 100}%`,
                      background: toneVar(s.contenders[i]!.tone),
                    }}
                  />
                ))}
              </span>
              <span className="en-feed-v">
                {s.contenders.map((c, i) => (
                  <span key={c.key} title={c.name}>
                    <i
                      className="en-dot"
                      style={{ background: toneVar(c.tone) }}
                      aria-hidden="true"
                    />
                    <span className="sr">{c.short} </span>
                    {nf.format(r.votes[i] ?? 0)}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
        {f.feed.length === 0 && <li className="method">No forms yet.</li>}
      </ul>
    </div>
  );
}
