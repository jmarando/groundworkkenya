import { OpponentWatch, Voters } from "@/components/gw/briefing/People";
import { LastTime, Polls } from "@/components/gw/briefing/Polls";
import { Race } from "@/components/gw/briefing/Race";
import { RaceReal } from "@/components/gw/home/RaceReal";
import { SectionHead } from "@/components/gw/home/SectionHead";
import type { Scenario } from "@/lib/demo/types";
import type { RaceView, SectionMode } from "@/lib/home";

/**
 * Where the race stands: the campaign's own rivals and published polls when it
 * has any on record, otherwise the sample for a race like it.
 */
export function RaceSection({
  s,
  mode,
  race,
  canEdit,
  onEdit,
  onRemovePoll,
}: {
  s: Scenario;
  mode: SectionMode;
  race: RaceView;
  canEdit: boolean;
  onEdit: (what: "rivals" | "poll") => void;
  onRemovePoll: (id: string) => void;
}) {
  return (
    <section className="home-sec" id="race" aria-labelledby="home-race">
      <SectionHead
        id="home-race"
        title="The race"
        mode={mode}
        hint={
          canEdit ? "Add your rivals and polls" : "The candidate or manager can add the real race."
        }
        {...(canEdit ? { onHint: () => onEdit("rivals") } : {})}
      />
      {mode === "real" ? (
        <RaceReal s={s} race={race} canEdit={canEdit} onEdit={onEdit} onRemovePoll={onRemovePoll} />
      ) : (
        <>
          <Race s={s} />
          <div className="mb-two">
            <OpponentWatch s={s} />
            <Voters s={s} />
          </div>
          <div className="mb-two">
            <Polls s={s} />
            <LastTime s={s} />
          </div>
        </>
      )}
    </section>
  );
}
