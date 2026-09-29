import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ChoroplethMap } from "@/components/gw/demo/ChoroplethMap";
import { compact, nf, pct } from "@/components/gw/overview/format";
import { areaShortfall, type OpsArea, type Pace } from "@/lib/demo/ops";
import type { Scenario } from "@/lib/demo/types";

/** Found against target, in the bands the map shows. */
const BANDS = [
  { min: 1, fill: "var(--map-o3)", label: "At or past target" },
  { min: 0.8, fill: "var(--map-o2)", label: "80–100%" },
  { min: 0.6, fill: "var(--map-o1)", label: "60–80%" },
  { min: 0, fill: "var(--map-below)", label: "Under 60%" },
];

const band = (a: OpsArea) => BANDS.find((b) => a.found / a.target >= b.min) ?? BANDS[3]!;

/** Weeks to close the gap at last week's rate; null when it never closes. */
function weeksToClose(a: OpsArea): number | null {
  if (a.found >= a.target) return 0;
  return a.lastWeek > 0 ? (a.target - a.found) / a.lastWeek : null;
}

/** Where the supporters are coming from, and where they are not. */
export function GroundGame({ s, areas, p }: { s: Scenario; areas: OpsArea[]; p: Pace }) {
  const ranked = useMemo(
    () => [...areas].sort((a, b) => areaShortfall(b, p.weeksLeft) - areaShortfall(a, p.weeksLeft)),
    [areas, p.weeksLeft],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const bySlug = useMemo(() => new Map(areas.map((a) => [a.slug, a])), [areas]);
  const focus = (selected && bySlug.get(selected)) || ranked[0]!;
  const rows = all ? ranked : ranked.slice(0, 12);
  const unit = s.geo.unit;

  return (
    <section className="card" aria-labelledby="ov-gg-h">
      <div className="card-head">
        <div>
          <h2 id="ov-gg-h">Ground game</h2>
          <p className="meta">
            Supporters found against each {unit}&apos;s share of the target. Worst first: who ends
            up furthest short at last week&apos;s rate.
          </p>
        </div>
        <span className="card-head-r">
          <span className="mono">
            {areas.length} {s.geo.units} · {s.ops.coordinatorRole.toLowerCase()}s
          </span>
          <Link to="/voters" className="card-go">
            Open the map ›
          </Link>
        </span>
      </div>

      <div className="ov-gg">
        <div className="mb-map-wrap">
          <ChoroplethMap
            file={s.geo.file}
            label={`Supporters found against target, by ${unit}`}
            fill={(slug) => {
              const a = bySlug.get(slug);
              return a ? band(a).fill : "var(--map-below)";
            }}
            selected={focus.slug}
            onSelect={setSelected}
            tip={(slug, name) => {
              const a = bySlug.get(slug);
              return a ? (
                <>
                  <b>{name}</b>
                  <span>
                    {nf.format(a.found)} of {nf.format(a.target)} ({pct(a.found, a.target)})
                  </span>
                  <span>+{nf.format(a.lastWeek)} last week</span>
                </>
              ) : (
                <b>{name}</b>
              );
            }}
          />
          <ul className="mb-map-key">
            {BANDS.map((b) => (
              <li key={b.label}>
                <i style={{ background: b.fill }} />
                {b.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="ov-focus" aria-live="polite">
          <span className="eyebrow">{focus.group}</span>
          <h3>{focus.name}</h3>
          <p className="ov-focus-big">
            <b className="stat">{nf.format(focus.found)}</b> of {nf.format(focus.target)} found
          </p>
          <dl>
            <div>
              <dt>Last week</dt>
              <dd>+{nf.format(focus.lastWeek)}</dd>
            </div>
            <div>
              <dt>Needed a week</dt>
              <dd>
                {nf.format(
                  Math.ceil(Math.max(0, focus.target - focus.found) / Math.max(p.weeksLeft, 1)),
                )}
              </dd>
            </div>
            <div>
              <dt>Doors this week</dt>
              <dd>{nf.format(focus.doors)}</dd>
            </div>
            <div>
              <dt>{s.ops.coordinatorRole}</dt>
              <dd>{focus.coordinator}</dd>
            </div>
          </dl>
          <p className="meta">
            {areaShortfall(focus, p.weeksLeft) > 0
              ? `At last week's rate ${focus.name} ends ${nf.format(Math.round(areaShortfall(focus, p.weeksLeft)))} short.`
              : `At last week's rate ${focus.name} reaches its target in time.`}
          </p>
        </div>
      </div>

      <div className="ov-tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{unit[0]!.toUpperCase() + unit.slice(1)}</th>
              <th style={{ textAlign: "right" }}>Target</th>
              <th style={{ textAlign: "right" }}>Found</th>
              <th style={{ textAlign: "right" }}>Last week</th>
              <th style={{ textAlign: "right" }}>Doors</th>
              <th>Closes in</th>
              <th>{s.ops.coordinatorRole}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const w = weeksToClose(a);
              const late = w === null || w > p.weeksLeft;
              return (
                <tr key={a.slug} className={a.slug === focus.slug ? "is-sel" : undefined}>
                  <td>
                    <button
                      type="button"
                      className="ov-rowbtn"
                      aria-pressed={a.slug === focus.slug}
                      onClick={() => setSelected(a.slug)}
                    >
                      {a.name}
                    </button>{" "}
                    <small className="meta">{a.group}</small>
                  </td>
                  <td className="num">{compact(a.target)}</td>
                  <td className="num">
                    {compact(a.found)} <small className="meta">{pct(a.found, a.target)}</small>
                  </td>
                  <td className="num">+{nf.format(a.lastWeek)}</td>
                  <td className="num">{nf.format(a.doors)}</td>
                  <td className={late ? "ov-late" : undefined}>
                    {w === 0
                      ? "on target"
                      : w === null
                        ? "not at this rate"
                        : `${Math.ceil(w)} wks${late ? ", too slow" : ""}`}
                  </td>
                  <td className="meta">{a.coordinator}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {areas.length > 12 && (
        <button
          type="button"
          className="btn btn--ghost btn--sm ov-show"
          onClick={() => setAll(!all)}
        >
          {all ? "Show the 12 furthest behind" : `Show all ${areas.length} ${s.geo.units}`}
        </button>
      )}
    </section>
  );
}
