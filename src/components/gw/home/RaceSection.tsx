import { OpponentWatch, Voters } from "@/components/gw/briefing/People";
import { LastTime, Polls } from "@/components/gw/briefing/Polls";
import { Race } from "@/components/gw/briefing/Race";
import { SectionHead } from "@/components/gw/home/SectionHead";
import type { Scenario } from "@/lib/demo/types";
import type { SectionMode } from "@/lib/home";

/** Where the race stands: the map and standings, rivals, voters, polls, last time. */
export function RaceSection({ s, mode }: { s: Scenario; mode: SectionMode }) {
  return (
    <section className="home-sec" id="race" aria-labelledby="home-race">
      <SectionHead
        id="home-race"
        title="The race"
        mode={mode}
        hint="Your real rivals and polls come next."
      />
      <Race s={s} />
      <div className="mb-two">
        <OpponentWatch s={s} />
        <Voters s={s} />
      </div>
      <div className="mb-two">
        <Polls s={s} />
        <LastTime s={s} />
      </div>
    </section>
  );
}
