import { Link } from "@tanstack/react-router";

import { ActionButton } from "@/components/gw/briefing/parts";
import { nf, pct } from "@/components/gw/overview/format";
import { readiness, type OpsArea } from "@/lib/demo/ops";

/** Every stream needs a trained, confirmed agent by polling day. */
export function Readiness({ areas }: { areas: OpsArea[] }) {
  const r = readiness(areas);
  const stages = [
    { label: "Streams to cover", value: r.streams },
    { label: "Agents recruited", value: r.recruited },
    { label: "Trained", value: r.trained },
    { label: "Confirmed", value: r.confirmed },
  ];
  const weakest = [...areas]
    .sort((a, b) => a.trained / a.streams - b.trained / b.streams)
    .slice(0, 5);

  return (
    <section className="card" aria-labelledby="ov-ready-h">
      <div className="card-head">
        <h2 id="ov-ready-h">Polling day</h2>
        <span className="card-head-r">
          <span className="mono">
            {nf.format(r.streams - r.trained)} streams without a trained agent
          </span>
          <Link to="/agents" className="card-go">
            Assign agents ›
          </Link>
        </span>
      </div>
      <ol className="ov-funnel">
        {stages.map((st) => (
          <li key={st.label}>
            <span>{st.label}</span>
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${(st.value / r.streams) * 100}%` }} />
            </span>
            <span className="ov-funnel-n">
              <b className="stat">{nf.format(st.value)}</b>
              <small>{pct(st.value, r.streams)}</small>
            </span>
          </li>
        ))}
      </ol>
      <h3 className="ov-sub">Furthest behind on training</h3>
      <ul className="ov-weak">
        {weakest.map((a) => (
          <li key={a.slug}>
            <span>
              {a.name} <small className="meta">{a.group}</small>
            </span>
            <span className="meta">
              {nf.format(a.trained)} of {nf.format(a.streams)} streams trained
            </span>
          </li>
        ))}
      </ul>
      <div className="mb-actions">
        <ActionButton action={{ kind: "go", label: "Assign agents", to: "/agents" }} />
        <ActionButton quiet action={{ kind: "go", label: "Open the war room", to: "/warroom" }} />
      </div>
    </section>
  );
}
