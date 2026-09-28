import { ActionButton } from "@/components/gw/briefing/parts";
import { nf } from "@/components/gw/overview/format";
import { readiness, type OpsArea } from "@/lib/demo/ops";
import type { Action, Scenario } from "@/lib/demo/types";

type Need = { label: string; detail: string; action: Action };

/** What is waiting on someone with authority, one tap from where it is handled. */
export function NeedsYou({ s, areas }: { s: Scenario; areas: OpsArea[] }) {
  const r = readiness(areas);
  const untrained = [...areas]
    .sort((a, b) => b.streams - b.trained - (a.streams - a.trained))
    .slice(0, 2)
    .map((a) => a.name);
  const needs: Need[] = [
    {
      label: `${nf.format(r.streams - r.trained)} streams without a trained agent`,
      detail: `Most are in ${untrained.join(" and ")}`,
      action: { kind: "go", label: "Assign agents", to: "/agents" },
    },
    ...s.ops.needs,
  ];
  return (
    <section className="card" aria-labelledby="ov-needs-h">
      <div className="card-head">
        <h2 id="ov-needs-h">Needs you</h2>
        <span className="mono">{needs.length} waiting</span>
      </div>
      <ul className="ov-needs">
        {needs.map((n) => (
          <li key={n.label}>
            <div>
              <b>{n.label}</b>
              <small className="meta">{n.detail}</small>
            </div>
            <ActionButton action={n.action} quiet />
          </li>
        ))}
      </ul>
    </section>
  );
}
