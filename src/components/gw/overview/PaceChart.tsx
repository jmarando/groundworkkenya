import { compact, nf } from "@/components/gw/overview/format";
import { roundNice, weeklyHistory, type Pace } from "@/lib/demo/ops";
import type { Scenario } from "@/lib/demo/types";

const W = 600;
const H = 220;
const PAD = { top: 18, right: 14, bottom: 26, left: 14 };

/**
 * Supporters found over the last twelve weeks, where the recent rate takes
 * the count by polling day, and the straight line of what is needed.
 */
export function PaceChart({ s, today, p }: { s: Scenario; today: string; p: Pace }) {
  const hist = weeklyHistory(s, today);
  const span = hist.length - 1 + p.weeksLeft;
  // The count never starts from nothing, so neither does the axis: from just
  // under twelve weeks ago to just over the higher of target and projection.
  const top = Math.max(p.target, p.projected) * 1.03;
  const floor = hist[0]!.total * 0.9;
  const x = (week: number) => PAD.left + (week / span) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - floor) / (top - floor)) * (H - PAD.top - PAD.bottom);

  const now = hist.length - 1;
  const actual = hist.map((w, i) => `${x(i).toFixed(1)},${y(w.total).toFixed(1)}`).join(" ");
  const nowPt = `${x(now).toFixed(1)},${y(p.found).toFixed(1)}`;
  const end = x(span).toFixed(1);

  return (
    <section className="card ov-pace" aria-labelledby="ov-pace-h">
      <div className="card-head">
        <h2 id="ov-pace-h">Pace</h2>
        <span className="mono">
          {p.onPace ? "on pace" : `${nf.format(roundNice(p.shortfall))} short at this rate`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Supporters found: ${nf.format(p.found)} now, ${nf.format(Math.round(p.projected))} by polling day at the recent rate, against a target of ${nf.format(p.target)}`}
      >
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(p.target)}
          y2={y(p.target)}
          className="ov-pace-target"
        />
        <text x={W - PAD.right} y={y(p.target) - 6} textAnchor="end" className="ov-pace-lbl">
          TARGET {compact(p.target)}
        </text>
        <polyline points={`${nowPt} ${end},${y(p.target).toFixed(1)}`} className="ov-pace-need" />
        <polyline
          points={`${nowPt} ${end},${y(p.projected).toFixed(1)}`}
          className="ov-pace-proj"
        />
        <polyline points={actual} className="ov-pace-actual" />
        <circle cx={x(now)} cy={y(p.found)} r="4" className="ov-pace-dot" />
        <text x={PAD.left} y={y(floor) - 5} className="ov-pace-lbl">
          {compact(Math.round(floor))}
        </text>
        <text x={x(0)} y={H - 6} className="ov-pace-lbl">
          {hist[0]!.week.toUpperCase()}
        </text>
        <text x={x(now)} y={H - 6} textAnchor="middle" className="ov-pace-lbl">
          TODAY
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="ov-pace-lbl">
          10 AUG
        </text>
      </svg>
      <ul className="ov-legend">
        <li>
          <i className="is-actual" /> Found, last 12 weeks
        </li>
        <li>
          <i className="is-proj" /> At the recent rate: {compact(Math.round(p.projected))}
        </li>
        <li>
          <i className="is-need" /> Needed: {nf.format(Math.ceil(p.needed))} a week
        </li>
      </ul>
    </section>
  );
}
