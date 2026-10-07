// The atlas's figures as a migration: upserts in the order the foreign keys
// need, so running it twice changes nothing and a corrected file replaces the
// old figure. Pure.

import { candidateId, type AtlasFiles } from "@/lib/atlas-files";

type Cell = string | number | null;

const lit = (v: Cell): string =>
  v === null ? "null" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

function upsert(table: string, cols: string[], rows: Cell[][], key: string[]): string {
  if (!rows.length) return "";
  const update = cols
    .filter((c) => !key.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const values = rows
      .slice(i, i + 500)
      .map((r) => `  (${r.map(lit).join(", ")})`)
      .join(",\n");
    out.push(
      `insert into public.${table} (${cols.join(", ")}) values\n${values}\non conflict (${key.join(", ")}) do ${update ? `update set ${update}` : "nothing"};\n`,
    );
  }
  return out.join("\n");
}

const depth = (key: string) => (key === "kenya" ? 0 : key.split("/").length);

export function atlasSql(f: AtlasFiles): string {
  const areas = [...f.areas].sort(
    (a, b) => depth(a.key) - depth(b.key) || a.key.localeCompare(b.key),
  );
  return [
    upsert(
      "atlas_sources",
      ["id", "title", "publisher", "url", "note"],
      f.sources.map((s) => [s.id, s.title, s.publisher, s.url, s.note]),
      ["id"],
    ),
    upsert(
      "atlas_areas",
      ["key", "level", "name", "parent", "iebc_code"],
      areas.map((a) => [a.key, a.level, a.name, a.parent, a.iebc_code]),
      ["key"],
    ),
    upsert(
      "atlas_candidates",
      ["id", "election_id", "seat", "name", "party", "bloc"],
      f.candidates.map((c) => [
        candidateId(c.election, c.seat, c.name),
        c.election,
        c.seat,
        c.name,
        c.party,
        c.bloc,
      ]),
      ["id"],
    ),
    upsert(
      "atlas_results",
      ["candidate_id", "area_key", "votes", "source_id"],
      f.results.map((r) => [
        candidateId(r.election, r.seat, r.candidate),
        r.area,
        r.votes,
        r.source,
      ]),
      ["candidate_id", "area_key"],
    ),
    upsert(
      "atlas_turnout",
      ["election_id", "area_key", "registered", "cast_votes", "rejected", "valid", "source_id"],
      f.turnout.map((t) => [
        t.election,
        t.area,
        t.registered,
        t.cast_votes,
        t.rejected,
        t.valid,
        t.source,
      ]),
      ["election_id", "area_key"],
    ),
    upsert(
      "atlas_register",
      ["year", "area_key", "registered", "source_id"],
      f.register.map((r) => [r.year, r.area, r.registered, r.source]),
      ["year", "area_key"],
    ),
    upsert(
      "atlas_population",
      ["area_key", "year", "total", "adults", "young_adults", "source_id"],
      f.population.map((p) => [p.area, p.year, p.total, p.adults, p.young_adults, p.source]),
      ["area_key", "year"],
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
