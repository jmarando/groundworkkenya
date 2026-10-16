// Planning a walk list in the Voters panel: the houses are chosen on the map (a suggested patch
// from the centre or a tapped point, or a shape drawn around houses), numbered in walking order,
// named, given to someone and sent. The planner's state is held above (useWalkListPlan) because
// the map takes the taps; this is its card.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { TeamPicker } from "@/components/gw/voters/TeamPicker";
import type { WalkListPlan } from "@/hooks/useWalkListPlan";
import type { Centre } from "@/lib/centres";
import { toDoors } from "@/lib/walk-list-plan";
import { DRAW_CAP, defaultName, leftOffText, skipText } from "@/lib/walk-lists";
import { getListTeam, makeWalkList } from "@/lib/walk-lists.functions";

const nf = new Intl.NumberFormat("en-KE");
const housesText = (n: number) => `${nf.format(n)} ${n === 1 ? "house" : "houses"}`;

export function PlanWalkList({
  plan,
  centre,
  wardId,
  wardName,
  made,
  onCancel,
  onSent,
}: {
  plan: WalkListPlan;
  /** The centre the list is planned from; none for the ward. */
  centre: Centre | null;
  wardId: string;
  wardName: string;
  /** How many open lists there already are from this centre (or ward): the default name's number. */
  made: number;
  onCancel: () => void;
  /** The list was made: its id, to open it. */
  onSent: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(getListTeam);
  const make = useServerFn(makeWalkList);
  const { data: team } = useQuery({
    queryKey: ["walk-list-team"],
    queryFn: () => fetchTeam(),
    staleTime: 30_000,
  });
  const [name, setName] = useState(() => defaultName(centre?.name ?? null, wardName, made));
  const [giveTo, setGiveTo] = useState("");
  const { state, draft, status, dispatch } = plan;
  const count = draft.doors.length;

  const send = useMutation({
    mutationFn: () =>
      make({
        data: {
          name: name.trim(),
          centreId: centre?.id ?? null,
          wardId,
          doors: toDoors(draft.doors),
          giveTo: giveTo || null,
        },
      }),
    onSuccess: async (r) => {
      const who = team?.find((m) => m.userId === giveTo)?.name;
      toast.success(who ? `Walk list sent to ${who}.` : "Walk list saved as a draft.");
      if (r.leftOff > 0) toast.message(leftOffText(r.leftOff));
      await Promise.all(
        ["walk-lists", "walk-list-planning", "walk-list-team"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onSent(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = state.mode === "patch";
  const guide =
    status === "reading"
      ? "Reading the houses…"
      : status === "too-big"
        ? "This area is too big to plan from here. Open one of its polling centres and plan from there."
        : status === "missing"
          ? "Walk lists aren't in yet: they appear once the database update is applied."
          : patch
            ? state.start
              ? `${housesText(count)}, nearest first, numbered in walking order. Tap a house on the map to take it off or put it back.`
              : "Tap the map where the list should start."
            : !state.closed
              ? state.drawn.length
                ? `${nf.format(state.drawn.length)} ${state.drawn.length === 1 ? "corner" : "corners"} so far. Keep tapping round the houses, then press Done.`
                : "Tap the map to put down the corners of an area round the houses."
              : draft.tooMany
                ? `That's more than ${DRAW_CAP} houses: draw a smaller area.`
                : `${housesText(count)} inside, numbered in walking order. Tap a house on the map to take it off or put it back.`;
  const left = patch ? skipText(draft.skipped) : leftOffText(draft.leftOff);

  return (
    <section className="vhouse pw" aria-label="Plan a walk list">
      <div className="card-head">
        <div>
          <span className="eyebrow">Plan a walk list</span>
          <h2>{centre ? centre.name : `${wardName} ward`}</h2>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="seg pw-modes" role="group" aria-label="How to choose the houses">
        <button
          type="button"
          aria-pressed={patch}
          onClick={() => dispatch({ type: "mode", mode: "patch" })}
        >
          Suggested patch
        </button>
        <button
          type="button"
          aria-pressed={!patch}
          onClick={() => dispatch({ type: "mode", mode: "draw" })}
        >
          Draw around houses
        </button>
      </div>

      <p className="meta" role="status">
        {guide}
      </p>
      {status === "ready" && left ? <p className="f-note pw-left">{left}</p> : null}

      {status === "ready" && patch && state.start ? (
        <div className="vhouse-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => dispatch({ type: "start", at: null })}
          >
            Start somewhere else
          </button>
        </div>
      ) : null}
      {status === "ready" && !patch ? (
        <div className="vhouse-actions">
          {!state.closed ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={state.drawn.length < 3}
              onClick={() => dispatch({ type: "done" })}
            >
              Done
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!state.drawn.length}
            onClick={() => dispatch({ type: "again" })}
          >
            Start again
          </button>
        </div>
      ) : null}

      {count > 0 ? (
        <form
          className="pw-send"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <label className="pb-field">
            <span>Name</span>
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name of the walk list"
            />
          </label>
          <TeamPicker
            label="Give it to"
            value={giveTo}
            onChange={setGiveTo}
            team={team}
            none="No one yet: keep it as a draft"
          />
          <div className="vhouse-actions">
            <button
              type="submit"
              className="btn btn--primary btn--sm"
              disabled={send.isPending || !name.trim()}
            >
              {send.isPending ? "Sending…" : giveTo ? "Send" : "Save the draft"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
