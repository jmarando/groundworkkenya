import { useMemo } from "react";

import { Delta } from "@/components/gw/briefing/parts";
import { Meter, TrendChart, type Series } from "@/components/gw/demo/charts";
import { ChoroplethMap } from "@/components/gw/demo/ChoroplethMap";
import { ours } from "@/lib/demo";
import { areaMargin, countAtLeast, weightedShares } from "@/lib/demo/insights";
import type { AreaModel, Scenario } from "@/lib/demo/types";

const nf = new Intl.NumberFormat("en-KE");
const pct1 = (n: number) => `${n.toFixed(1)}%`;

/** Our share, in the bands that matter for a presidential race. */
const SHARE_BANDS = [
  { min: 50, fill: "var(--map-o3)", label: "50% or more" },
  { min: 35, fill: "var(--map-o2)", label: "35–50%" },
  { min: 25, fill: "var(--map-o1)", label: "25–35%" },
  { min: -1, fill: "var(--map-below)", label: "Under 25%" },
];

/** Our lead or deficit, for plurality races. */
const MARGIN_BANDS = [
  { min: 10, fill: "var(--map-us2)", label: "Ahead by 10+" },
  { min: 3, fill: "var(--map-us1)", label: "Ahead by 3–10" },
  { min: -3, fill: "var(--map-mid)", label: "Within 3" },
  { min: -10, fill: "var(--map-a1)", label: "Behind by 3–10" },
  { min: -Infinity, fill: "var(--map-a2)", label: "Behind by 10+" },
];

const bandOf = <T extends { min: number }>(bands: T[], v: number): T =>
  bands.find((b) => v >= b.min) ?? bands[bands.length - 1]!;

export function Race({ s }: { s: Scenario }) {
  const us = ours(s);
  const rival = s.contenders[1]!;
  const series: Series[] = [
    ...s.contenders.map((c) => ({ key: c.key, label: c.short, tone: c.tone })),
    { key: "undecided", label: "Undecided", tone: "und" as const },
  ];
  const first = s.polls.average[0]?.shares ?? {};
  const last = s.polls.average.at(-1)?.shares ?? {};
  const decided = useMemo(
    () =>
      weightedShares(
        s.areas,
        s.contenders.map((c) => c.key),
      ),
    [s],
  );
  const byArea = useMemo(() => new Map(s.areas.map((a) => [a.slug, a])), [s]);
  const president = s.office === "president";

  const fill = (slug: string) => {
    const a = byArea.get(slug);
    if (!a) return "var(--map-none)";
    return president
      ? bandOf(SHARE_BANDS, a.shares[us.key] ?? 0).fill
      : bandOf(MARGIN_BANDS, areaMargin(a, us.key).margin).fill;
  };

  const tip = (slug: string, name: string) => {
    const a = byArea.get(slug);
    if (!a) return <b>{name}</b>;
    return (
      <>
        <b>{name}</b>
        {a.group !== name && <small>{a.group}</small>}
        {s.contenders.map((c) => (
          <span key={c.key}>
            {c.short} <b>{a.shares[c.key] ?? 0}%</b>
          </span>
        ))}
        <small>
          {nf.format(a.registered)} registered · {Math.round(a.turnout2022 * 100)}% turnout in 2022
        </small>
      </>
    );
  };

  const close = [...s.areas]
    .map((a) => ({ a, m: areaMargin(a, us.key).margin }))
    .sort((x, y) => Math.abs(x.m) - Math.abs(y.m))
    .slice(0, 5);

  return (
    <section className="card mb-race" aria-labelledby="mb-race-h">
      <div className="card-head">
        <div>
          <h2 id="mb-race-h">The race</h2>
          <p className="meta">
            {president
              ? "To win outright: more than half of all votes, and at least 25% in 24 of the 47 counties."
              : "Most votes wins. There is no run-off, so the lead is what counts."}
          </p>
        </div>
      </div>

      <div className="mb-race-grid">
        <div className="mb-race-trend">
          <p className="mb-race-now">
            Our poll average: <b>{last[us.key]}%</b>{" "}
            <Delta value={(last[us.key] ?? 0) - (first[us.key] ?? 0)} unit=" since July" />
            <span className="dim">
              {" "}
              · {rival.short} {last[rival.key]}% · undecided {last["undecided"]}%
            </span>
          </p>
          <TrendChart points={s.polls.average} series={series} />
        </div>

        <div className="mb-race-rule">
          {president ? (
            <PresidentRule s={s} decidedUs={decided[us.key] ?? 0} />
          ) : (
            <PluralityRule s={s} lead={(decided[us.key] ?? 0) - (decided[rival.key] ?? 0)} />
          )}
        </div>
      </div>

      <div className="mb-race-map">
        <div className="mb-map-wrap">
          <ChoroplethMap
            file={s.geo.file}
            label={
              president
                ? `${s.candidate.name}'s modelled share by county`
                : `Where ${s.candidate.name} leads and trails, by ${s.geo.unit}`
            }
            fill={fill}
            tip={tip}
          />
          <ul className="mb-map-key">
            {(president ? SHARE_BANDS : MARGIN_BANDS).map((b) => (
              <li key={b.label}>
                <i style={{ background: b.fill }} />
                {b.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="mb-close">
          <h3>
            {president ? "Closest counties" : `Closest ${s.geo.units}`}{" "}
            <span className="dim">decide it</span>
          </h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>{s.geo.unit[0]!.toUpperCase() + s.geo.unit.slice(1)}</th>
                <th style={{ textAlign: "right" }}>{us.short}</th>
                <th style={{ textAlign: "right" }}>{rival.short}</th>
                <th style={{ textAlign: "right" }}>Voters</th>
              </tr>
            </thead>
            <tbody>
              {close.map(({ a }) => (
                <tr key={a.slug}>
                  <td>
                    <b>{a.name}</b>
                    {a.group !== a.name && s.office !== "mp" && (
                      <small className="dim"> {a.group}</small>
                    )}
                  </td>
                  <td className="num">{a.shares[us.key]}%</td>
                  <td className="num">{a.shares[rival.key]}%</td>
                  <td className="num">{nf.format(a.registered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mb-source">
        Modelled from our polling and canvass returns; shares are among decided voters. Demo data.
      </p>
    </section>
  );
}

function PresidentRule({ s, decidedUs }: { s: Scenario; decidedUs: number }) {
  const us = ours(s);
  const at25 = countAtLeast(s.areas, us.key, 25);
  const strip: AreaModel[] = [...s.areas].sort(
    (a, b) => (b.shares[us.key] ?? 0) - (a.shares[us.key] ?? 0),
  );
  const nearLine = s.areas.filter((a) => {
    const v = a.shares[us.key] ?? 0;
    return v >= 18 && v < 32;
  });
  return (
    <>
      <div className="mb-rule">
        <p className="mb-rule-h">
          More than half the votes{" "}
          <span className={decidedUs > 50 ? "mb-ok" : "mb-short"}>
            {decidedUs > 50 ? "✓ on track" : `✕ ${(50 - decidedUs).toFixed(1)} points short`}
          </span>
        </p>
        <Meter
          value={decidedUs}
          marks={[{ at: 50, label: "50%" }]}
          label={`${pct1(decidedUs)} among decided voters; 50% needed`}
        />
        <p className="mb-rule-n">
          <b>{pct1(decidedUs)}</b> among decided voters
        </p>
      </div>
      <div className="mb-rule">
        <p className="mb-rule-h">
          25% in 24 counties{" "}
          <span className={at25 >= 24 ? "mb-ok" : "mb-short"}>
            {at25 >= 24 ? `✓ ${at25} of 47` : `✕ ${at25} of 47`}
          </span>
        </p>
        <div
          className="mb-strip"
          role="img"
          aria-label={`At 25% or more in ${at25} of 47 counties; 24 needed`}
        >
          {strip.map((a, i) => (
            <span
              key={a.slug}
              className={i === 23 ? "is-24" : undefined}
              title={`${a.name}: ${a.shares[us.key]}%`}
              style={{ background: bandOf(SHARE_BANDS, a.shares[us.key] ?? 0).fill }}
            />
          ))}
        </div>
        <p className="mb-rule-n">
          Counties sorted by your share; the mark is the 24th. Near the line:{" "}
          {nearLine.map((a) => `${a.name} ${a.shares[us.key]}%`).join(", ") || "none"}.
        </p>
      </div>
    </>
  );
}

function PluralityRule({ s, lead }: { s: Scenario; lead: number }) {
  const rival = s.contenders[1]!;
  const win = s.winNumber;
  return (
    <>
      <div className="mb-rule">
        <p className="mb-rule-h">
          Lead over {rival.short}{" "}
          <span className={lead > 0 ? "mb-ok" : "mb-short"}>
            {lead > 0 ? "✓ ahead" : "✕ behind"}
          </span>
        </p>
        <p className="mb-rule-big">
          {lead > 0 ? "+" : ""}
          {lead.toFixed(1)} <small>points among decided voters</small>
        </p>
      </div>
      {win && (
        <div className="mb-rule">
          <p className="mb-rule-h">Supporters found, against the win number</p>
          <Meter
            value={win.found}
            max={win.target}
            label={`${nf.format(win.found)} of ${nf.format(win.target)} supporters found`}
          />
          <p className="mb-rule-n">
            <b>{nf.format(win.found)}</b> of {nf.format(win.target)} ·{" "}
            {Math.round((win.found / win.target) * 100)}% · {nf.format(win.target - win.found)} to
            find
          </p>
        </div>
      )}
    </>
  );
}
