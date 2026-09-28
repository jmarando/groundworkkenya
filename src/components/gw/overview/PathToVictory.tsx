import { Meter } from "@/components/gw/demo/charts";
import { compact, nf, pct } from "@/components/gw/overview/format";
import { ours } from "@/lib/demo";
import { countAtLeast, expectedVotes, weightedShares } from "@/lib/demo/insights";
import { roundNice, type Pace } from "@/lib/demo/ops";
import type { Scenario } from "@/lib/demo/types";

type Row = { label: string; value: number; note: string; gap?: true };

/** From everyone registered down to the supporters still to find. */
export function PathToVictory({ s, p }: { s: Scenario; p: Pace }) {
  const registered = s.areas.reduce((a, x) => a + x.registered, 0);
  const expected = s.areas.reduce((a, x) => a + expectedVotes(x), 0);
  const sure = Math.round(p.found * s.ops.sureShare);
  const toFind = Math.max(0, p.target - p.found);
  const president = s.office === "president";

  const rows: Row[] = [
    { label: "Registered voters", value: registered, note: "on the register" },
    {
      label: "Expected to vote",
      value: Math.round(expected),
      note: `${pct(expected, registered)} turnout`,
    },
    {
      label: president ? "Supporter target" : "Win number",
      value: p.target,
      note: president ? "50%+1 of the votes expected" : "votes that win the seat",
    },
    { label: "Found so far", value: p.found, note: `${pct(p.found, p.target)} of the target` },
    {
      label: "Sure to vote for us",
      value: sure,
      note: `rated 4 or 5 at the door`,
    },
    { label: "Still to find", value: toFind, note: `${pct(toFind, p.target)} to go`, gap: true },
  ];

  return (
    <section className="card" aria-labelledby="ov-path-h">
      <div className="card-head">
        <h2 id="ov-path-h">Path to victory</h2>
        <span className="mono">{president ? "two tests, then the list" : "the win number"}</span>
      </div>
      {president && <PresidentTests s={s} />}
      <ol className="ov-funnel">
        {rows.map((r) => (
          <li key={r.label} className={r.gap ? "is-gap" : undefined}>
            <span>{r.label}</span>
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${Math.max((r.value / registered) * 100, 0.8)}%` }} />
            </span>
            <span className="ov-funnel-n">
              <b className="stat">{compact(r.value)}</b>
              <small>{r.note}</small>
            </span>
          </li>
        ))}
      </ol>
      <p className={`ov-pace-line ${p.onPace ? "mb-ok" : "mb-short"}`}>
        Finding {nf.format(roundNice(p.recentRate))} a week; {nf.format(Math.ceil(p.needed))} a week
        reaches the target on polling day.
      </p>
    </section>
  );
}

/** The constitution's two tests for a presidential win, as the model stands. */
function PresidentTests({ s }: { s: Scenario }) {
  const us = ours(s).key;
  const share =
    weightedShares(
      s.areas,
      s.contenders.map((c) => c.key),
    )[us] ?? 0;
  const counties = countAtLeast(s.areas, us, 25);
  const ranked = [...s.areas].sort((a, b) => (b.shares[us] ?? 0) - (a.shares[us] ?? 0));
  return (
    <div className="ov-tests">
      <div className="mb-rule">
        <div className="mb-rule-h">
          <span>More than half of all valid votes</span>
          <span className={share > 50 ? "mb-ok" : "mb-short"}>
            {share > 50 ? "Met" : `${(50 - share).toFixed(1)} points short`}
          </span>
        </div>
        <Meter
          value={share}
          marks={[{ at: 50, label: "50%+1" }]}
          label={`${share.toFixed(1)} percent modelled nationally`}
        />
      </div>
      <div className="mb-rule">
        <div className="mb-rule-h">
          <span>At least 25% in 24 of 47 counties</span>
          <span className={counties >= 24 ? "mb-ok" : "mb-short"}>
            {counties} counties{counties >= 24 ? ", met" : ""}
          </span>
        </div>
        <div
          className="mb-strip"
          role="img"
          aria-label={`${counties} of 47 counties at 25 percent or more`}
        >
          {ranked.map((a, i) => (
            <span
              key={a.slug}
              title={`${a.name}: ${a.shares[us] ?? 0}%`}
              className={i === 23 ? "is-24" : undefined}
              style={{
                background: (a.shares[us] ?? 0) >= 25 ? "var(--series-us)" : "var(--map-below)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
