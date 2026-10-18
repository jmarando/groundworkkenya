// Who is in each place, for Outlook 2027: the adults, the young adults (18 to
// 34) and the adults not on the register in each constituency, from the atlas's
// WorldPop estimates, and the county's new registrations placed in proportion to
// the adults off the register. Pure. The estimates are of 2020 and of where
// people live, the register is of 2022 and of where they registered, so the
// figures are a guide to where the unregistered are, not a count.
// docs/superpowers/plans/2026-10-18-outlook-2027.md.

import { populationOf, type AtlasData } from "@/lib/atlas-view";
import { allocate, type Outlook, type Youth } from "@/lib/outlook";
import { registerOf, type Seat } from "@/lib/seat";

type Facts = { adults: number; young: number; registered: number; unregistered: number };
const add = (a: Facts, b: Facts): Facts => ({
  adults: a.adults + b.adults,
  young: a.young + b.young,
  registered: a.registered + b.registered,
  unregistered: a.unregistered + b.unregistered,
});
const NONE: Facts = { adults: 0, young: 0, registered: 0, unregistered: 0 };

/**
 * The facts for each place of the seat (the seats it shows together are summed)
 * and for the county. Null unless every constituency of the county has an
 * estimate, all of one year and source, and a register. A constituency's
 * unregistered adults are its adults less its register, never below nothing.
 */
export function youthFacts(d: AtlasData, seat: Seat): Youth | null {
  const year = Number(seat.election.slice(0, 4));
  const seats = d.areas.filter((a) => a.level === "constituency" && a.parent === seat.county);
  if (!seats.length) return null;
  const people = seats.map((a) => ({ key: a.key, pop: populationOf(d, a.key)?.estimate ?? null }));
  const first = people[0]!.pop;
  if (
    !first ||
    people.some((x) => !x.pop || x.pop.year !== first.year || x.pop.source !== first.source)
  )
    return null;

  const apart = new Set(seat.buckets.filter((b) => !b.together).map((b) => b.key));
  const together = seat.buckets.find((b) => b.together)?.key;
  const buckets: Record<string, Facts> = {};
  for (const { key, pop } of people) {
    const registered = registerOf(d, key, year);
    if (registered === null || !pop) return null;
    const into = apart.has(key) ? key : together;
    if (!into) return null;
    const mine: Facts = {
      adults: pop.adults,
      young: pop.youngAdults,
      registered,
      unregistered: Math.max(0, pop.adults - registered),
    };
    buckets[into] = add(buckets[into] ?? NONE, mine);
  }
  const s = d.sources.find((x) => x.id === first.source);
  return {
    buckets,
    total: Object.values(buckets).reduce(add, NONE),
    year: first.year,
    source: s ? `${s.publisher}: ${s.title}` : first.source,
  };
}

/**
 * The seat as Outlook 2027 runs on it: the new registrations placed among its
 * places in proportion to the adults off the register, or not placed (null) when
 * the county has no figure or no estimates, the figure is not a whole number, or
 * nobody is off the register anywhere.
 */
export function outlookFor(
  seat: Seat,
  youth: Youth | null,
  registration: { count: number; period: string; source: string } | null,
): Outlook {
  const fresh =
    youth && registration
      ? allocate(
          registration.count,
          Object.fromEntries(Object.entries(youth.buckets).map(([k, v]) => [k, v.unregistered])),
        )
      : null;
  return { seat, youth, registration, fresh };
}
