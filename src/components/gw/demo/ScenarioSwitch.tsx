import { useAccess } from "@/hooks/useAccess";
import { forCampaign, SCENARIOS } from "@/lib/demo";
import type { ScenarioKey } from "@/lib/demo/types";

/** Pick which demo campaign the screen shows: one per office. */
export function ScenarioSwitch({
  value,
  onChange,
}: {
  value: ScenarioKey;
  onChange: (key: ScenarioKey) => void;
}) {
  // The workspace's own race shows its own candidate.
  const { campaign } = useAccess();
  return (
    <div className="cswitch" role="group" aria-label="Demo campaign">
      {SCENARIOS.map((sc) => forCampaign(sc, campaign)).map((s) => (
        <button
          key={s.key}
          type="button"
          className="cswitch-opt"
          aria-pressed={value === s.key}
          onClick={() => onChange(s.key)}
        >
          <span className="cswitch-av" aria-hidden="true">
            {s.candidate.initials}
          </span>
          <span className="cswitch-txt">
            <b>{s.officeLabel === "Member of Parliament" ? "MP" : s.officeLabel}</b>
            <small>{s.candidate.name}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Always on screen while demo figures are showing. */
export function DemoBadge({ fictional }: { fictional?: boolean }) {
  return (
    <span className="demo-badge">
      <span aria-hidden="true">◆</span> Demo data{fictional ? " · fictional candidate" : ""}
    </span>
  );
}
