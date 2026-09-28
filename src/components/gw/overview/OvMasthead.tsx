import { DemoBadge, ScenarioSwitch } from "@/components/gw/demo/ScenarioSwitch";
import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import type { Verdict } from "@/lib/demo/ops";
import type { Scenario, ScenarioKey } from "@/lib/demo/types";

/** Which campaign, the days left, and the verdict the manager reads first. */
export function OvMasthead({
  s,
  today,
  verdict,
  onPick,
}: {
  s: Scenario;
  today: string;
  verdict: Verdict;
  onPick: (key: ScenarioKey) => void;
}) {
  const days = daysBetween(today, ELECTION_DAY);
  return (
    <header className="mb-mast">
      <div className="mb-mast-bar">
        <DemoBadge fictional={s.candidate.fictional} />
        <ScenarioSwitch value={s.key} onChange={onPick} />
      </div>
      <div className="mb-mast-main">
        <div>
          <span className="eyebrow">
            Command centre · {s.candidate.name} for {s.officeLabel}, {s.seat}
          </span>
          <h1 className="mb-hello ov-hello">{verdict.headline}</h1>
          <p className="ov-verdict">{verdict.detail}</p>
        </div>
        <div className="ov-count" suppressHydrationWarning>
          <b className="stat">{days}</b>
          <span>days to polling day</span>
        </div>
      </div>
    </header>
  );
}
