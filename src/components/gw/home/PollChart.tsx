import { useState } from "react";

import { toneVar } from "@/components/gw/demo/tone";
import type { PollChartModel } from "@/lib/race-data";

const W = 600;
const H = 240;
const M = { l: 30, r: 132, t: 12, b: 26 };

/**
 * Every published poll of the race, placed by date: a line per candidate
 * joining the polls that named them, undecided dashed. Hover a poll for its
 * figures; the table below the chart has the same numbers.
 */
export function PollChart({ model }: { model: PollChartModel }) {
  const [at, setAt] = useState<number | null>(null);
  const { polls, xs, labels, series, max } = model;
  const n = polls.length;
  const last = n - 1;
  const plotW = W - M.l - M.r;
  const x = (f: number) => M.l + f * plotW;
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const grid = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);

  // Month labels under the polls, skipping any that would crowd the one before.
  const ticks: number[] = [];
  xs.forEach((f, i) => {
    const prev = ticks.at(-1);
    if (prev === undefined || x(f) - x(xs[prev]!) >= 64) ticks.push(i);
  });

  // Direct labels for the candidates in the latest poll, pushed apart when close.
  const ends = series
    .filter((s) => s.values[last] !== null && s.values[last] !== undefined)
    .map((s) => ({ s, v: s.values[last]!, ly: y(s.values[last]!) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i]!.ly - ends[i - 1]!.ly < 15) ends[i]!.ly = ends[i - 1]!.ly + 15;
  }

  // The hover area reaches 8 units past the plot on each side; find the nearest poll.
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (((e.clientX - r.left) / r.width) * (plotW + 16) - 8) / plotW;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(v - f) < Math.abs(xs[best]! - f)) best = i;
    });
    setAt(best);
  };

  return (
    <div className="trend">
      <ul className="trend-legend" aria-label="Candidates">
        {series.map((s) => (
          <li key={s.key}>
            <i
              className={s.tone === "und" ? "is-dash" : undefined}
              style={{ background: toneVar(s.tone) }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${n} published ${n === 1 ? "poll" : "polls"}, ${labels[0]} to ${labels[last]}`}
      >
        {grid.map((g) => (
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
            x={x(xs[i]!)}
            y={H - 6}
            textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === last ? "end" : "middle"}
          >
            {labels[i]}
          </text>
        ))}
        {series.map((s) => {
          const pts = s.values.flatMap((v, i) => (v === null ? [] : [`${x(xs[i]!)},${y(v)}`]));
          return (
            <g key={s.key}>
              {pts.length > 1 && (
                <polyline
                  className={`trend-line${s.tone === "und" ? " is-dash" : ""}`}
                  style={{ stroke: toneVar(s.tone) }}
                  points={pts.join(" ")}
                />
              )}
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={i}
                    className="trend-dot"
                    cx={x(xs[i]!)}
                    cy={y(v)}
                    r={4}
                    style={{ fill: toneVar(s.tone) }}
                  />
                ),
              )}
            </g>
          );
        })}
        {ends.map(({ s, v, ly }) => (
          <text key={s.key} className="trend-end" x={x(xs[last]!) + 10} y={ly + 4}>
            <tspan className="trend-end-v">{v}</tspan> {s.label}
          </text>
        ))}
        {at !== null && (
          <line className="trend-cross" x1={x(xs[at]!)} x2={x(xs[at]!)} y1={M.t} y2={H - M.b} />
        )}
        <rect
          x={M.l - 8}
          y={M.t}
          width={plotW + 16}
          height={H - M.t - M.b}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setAt(null)}
        />
      </svg>
      {at !== null && polls[at] && (
        <div
          className="trend-tip"
          style={{ left: `${(x(xs[at]!) / W) * 100}%` }}
          role="status"
          aria-live="polite"
        >
          <b>
            {polls[at]!.pollster} · {labels[at]}
          </b>
          {series.map((s) =>
            s.values[at] === null ? null : (
              <span key={s.key}>
                <i style={{ background: toneVar(s.tone) }} />
                {s.label} <b>{s.values[at]}%</b>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
