// Planning a walk list on the Voters map: whether the planner is open, its state as the person
// taps (src/lib/walk-list-plan.ts), the houses read for the area and what the database knows of
// them (visits in 30 days, houses on other lists), and the draft that makes. The screen only draws it.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";

import { useAreaBuildings } from "@/hooks/useAreaBuildings";
import type { LngLat, Ring } from "@/lib/geo";
import type { MapArea } from "@/lib/map-areas";
import {
  draftDoors,
  emptyPlan,
  reducePlan,
  toPlanHouses,
  type Draft,
  type PlanAction,
  type PlanState,
  type PlanStatus,
} from "@/lib/walk-list-plan";
import { DRAW_CAP, type HouseHistory } from "@/lib/walk-lists";
import { getPlanning } from "@/lib/walk-lists.functions";

export type WalkListPlan = {
  on: boolean;
  /** Opens the planner; a centre's position is where a patch starts. */
  begin: (centre: LngLat | null) => void;
  stop: () => void;
  state: PlanState;
  dispatch: (a: PlanAction) => void;
  status: PlanStatus;
  draft: Draft;
  /** The centre the planner was opened at, if any. */
  centre: LngLat | null;
  /** A tap on the map while planning: the point, and the house under it if there is one. */
  tap: (at: LngLat, pc: string | null) => void;
};

const NO_HISTORY = new Map<string, HouseHistory>();

function usePlanState() {
  return useReducer(reducePlan, undefined, emptyPlan);
}

export function useWalkListPlan({
  mapArea,
  polygons,
  wardId,
}: {
  mapArea: MapArea | null;
  /** The area the houses are read for: a centre's area, else the ward's. */
  polygons: Ring[][] | null;
  wardId: string | null;
}): WalkListPlan {
  const [on, setOn] = useState(false);
  const [centre, setCentre] = useState<LngLat | null>(null);
  const [state, dispatch] = usePlanState();
  const fetchPlanning = useServerFn(getPlanning);

  const buildings = useAreaBuildings(on ? mapArea : null, on ? polygons : null);
  const { data: history, dataUpdatedAt } = useQuery({
    queryKey: ["walk-list-planning", wardId],
    queryFn: () => fetchPlanning({ data: { wardId: wardId! } }),
    enabled: on && Boolean(wardId),
    // Planned over, not remembered: what others did a minute ago matters.
    staleTime: 0,
  });

  const houses = useMemo(() => (buildings ? toPlanHouses(buildings) : []), [buildings]);
  const byPc = useMemo(
    () => (history ? new Map(history.map((h) => [h.pc, h])) : NO_HISTORY),
    [history],
  );
  const status: PlanStatus =
    buildings === null
      ? "too-big"
      : history === null
        ? "missing"
        : buildings === undefined || history === undefined
          ? "reading"
          : "ready";
  // "Now" for the 30 and 3 day rules is when the history was read.
  const now = useMemo(() => dataUpdatedAt || Date.now(), [dataUpdatedAt]);
  const draft = useMemo(
    () => draftDoors(state, houses, byPc, now, centre),
    [state, houses, byPc, now, centre],
  );

  const begin = useCallback(
    (at: LngLat | null) => {
      setCentre(at);
      dispatch({ type: "reset" });
      if (at) dispatch({ type: "start", at });
      setOn(true);
    },
    [dispatch],
  );
  const stop = useCallback(() => {
    setOn(false);
    setCentre(null);
    dispatch({ type: "reset" });
  }, [dispatch]);

  const tap = useCallback(
    (at: LngLat, pc: string | null) => {
      if (!on || status !== "ready") return;
      const toggle = (pc: string) => {
        if (draft.doors.some((d) => d.pc === pc)) {
          dispatch({ type: "off", pc });
          return;
        }
        if (!houses.some((h) => h.pc === pc)) return;
        if (byPc.get(pc)?.onList) {
          toast.message("That house is on another walk list.");
          return;
        }
        if (draft.doors.length >= DRAW_CAP) {
          toast.message(`A list is at most ${DRAW_CAP} houses.`);
          return;
        }
        dispatch({ type: "add", pc });
      };
      if (state.mode === "patch") {
        // The first tap chooses where the patch starts; after that a tap is a house, on or off.
        if (!state.start) dispatch({ type: "start", at });
        else if (pc) toggle(pc);
      } else if (!state.closed) dispatch({ type: "point", at });
      else if (pc) toggle(pc);
    },
    [on, status, state, draft, houses, byPc, dispatch],
  );

  return { on, begin, stop, state, dispatch, status, draft, centre, tap };
}
