// Where the door is, as the agent sees it at the door: what the phone found,
// and a small map drawn from the building outlines alone (no tiles, so it
// works with no signal) to tap the right building.

import { useMemo, useState } from "react";

import { type DoorPlaceState, type Fix } from "@/hooks/useDoorPlace";
import { buildingsNear, toLocalM, type Building, type LngLat, type Ring } from "@/lib/geo";

/** How far around the agent the picker shows, in metres. */
const PICK_RADIUS_M = 80;

function describe(door: DoorPlaceState, outlines: "none" | "loading" | "ready"): string {
  const { geo, chosen } = door;
  if (door.skipped) return "Not placed on the map: this isn't their home.";
  if (geo.status === "none")
    return "This phone can't share its location, so the visit won't be on the map.";
  if (geo.status === "off")
    return "Location is off for this site. Allow it to put visits on the map; the visit saves either way.";
  if (!geo.fix)
    return geo.slow
      ? "Still finding where you are. Stepping outside helps."
      : "Finding where you are…";
  const within = geo.fix.accuracy === null ? "" : ` ±${Math.round(geo.fix.accuracy)} m`;
  if (chosen)
    return chosen.distanceM < 1
      ? `At the building you're in · GPS${within}`
      : `At the building ${Math.round(chosen.distanceM)} m from you · GPS${within}`;
  if (door.gpsOnly || outlines === "none") return `Placed by GPS${within}`;
  if (outlines === "loading") return `Placed by GPS${within} · loading the ward's buildings…`;
  return `No building picked yet · GPS${within}. Tap Change to pick it.`;
}

export function DoorPlace({
  door,
  buildings,
  outlines,
}: {
  door: DoorPlaceState;
  buildings: Building[];
  /** Whether this ward has building outlines, and whether they have arrived. */
  outlines: "none" | "loading" | "ready";
}) {
  const [picking, setPicking] = useState(false);
  const fix = door.geo.fix;

  return (
    <div className="dp" role="group" aria-label="Where the door is">
      <div className="dp-line">
        <span aria-live="polite">{describe(door, outlines)}</span>
        {door.skipped ? (
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => door.skip(false)}>
            Undo
          </button>
        ) : (
          fix &&
          !picking && (
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => setPicking(true)}
            >
              Change
            </button>
          )
        )}
      </div>

      {picking && fix && !door.skipped && (
        <>
          {outlines === "ready" ? (
            <PickMap
              fix={fix}
              buildings={buildings}
              chosenId={door.chosen?.building.id ?? null}
              onPick={door.pick}
            />
          ) : (
            <p className="f-note">
              {outlines === "loading"
                ? "Loading the ward's buildings…"
                : "This ward's buildings aren't on the map yet, so the visit is placed by GPS."}
            </p>
          )}
          <div className="dp-actions">
            {outlines === "ready" && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={door.pickGpsOnly}>
                Their building isn't shown
              </button>
            )}
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => {
                door.skip(true);
                setPicking(false);
              }}
            >
              Not their home
            </button>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              onClick={() => setPicking(false)}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The outline as an SVG path in metres around the agent, north up. */
function outlinePath(rings: Ring[], origin: LngLat): string {
  return rings
    .map(
      (ring) =>
        ring
          .map((c, i) => {
            const [x, y] = toLocalM(c, origin);
            return `${i ? "L" : "M"}${x.toFixed(1)} ${(-y).toFixed(1)}`;
          })
          .join("") + "Z",
    )
    .join("");
}

function PickMap({
  fix,
  buildings,
  chosenId,
  onPick,
}: {
  fix: Fix;
  buildings: Building[];
  chosenId: string | null;
  onPick: (id: string) => void;
}) {
  const near = useMemo(
    () => buildingsNear([fix.lng, fix.lat], buildings, PICK_RADIUS_M, 80),
    [fix, buildings],
  );
  const origin: LngLat = [fix.lng, fix.lat];
  const r = PICK_RADIUS_M + 10;

  return (
    <>
      <svg
        className="dp-map"
        viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`}
        role="group"
        aria-label="Buildings around you. Tap theirs."
      >
        {near.map(({ building, distanceM: d }) => {
          const on = building.id === chosenId;
          return (
            <path
              key={building.id}
              d={outlinePath(building.rings, origin)}
              className={on ? "is-on" : undefined}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={d < 1 ? "The building you're in" : `Building ${Math.round(d)} m away`}
              onClick={() => onPick(building.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(building.id);
                }
              }}
            />
          );
        })}
        {fix.accuracy !== null && <circle className="dp-acc" r={Math.min(fix.accuracy, r)} />}
        <circle className="dp-you" r={3} />
      </svg>
      <p className="f-note">
        {near.length
          ? "You are the blue dot, north is up. Tap their building."
          : "No buildings within 80 m of you on the map."}
      </p>
    </>
  );
}
