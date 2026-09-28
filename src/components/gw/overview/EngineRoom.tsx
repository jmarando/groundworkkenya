import { useMemo } from "react";

import { GroundGame } from "@/components/gw/overview/GroundGame";
import { MoneyCard } from "@/components/gw/overview/MoneyCard";
import { NeedsYou } from "@/components/gw/overview/NeedsYou";
import { OvMasthead } from "@/components/gw/overview/OvMasthead";
import { PaceChart } from "@/components/gw/overview/PaceChart";
import { PathToVictory } from "@/components/gw/overview/PathToVictory";
import { Readiness } from "@/components/gw/overview/Readiness";
import { VitalSigns } from "@/components/gw/overview/VitalSigns";
import { nairobiToday } from "@/lib/demo/insights";
import { opsAreas, pace, verdict } from "@/lib/demo/ops";
import type { Scenario, ScenarioKey } from "@/lib/demo/types";

/**
 * The campaign's own machine, top to bottom: the verdict, six vital signs,
 * the path to victory and its pace, the ground game by area, polling-day
 * readiness, money, and what is waiting on someone.
 */
export function EngineRoom({ s, onPick }: { s: Scenario; onPick: (key: ScenarioKey) => void }) {
  const today = nairobiToday();
  const areas = useMemo(() => opsAreas(s), [s]);
  const p = useMemo(() => pace(s, today), [s, today]);
  const v = useMemo(() => verdict(s, today), [s, today]);

  return (
    <div className="mb ov">
      <OvMasthead s={s} today={today} verdict={v} onPick={onPick} />
      <VitalSigns s={s} areas={areas} p={p} />
      <div className="mb-two">
        <PathToVictory s={s} p={p} />
        <PaceChart s={s} today={today} p={p} />
      </div>
      <GroundGame s={s} areas={areas} p={p} />
      <div className="mb-two">
        <Readiness areas={areas} />
        <MoneyCard s={s} p={p} />
      </div>
      <NeedsYou s={s} areas={areas} />
      <p className="mb-foot">
        A demo overview.{" "}
        {s.candidate.fictional
          ? "The candidate is fictional"
          : `${s.candidate.name} is a real candidate`}
        , rivals are placeholders, coordinators are invented, and every figure is made up, including
        the spending limit. The live overview is built from the campaign&apos;s own records.
      </p>
    </div>
  );
}
