// Which wards a campaign's public site offers on its volunteer form. None for
// a presidential campaign: its supporters live anywhere in Kenya, while its
// workspace holds only the wards of its map area. None, too, when the list is
// too long for a page meant to load on 2G.

/** A ward list longer than this is too heavy a page for 2G: leave the question out. */
export const MAX_WARDS = 150;

export function siteWards<T>(level: string | null | undefined, wards: T[] | null): T[] {
  if (level === "president" || !wards || wards.length > MAX_WARDS) return [];
  return wards;
}
