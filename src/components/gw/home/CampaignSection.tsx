import { useMemo } from "react";

import { SectionHead } from "@/components/gw/home/SectionHead";
import { GroundGame } from "@/components/gw/overview/GroundGame";
import { LiveOverview } from "@/components/gw/overview/LiveOverview";
import { MoneyCard } from "@/components/gw/overview/MoneyCard";
import { PaceChart } from "@/components/gw/overview/PaceChart";
import { PathToVictory } from "@/components/gw/overview/PathToVictory";
import { Readiness } from "@/components/gw/overview/Readiness";
import { VitalSigns } from "@/components/gw/overview/VitalSigns";
import { opsAreas, pace } from "@/lib/demo/ops";
import type { Scenario } from "@/lib/demo/types";
import type { SectionMode } from "@/lib/home";

/** The campaign's own machine: its records when it has them, else the race's sample. */
export function CampaignSection({
  s,
  today,
  mode,
}: {
  s: Scenario;
  today: string;
  mode: SectionMode;
}) {
  const areas = useMemo(() => opsAreas(s), [s]);
  const p = useMemo(() => pace(s, today), [s, today]);
  return (
    <section className="home-sec" id="campaign" aria-labelledby="home-campaign">
      <SectionHead
        id="home-campaign"
        title="Our campaign"
        mode={mode}
        hint="Import your supporters to make this real"
        hintTo="/people"
      />
      {mode === "real" ? (
        <LiveOverview embedded />
      ) : (
        <>
          <VitalSigns s={s} areas={areas} p={p} />
          <div className="mb-two">
            <PathToVictory s={s} p={p} />
            <PaceChart s={s} today={today} p={p} />
          </div>
          <div id="ground">
            <GroundGame s={s} areas={areas} p={p} />
          </div>
          <div className="mb-two">
            <Readiness areas={areas} />
            <MoneyCard s={s} p={p} />
          </div>
        </>
      )}
    </section>
  );
}
