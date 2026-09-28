import type { ReactNode } from "react";

import { Meter } from "@/components/gw/demo/charts";
import { compact, nf, pct } from "@/components/gw/overview/format";
import { ours } from "@/lib/demo";
import { countAtLeast, weightedShares } from "@/lib/demo/insights";
import { areaOnPace, readiness, runway, type OpsArea, type Pace } from "@/lib/demo/ops";
import type { Scenario } from "@/lib/demo/types";

function Tile({
  label,
  value,
  share,
  flag = false,
  bar,
  children,
}: {
  label: string;
  value: ReactNode;
  /** 0-1, drawn as the bar under the number. */
  share?: number;
  /** Behind where it should be: the bar turns to the warning colour. */
  flag?: boolean;
  /** A custom bar in place of the plain one. */
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card kpi">
      <span className="kpi-lbl">{label}</span>
      <span className="kpi-val stat">{value}</span>
      <div className="kpi-foot">
        {bar ??
          (share !== undefined && (
            <div
              className={`minibar${flag ? " minibar--flag" : ""}`}
              role="img"
              aria-label={`${Math.round(share * 100)} percent`}
            >
              <i style={{ width: `${Math.min(share, 1) * 100}%` }} />
            </div>
          ))}
        <span className="kpi-sub">{children}</span>
      </div>
    </div>
  );
}

/** Six numbers, each against what it should be by now. */
export function VitalSigns({ s, areas, p }: { s: Scenario; areas: OpsArea[]; p: Pace }) {
  const { ops } = s;
  const ready = readiness(areas);
  const weeks = runway(ops.money);
  const onPace = areas.filter((a) => areaOnPace(a, p.weeksLeft)).length;
  const unit = s.geo.units[0]!.toUpperCase() + s.geo.units.slice(1);

  const agents = (
    <Tile
      label="Polling-day agents"
      value={pct(ready.recruited, ready.streams)}
      share={ready.recruited / ready.streams}
      flag={ready.trained / ready.streams < 0.5}
    >
      recruited · {nf.format(ready.trained)} of {nf.format(ready.streams)} streams trained
    </Tile>
  );
  const money = (
    <Tile
      label="Money"
      value={`${Math.round(weeks)} wks`}
      share={Math.min(weeks / Math.max(p.weeksLeft, 1), 1)}
      flag={weeks < p.weeksLeft}
    >
      of cash at this burn · {Math.round(p.weeksLeft)} weeks to go
    </Tile>
  );
  const contacts = (
    <Tile
      label="Contact list"
      value={compact(ops.contacts.optedIn)}
      share={ops.contacts.optedIn / Math.max(p.found, 1)}
    >
      opted in · +{nf.format(ops.contacts.newLastWeek)} this week,{" "}
      {nf.format(ops.contacts.optedOutLastWeek)} said STOP
    </Tile>
  );
  const list = (
    <Tile
      label={s.office === "president" ? "Supporter list" : "Supporters found"}
      value={pct(p.found, p.target)}
      share={p.found / p.target}
      flag={!p.onPace}
    >
      {compact(p.found)} of {compact(p.target)}
      {s.office === "president" ? " target" : " win number"}
    </Tile>
  );

  if (s.office === "president") {
    const us = ours(s).key;
    const share =
      weightedShares(
        s.areas,
        s.contenders.map((c) => c.key),
      )[us] ?? 0;
    const counties = countAtLeast(s.areas, us, 25);
    return (
      <section className="ov-vitals" aria-label="Vital signs">
        <Tile
          label="National share"
          value={`${share.toFixed(1)}%`}
          bar={
            <Meter
              value={share}
              marks={[{ at: 50, label: "50%+1" }]}
              label={`${share.toFixed(1)} percent modelled, 50 percent plus one needed`}
            />
          }
        >
          modelled · {share >= 50 ? "over" : `${(50 - share).toFixed(1)} points under`} 50%+1
        </Tile>
        <Tile
          label="Counties at 25%+"
          value={
            <>
              {counties}
              <span className="dim">/47</span>
            </>
          }
          share={counties / 47}
          flag={counties < 24}
        >
          24 needed · {counties >= 24 ? `${counties - 24} to spare` : `${24 - counties} short`}
        </Tile>
        {list}
        {agents}
        {money}
        {contacts}
      </section>
    );
  }

  return (
    <section className="ov-vitals" aria-label="Vital signs">
      {list}
      <Tile
        label={`${unit} on pace`}
        value={
          <>
            {onPace}
            <span className="dim">/{areas.length}</span>
          </>
        }
        share={onPace / areas.length}
        flag={onPace < areas.length / 2}
      >
        {areas.length - onPace} behind their own targets
      </Tile>
      <Tile
        label="Doors this week"
        value={compact(ops.doors.lastWeek)}
        share={ops.doors.lastWeek / ops.doors.plan}
        flag={ops.doors.lastWeek < ops.doors.plan * 0.85}
      >
        of {compact(ops.doors.plan)} planned · {nf.format(ops.volunteers.active)} volunteers out
      </Tile>
      {agents}
      {money}
      {contacts}
    </section>
  );
}
