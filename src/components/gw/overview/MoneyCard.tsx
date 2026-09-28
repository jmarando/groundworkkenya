import { ActionButton } from "@/components/gw/briefing/parts";
import { Meter } from "@/components/gw/demo/charts";
import { kes, pct } from "@/components/gw/overview/format";
import { runway, type Pace } from "@/lib/demo/ops";
import type { Scenario } from "@/lib/demo/types";

/** Whether the money lasts to polling day, and where it goes. */
export function MoneyCard({ s, p }: { s: Scenario; p: Pace }) {
  const m = s.ops.money;
  const weeks = runway(m);
  const short = weeks < p.weeksLeft;
  // Cash needed on top of what is in the bank to keep this burn to polling day.
  const gap = Math.max(0, (p.weeksLeft - weeks) * m.burnPerWeek);
  const biggest = Math.max(...m.categories.map((c) => c.kes));

  return (
    <section className="card" aria-labelledby="ov-money-h">
      <div className="card-head">
        <h2 id="ov-money-h">Money</h2>
        <span className="mono">{kes(m.burnPerWeek)} a week</span>
      </div>
      <dl className="ov-figs">
        <div>
          <dt>Raised</dt>
          <dd className="stat">{kes(m.raised)}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd className="stat">{kes(m.spent)}</dd>
        </div>
        <div>
          <dt>Cash</dt>
          <dd className="stat">{kes(m.cash)}</dd>
        </div>
        <div>
          <dt>Pledged</dt>
          <dd className="stat">{kes(m.pledged)}</dd>
        </div>
      </dl>
      <div className="mb-rule">
        <div className="mb-rule-h">
          <span>Spent against the limit</span>
          <span className="meta">
            {pct(m.spent, m.limit)} of {kes(m.limit)}
          </span>
        </div>
        <Meter
          value={m.spent}
          max={m.limit}
          label={`${pct(m.spent, m.limit)} of the spending limit used`}
        />
      </div>
      <p className={`ov-pace-line ${short ? "mb-short" : "mb-ok"}`}>
        {short
          ? `The cash lasts ${Math.round(weeks)} weeks at this burn and polling day is ${Math.round(p.weeksLeft)} away: raise ${kes(gap)} more, or spend less.`
          : `The cash lasts ${Math.round(weeks)} weeks at this burn, past polling day.`}
      </p>
      <ul className="ov-cats">
        {m.categories.map((c) => (
          <li key={c.label}>
            <span>{c.label}</span>
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${(c.kes / biggest) * 100}%` }} />
            </span>
            <span className="stat">{kes(c.kes)}</span>
          </li>
        ))}
      </ul>
      <p className="f-note">The spending limit here is a demo figure, not the official one.</p>
      <div className="mb-actions">
        <ActionButton quiet action={{ kind: "go", label: "Open finance", to: "/finance" }} />
      </div>
    </section>
  );
}
