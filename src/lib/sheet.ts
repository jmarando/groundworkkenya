// The Voters panel as a sheet on a narrow screen: its three heights, the one
// a drag lets go nearest, the next one its handle steps to, and the room it
// takes from the map. Pure.

export type Snap = "peek" | "half" | "full";

/** How much shows when the sheet peeks: the top of a house card, or the first numbers. */
export const PEEK_PX = 132;

const SNAPS: Snap[] = ["peek", "half", "full"];

/** The sheet's height at a snap, over a map `body` pixels tall. */
export function snapHeight(snap: Snap, body: number): number {
  const peek = Math.min(PEEK_PX, body);
  if (snap === "peek") return peek;
  if (snap === "half") return Math.max(Math.round(body / 2), peek);
  return body;
}

/** The snap nearest a height the sheet was dragged to. */
export function nearestSnap(height: number, body: number): Snap {
  let best: Snap = "peek";
  for (const s of SNAPS)
    if (Math.abs(snapHeight(s, body) - height) < Math.abs(snapHeight(best, body) - height))
      best = s;
  return best;
}

/** Where the handle, pressed, takes the sheet: up a step, and from full back down to peek. */
export const nextSnap = (snap: Snap): Snap =>
  snap === "peek" ? "half" : snap === "half" ? "full" : "peek";

/** The room the sheet takes from the bottom of the map: at most half, so the map keeps a centre. */
export const mapRoom = (snap: Snap, body: number): number =>
  Math.min(snapHeight(snap, body), Math.round(body / 2));
