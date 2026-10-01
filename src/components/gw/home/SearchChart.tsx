import { useState } from "react";

import { toneVar } from "@/components/gw/demo/tone";
import { dayName } from "@/lib/diary";
import { labelTicks } from "@/lib/race-data";
import type { SearchChartModel } from "@/lib/search-interest";

const W = 600;
const H = 220;
const M = { l: 30, r: 132, t: 12, b: 26 };

/** "5 Oct". */
const shortDay = (d: string) => dayName(d).split(" ").slice(1).join(" ");

/**
 * Thirty days of search interest, a line per candidate, 100 being the busiest
 * day of any of them. Hover a day for every candidate's figure.
 */
export function SearchChart({ model }: { model: SearchChartModel }) {
  const [at, setAt] = useState<number | null>(null);
  const { days, series } = model;
  const last = days.length - 1;
  const plotW = W - M.l - M.r;
  const x = (i: number) => M.l + (last > 0 ? i / last : 0.5) * plotW;
  const y = (v: number) => M.t + (1 - v / 100) * (H - M.t - M.b);
  // Day labels under the chart: the latest always, none crowding the next.
  const ticks = labelTicks(
    days.map((_, i) => x(i)),
    72,
  );

  // Direct labels at the latest day, pushed apart when close.
  const ends = series
    .filter((s) => s.values[last] !== null && s.values[last] !== undefined)
    .map((s) => ({ s, v: s.values[last]!, ly: y(s.values[last]!) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i]!.ly - ends[i - 1]!.ly < 15) ends[i]!.ly = ends[i - 1]!.ly + 15;
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))));
  };

  return (
    <div className="trend">
      <ul className="trend-legend" aria-label="Candidates">
        {series.map((s) => (
          <li key={s.key}>
            <i style={{ background: toneVar(s.tone) }} />
            {s.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Search interest, ${dayName(days[0]!)} to ${dayName(days[last]!)}`}
      >
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line className="trend-grid" x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} />
            <text className="trend-axis" x={M.l - 8} y={y(g) + 4} textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text
            key={i}
            className="trend-axis"
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
          >
            {shortDay(days[i]!)}
          </text>
        ))}
        {series.map((s) => {
          const pts = s.values.flatMap((v, i) => (v === null ? [] : [`${x(i)},${y(v)}`]));
          return pts.length > 1 ? (
            <polyline
              key={s.key}
              className="trend-line"
              style={{ stroke: toneVar(s.tone) }}
              points={pts.join(" ")}
            />
          ) : null;
        })}
        {ends.map(({ s, v, ly }) => (
          <g key={s.key}>
            <circle
              className="trend-dot"
              cx={x(last)}
              cy={y(v)}
              r={4}
              style={{ fill: toneVar(s.tone) }}
            />
            <text className="trend-end" x={x(last) + 10} y={ly + 4}>
              <tspan className="trend-end-v">{v}</tspan> {s.label}
            </text>
          </g>
        ))}
        {at !== null && (
          <line className="trend-cross" x1={x(at)} x2={x(at)} y1={M.t} y2={H - M.b} />
        )}
        <rect
          x={M.l}
          y={M.t}
          width={plotW}
          height={H - M.t - M.b}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setAt(null)}
        />
      </svg>
      {at !== null && (
        <div
          className="trend-tip"
          style={{ left: `${(x(at) / W) * 100}%` }}
          role="status"
          aria-live="polite"
        >
          <b>{dayName(days[at]!)}</b>
          {series.map((s) =>
            s.values[at] === null ? null : (
              <span key={s.key}>
                <i style={{ background: toneVar(s.tone) }} />
                {s.label} <b>{s.values[at]}</b>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
