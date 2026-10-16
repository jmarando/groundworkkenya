// A test helper, not a test: the atlas's CSV folders (data/atlas) as the app's
// AtlasData, with the campaign's own parts (home area, side, notes, profiles)
// left empty unless given. A candidate's id is `election|seat|name`, which is
// also how a result names its candidate here.

import type { AtlasData } from "@/lib/atlas-view";

import { atlasFolders, readAtlas } from "../scripts/atlas/read";

export const candidateId = (election: string, seat: string, name: string) =>
  `${election}|${seat}|${name}`;

export function atlasFromCsv(
  own: { homeArea?: string | null; sides?: Record<string, string> } = {},
  root = "data/atlas",
): AtlasData {
  const { files } = readAtlas(root, atlasFolders(root));
  return {
    areas: files.areas.map((a) => ({ key: a.key, level: a.level, name: a.name, parent: a.parent })),
    candidates: files.candidates.map((c) => ({
      id: candidateId(c.election, c.seat, c.name),
      election: c.election,
      seat: c.seat,
      name: c.name,
      party: c.party,
      bloc: c.bloc,
    })),
    results: files.results.map((r) => ({
      candidate: candidateId(r.election, r.seat, r.candidate),
      area: r.area,
      votes: r.votes,
      source: r.source,
    })),
    turnout: files.turnout.map((t) => ({
      election: t.election,
      area: t.area,
      registered: t.registered,
      cast: t.cast_votes,
      rejected: t.rejected,
      valid: t.valid,
      source: t.source,
    })),
    register: files.register.map((r) => ({
      year: r.year,
      area: r.area,
      registered: r.registered,
      source: r.source,
    })),
    population: files.population.map((p) => ({
      area: p.area,
      year: p.year,
      total: p.total,
      adults: p.adults,
      youngAdults: p.young_adults,
      source: p.source,
    })),
    sources: files.sources,
    indicators: files.indicators.map((i) => ({
      area: i.area,
      indicator: i.indicator as AtlasData["indicators"][number]["indicator"],
      year: i.year,
      value: i.value,
      source: i.source,
    })),
    homeArea: own.homeArea ?? null,
    sides: own.sides ?? {},
    notes: {},
    profiles: {},
  };
}
