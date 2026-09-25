// Where the door is. While a visit is open the phone watches its GPS (which
// needs no data signal) and matches the fix to a building outline, unless the
// agent picks the building or says it isn't the person's home.

import { useEffect, useMemo, useState } from "react";

import type { Place } from "@/lib/field";
import { distanceM, inPolygon, nearestBuilding, type Building, type LngLat } from "@/lib/geo";

/** A fix vaguer than this doesn't pick a building on its own. */
const AUTO_PICK_M = 50;

export type Fix = { lng: number; lat: number; accuracy: number | null; at: number };
export type Geo = { status: "locating" | "ok" | "off" | "none"; fix: Fix | null; slow: boolean };

/** Watch the phone's position while mounted, keeping the sharpest recent fix. */
function useFix(): Geo {
  const [geo, setGeo] = useState<Geo>({ status: "locating", fix: null, slow: false });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "none", fix: null, slow: false });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next: Fix = {
          lng: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          at: p.timestamp || Date.now(),
        };
        setGeo((g) => {
          const kept = g.fix;
          // A sharper fix from the last 15 seconds beats a vaguer new one.
          const keep =
            kept !== null &&
            kept.accuracy !== null &&
            next.accuracy !== null &&
            kept.accuracy < next.accuracy &&
            next.at - kept.at < 15_000;
          return { status: "ok", fix: keep ? kept : next, slow: false };
        });
      },
      (e) =>
        setGeo((g) =>
          e.code === e.PERMISSION_DENIED
            ? { status: "off", fix: null, slow: false }
            : { ...g, slow: true },
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return geo;
}

export type DoorPlaceState = {
  geo: Geo;
  /** The building the visit is recorded against, and how far the agent is from it. */
  chosen: { building: Building; distanceM: number } | null;
  /** The agent said their building isn't on the map: record the GPS point alone. */
  gpsOnly: boolean;
  /** The agent said this isn't the person's home: record no place at all. */
  skipped: boolean;
  /** What the visit carries. */
  place: Place | null;
  pick: (id: string) => void;
  pickGpsOnly: () => void;
  skip: (skipped: boolean) => void;
};

/**
 * The building and place a visit is recorded with. `picked` is undefined to
 * choose automatically, null for the GPS point alone, or the agent's choice.
 */
export function resolvePlace(
  fix: Fix | null,
  buildings: Building[],
  picked: string | null | undefined,
  skipped: boolean,
): { chosen: { building: Building; distanceM: number } | null; place: Place | null } {
  if (!fix) return { chosen: null, place: null };
  const at: LngLat = [fix.lng, fix.lat];
  let chosen: { building: Building; distanceM: number } | null = null;
  if (picked === undefined) {
    if ((fix.accuracy ?? 0) <= AUTO_PICK_M) chosen = nearestBuilding(at, buildings);
  } else if (picked !== null) {
    const b = buildings.find((x) => x.id === picked);
    if (b)
      chosen = { building: b, distanceM: inPolygon(at, b.rings) ? 0 : distanceM(at, b.centre) };
  }
  if (skipped) return { chosen, place: null };
  return {
    chosen,
    place: {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy === null ? null : Math.round(fix.accuracy),
      buildingId: chosen?.building.id ?? null,
    },
  };
}

export function useDoorPlace(buildings: Building[]): DoorPlaceState {
  const geo = useFix();
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [skipped, setSkipped] = useState(false);

  const { chosen, place } = useMemo(
    () => resolvePlace(geo.fix, buildings, picked, skipped),
    [geo.fix, buildings, picked, skipped],
  );

  return {
    geo,
    chosen,
    gpsOnly: picked === null,
    skipped,
    place,
    pick: (id) => {
      setPicked(id);
      setSkipped(false);
    },
    pickGpsOnly: () => {
      setPicked(null);
      setSkipped(false);
    },
    skip: setSkipped,
  };
}
