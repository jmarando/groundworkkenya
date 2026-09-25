import { useState } from "react";

import { toneVar, type SeriesTone } from "@/components/gw/demo/tone";
import type { PollPoint } from "@/lib/demo/types";

export type Series = { key: string; label: string; tone: SeriesTone };

const W = 600;
const H = 220;
const M = { l: 30, r: 118, t: 12, b: 24 };

/**
 * Twelve weeks of the poll average: one line per contender, undecided dashed.
 * Direct labels at the right end, a crosshair and values on hover.
 */
export function TrendChart({ points, series }: { points: PollPoint[]; series: Series[] }) {
  const [at, setAt] = useState<number | null>(null);
  const n = points.length;
  const max =
    Math.ceil(
      (Math.max(...points.flatMap((p) => series.map((s) => p.shares[s.key] ?? 0))) + 2) / 10,
    ) * 10;
  const x = (i: number) => M.l + (i * (W - M.l - M.r)) / Math.max(1, n - 1);
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const grid = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);

  // End labels, pushed apart so close values don't overlap.
  const ends = series
    .map((s) => ({ s, v: points[n - 1]?.shares[s.key] ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .map((e) => ({ ...e, ly: y(e.v) }));
  for (let i = 1; i < ends.length; i++) {
    const prev = ends[i - 1]!;
    if (ends[i]!.ly - prev.ly < 15) ends[i]!.ly = prev.ly + 15;
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * (W - M.l - M.r);
    setAt(Math.max(0, Math.min(n - 1, Math.round((fx / (W - M.l - M.r)) * (n - 1)))));
  };

  return (
    <div className="trend">
      <ul className="trend-legend" aria-label="Series">
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Poll average over ${n} weeks`}>
        {grid.map((g) => (
          <g key={g}>
            <line className="trend-grid" x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} />
            <text className="trend-axis" x={M.l - 8} y={y(g) + 4} textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} className="trend-axis" x={x(i)} y={H - 6} textAnchor="middle">
            {points[i]?.week}
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            className={`trend-line${s.tone === "und" ? " is-dash" : ""}`}
            style={{ stroke: toneVar(s.tone) }}
            points={points.map((p, i) => `${x(i)},${y(p.shares[s.key] ?? 0)}`).join(" ")}
          />
        ))}
        {ends.map(({ s, v, ly }) => (
          <g key={s.key}>
            <circle
              className="trend-dot"
              cx={x(n - 1)}
              cy={y(v)}
              r={4}
              style={{ fill: toneVar(s.tone) }}
            />
            <text className="trend-end" x={x(n - 1) + 10} y={ly + 4}>
              <tspan className="trend-end-v">{v}</tspan> {s.label}
            </text>
          </g>
        ))}
        {at !== null && (
          <g>
            <line className="trend-cross" x1={x(at)} x2={x(at)} y1={M.t} y2={H - M.b} />
            {series.map((s) => (
              <circle
                key={s.key}
                className="trend-dot"
                cx={x(at)}
                cy={y(points[at]?.shares[s.key] ?? 0)}
                r={4}
                style={{ fill: toneVar(s.tone) }}
              />
            ))}
          </g>
        )}
        <rect
          x={M.l}
          y={M.t}
          width={W - M.l - M.r}
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
          <b>Week of {points[at]?.week}</b>
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: toneVar(s.tone) }} />
              {s.label} <b>{points[at]?.shares[s.key] ?? 0}%</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shares side by side in one bar, with a 2px gap between parts and labels below. */
export function ShareBar({
  parts,
  label,
}: {
  parts: { key: string; label: string; value: number; tone: SeriesTone }[];
  label: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="sharebar">
      <div className="sharebar-track" role="img" aria-label={label}>
        {parts.map((p) => (
          <span
            key={p.key}
            className={p.tone === "und" ? "is-und" : undefined}
            style={{ width: `${(p.value / total) * 100}%`, background: toneVar(p.tone) }}
            title={`${p.label}: ${p.value}%`}
          />
        ))}
      </div>
      <ul className="sharebar-keys">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: toneVar(p.tone) }} />
            {p.label} <b>{p.value}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One value on a track, with the lines that matter marked (50%, 25%, the target). */
export function Meter({
  value,
  max = 100,
  marks = [],
  tone = "us",
  label,
}: {
  value: number;
  max?: number;
  marks?: { at: number; label: string }[];
  tone?: SeriesTone;
  label: string;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="meter" role="img" aria-label={label}>
      <span className="meter-fill" style={{ width: pct(value), background: toneVar(tone) }} />
      {marks.map((m) => (
        <span key={m.label} className="meter-mark" style={{ left: pct(m.at) }}>
          <small>{m.label}</small>
        </span>
      ))}
    </div>
  );
}
