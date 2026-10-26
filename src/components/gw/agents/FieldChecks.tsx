import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { atDoorLine, hoursLine, verdict } from "@/lib/field-check";
import { nf } from "@/lib/format";
import { getFieldChecks } from "@/lib/stipends.functions";

const day = (d: string) =>
  new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Africa/Nairobi",
  });

/** Each person's days on walk lists in the last two weeks: were they at the doors? */
export function FieldChecks() {
  const fetchChecks = useServerFn(getFieldChecks);
  const { data } = useQuery({ queryKey: ["field-checks"], queryFn: () => fetchChecks() });
  const [onlyHeld, setOnlyHeld] = useState(false);
  if (!data?.ready) return null;
  const days = onlyHeld ? data.days.filter((d) => d.held) : data.days;
  const held = data.days.filter((d) => d.held).length;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Were they at the doors?</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="fchip"
            aria-pressed={!onlyHeld}
            onClick={() => setOnlyHeld(false)}
          >
            All days
          </button>
          <button
            type="button"
            className="fchip"
            aria-pressed={onlyHeld}
            onClick={() => setOnlyHeld(true)}
          >
            To check · {nf.format(held)}
          </button>
        </div>
      </div>
      <p className="f-note" style={{ marginTop: 0 }}>
        Every door is checked against where its house is when it is recorded: at the door (within 50
        m, or within the phone&apos;s own accuracy), nearby (within 250 m) or far away. A day is
        held for a look when a quarter of its doors were far away or had no position, over half were
        recorded within 20 seconds of the one before, or over half reached Groundwork more than 12
        hours later. Its stipend waits until someone approves it by name. GPS can be off by a few
        metres and can be faked, so treat this as a reason to ask, not proof.
      </p>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Day</th>
              <th>Hours</th>
              <th style={{ textAlign: "right" }}>Doors</th>
              <th>At the door</th>
              <th style={{ textAlign: "right" }}>Nearby</th>
              <th style={{ textAlign: "right" }}>Far</th>
              <th style={{ textAlign: "right" }}>No position</th>
              <th style={{ textAlign: "right" }}>Too quick</th>
              <th style={{ textAlign: "right" }}>Synced late</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {days.slice(0, 80).map((d) => {
              const v = verdict(d);
              return (
                <tr key={`${d.userId}:${d.workDate}`}>
                  <td>
                    <b>{d.name}</b>
                    {d.ward ? <div className="ref">{d.ward}</div> : null}
                  </td>
                  <td className="meta">{day(d.workDate)}</td>
                  <td className="mono">{hoursLine(d)}</td>
                  <td className="num">{nf.format(d.doors)}</td>
                  <td className="meta">{atDoorLine(d)}</td>
                  <td className="num">{nf.format(d.near)}</td>
                  <td className="num">{nf.format(d.far)}</td>
                  <td className="num">{nf.format(d.noGps)}</td>
                  <td className="num">{nf.format(d.quick)}</td>
                  <td className="num">{nf.format(d.late)}</td>
                  <td>
                    <span className={`fc-verdict fc-verdict--${v.tone}`}>{v.text}</span>
                  </td>
                </tr>
              );
            })}
            {days.length === 0 && (
              <tr>
                <td colSpan={11} className="meta">
                  {onlyHeld
                    ? "Nothing to check in the last two weeks."
                    : "No doors knocked on walk lists in the last two weeks."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
