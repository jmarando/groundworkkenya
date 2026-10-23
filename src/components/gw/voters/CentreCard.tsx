// A polling centre on the Voters map: its register, where its position came from, an agent's
// suggestion waiting for an organiser, and the houses in the area nearest it: how many, how
// many were knocked in 30 days, and the supporters among those scored. Organisers and managers
// can place it, or move it, and plan a walk list from it.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { placementNote, suggestionNote, type Centre, type CentreDoors } from "@/lib/centres";
import { takeCentreSuggestion } from "@/lib/centres.functions";
import { share } from "@/lib/voters-view";
import { nf } from "@/lib/format";

export function CentreCard({
  centre,
  wardName,
  placedInWard,
  waitingInWard,
  numbers,
  canPlace,
  onPlace,
  onPlan,
  onClose,
}: {
  centre: Centre;
  wardName: string | null;
  /** The ward's centres on the map, and those not on it yet. */
  placedInWard: number;
  waitingInWard: number;
  /**
   * The figures for its area, null when it has no area worked out (not on the map, or not in the
   * ward on show). `doors`: knocked in 30 days; undefined while they are read, null when they
   * can't be. `houses`: in the area; undefined while they are counted, null when they aren't.
   */
  numbers: { doors: CentreDoors | null | undefined; houses: number | null | undefined } | null;
  canPlace: boolean;
  onPlace: () => void;
  /** Starts a walk list from this centre; left out when the person can't plan one or it has no area. */
  onPlan?: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const take = useServerFn(takeCentreSuggestion);
  const adopt = useMutation({
    mutationFn: () => take({ data: { id: centre.id } }),
    onSuccess: async () => {
      toast.success(`${centre.name} is on the map.`);
      await queryClient.invalidateQueries({ queryKey: ["centres"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const { placed, suggestion } = centre;
  const { doors, houses } = numbers ?? { doors: undefined, houses: undefined };
  const knocked = doors && houses ? Math.min(doors.knocked, houses) : (doors?.knocked ?? 0);

  return (
    <section className="vhouse" aria-label={`Polling centre ${centre.name}`}>
      <div className="card-head">
        <div>
          <span className="eyebrow">Polling centre · {centre.code}</span>
          <h2>{centre.name}</h2>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="meta">
        {wardName ? `${wardName} ward · ` : ""}
        {nf.format(centre.streams)} {centre.streams === 1 ? "stream" : "streams"} ·{" "}
        {nf.format(centre.voters)} registered {centre.voters === 1 ? "voter" : "voters"}
      </p>

      {placed ? (
        <p className={placed.by === "osm-close" ? "vhouse-note" : "meta"}>
          {placementNote(placed)}
        </p>
      ) : (
        <p className="vhouse-note">
          This centre isn't on the map yet.{" "}
          {canPlace
            ? "Place it where it stands."
            : "An organiser can place it, or an agent standing there can confirm it."}
        </p>
      )}

      {suggestion && canPlace ? (
        <div className="vhouse-note">
          {suggestionNote(suggestion, placed?.at ?? null)}
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={adopt.isPending}
              onClick={() => adopt.mutate()}
            >
              Use this position
            </button>
          </div>
        </div>
      ) : null}

      {placed && numbers ? (
        <>
          <h3>Its area · the part of the ward nearest this centre</h3>
          <div className="f-rows">
            <div className="f-row">
              <span>Houses on the map</span>
              <b>
                {houses === undefined
                  ? "Counting…"
                  : houses === null
                    ? "Too big to count here"
                    : nf.format(houses)}
              </b>
            </div>
            <div className="f-row">
              <span>Houses knocked · 30 days</span>
              <b>
                {doors === undefined
                  ? "Reading…"
                  : doors === null
                    ? "Not in yet"
                    : houses
                      ? `${nf.format(knocked)} of ${nf.format(houses)} · ${share(knocked / houses)}`
                      : nf.format(knocked)}
              </b>
            </div>
            <div className="f-row">
              <span>Supporters among doors scored</span>
              <b>
                {doors === undefined || doors === null
                  ? "—"
                  : doors.rated
                    ? `${nf.format(doors.supporters)} of ${nf.format(doors.rated)}`
                    : "none scored yet"}
              </b>
            </div>
          </div>
          {waitingInWard > 0 ? (
            <p className="f-note">
              {waitingInWard} of this ward's {placedInWard + waitingInWard} centres{" "}
              {waitingInWard === 1 ? "isn't" : "aren't"} on the map yet, so this area is bigger than
              it will be once {waitingInWard === 1 ? "it is" : "they are"} placed.
            </p>
          ) : null}
        </>
      ) : null}

      {canPlace || onPlan ? (
        <div className="vhouse-actions">
          {onPlan ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={onPlan}>
              Plan a walk list here
            </button>
          ) : null}
          {canPlace ? (
            <button
              type="button"
              className={onPlan ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
              onClick={onPlace}
            >
              {placed ? "Move it" : "Place it"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
