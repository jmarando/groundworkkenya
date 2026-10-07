// Where an atlas figure comes from. Areas are keyed by a path of slugs (nairobi,
// nairobi/dagoretti-north, nairobi/dagoretti-north/kileleshwa), so the area above and an area's
// level can be read from the key. Until polling stations give wards results of their own, a ward
// shows its constituency's figures, labelled as such. Pure.

import type { Level } from "./types";

/**
 * The key above an area: its path less the last part. A county's is the country's; the country
 * has none.
 */
export function parentKey(key: string): string | null {
  if (key === "kenya") return null;
  const i = key.lastIndexOf("/");
  return i === -1 ? "kenya" : key.slice(0, i);
}

/** An area's level, from the shape of its key. */
export function levelOfKey(key: string): Level {
  if (key === "kenya") return "country";
  const parts = key.split("/").length;
  return parts === 1 ? "county" : parts === 2 ? "constituency" : "ward";
}

/**
 * Where the results an area shows are held: its own when it has any; a ward with none shows its
 * constituency's. Nothing else borrows, so a constituency without results is simply without.
 */
export function resultsArea(
  key: string,
  has: (key: string) => boolean,
): { key: string; inherited: boolean } | null {
  if (has(key)) return { key, inherited: false };
  if (levelOfKey(key) === "ward") {
    const above = parentKey(key);
    if (above !== null && has(above)) return { key: above, inherited: true };
  }
  return null;
}

/**
 * "constituency figure" when an area shows the figures of the area above it; null when they are
 * its own.
 */
export function figureLabel(found: { key: string; inherited: boolean } | null): string | null {
  return found && found.inherited ? `${levelOfKey(found.key)} figure` : null;
}
