// A ward's polling centres on the Voters screen: the two lists the panel shows (on the map, and
// not yet), the part of the ward nearest each centre on the map, and those parts as shapes to
// draw. The areas are worked out here from the ward's outline, once for the panel and the map.

import { useMemo } from "react";

import { centreAreaShapes, wardCentres, type Centre, type CentreAreaShapes } from "@/lib/centres";
import type { WardShape } from "@/lib/geo";
import { centreAreas, type CentreArea } from "@/lib/stations/areas";

const NONE: Centre[] = [];
const NO_AREAS: CentreAreaShapes = { type: "FeatureCollection", features: [] };

export function useWardCentres(
  wardId: string | null,
  shape: WardShape | undefined,
  centres: Centre[],
): { placed: Centre[]; waiting: Centre[]; areas: CentreArea[]; areaShapes: CentreAreaShapes } {
  const lists = useMemo(
    () => (wardId ? wardCentres(centres, wardId) : { placed: NONE, waiting: NONE }),
    [centres, wardId],
  );
  const areas = useMemo(
    () =>
      shape && lists.placed.length
        ? centreAreas(
            lists.placed.flatMap((c) => (c.placed ? [{ id: c.id, at: c.placed.at }] : [])),
            shape,
          )
        : [],
    [shape, lists.placed],
  );
  const areaShapes = useMemo(
    () => (areas.length ? centreAreaShapes(areas, lists.placed) : NO_AREAS),
    [areas, lists.placed],
  );
  return { ...lists, areas, areaShapes };
}
