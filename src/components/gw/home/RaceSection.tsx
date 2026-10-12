import { LastResultCard, MovesCard } from "@/components/gw/home/AtlasCards";
import { RaceReal } from "@/components/gw/home/RaceReal";
import { SectionHead } from "@/components/gw/home/SectionHead";
import { TopOfMindCard } from "@/components/gw/home/TopOfMind";
import type { RaceView, SectionMode } from "@/lib/home";
import type { SearchRead } from "@/lib/search-interest";
import type { TopOfMind } from "@/lib/top-of-mind";

/**
 * Where the race stands: the campaign's own candidates, polls and search
 * interest when it has them on record; otherwise what's missing and who adds
 * it. The week's issues, where votes can move and the last result show either way.
 */
export function RaceSection({
  mode,
  race,
  mind,
  search,
  canEdit,
  onEdit,
  onRemovePoll,
}: {
  mode: SectionMode;
  race: RaceView;
  mind: TopOfMind;
  search: SearchRead | null;
  canEdit: boolean;
  onEdit: (what: "rivals" | "poll") => void;
  onRemovePoll: (id: string) => void;
}) {
  return (
    <section className="home-sec" id="race" aria-labelledby="home-race">
      <SectionHead id="home-race" title="The race" />
      {mode === "real" ? (
        <RaceReal
          race={race}
          mind={mind}
          search={search}
          canEdit={canEdit}
          onEdit={onEdit}
          onRemovePoll={onRemovePoll}
        />
      ) : (
        <>
          <section className="card home-empty" aria-label="The race">
            <p>No race on record yet.</p>
            {canEdit ? (
              <div className="mb-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => onEdit("rivals")}
                >
                  Add the candidates
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onEdit("poll")}
                >
                  Add a poll
                </button>
              </div>
            ) : (
              <p className="meta">
                The candidate or campaign manager adds the candidates and published polls.
              </p>
            )}
          </section>
          <TopOfMindCard mind={mind} />
          <MovesCard />
          <LastResultCard />
        </>
      )}
    </section>
  );
}
