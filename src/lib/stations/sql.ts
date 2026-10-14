// The polling centres of data/stations as SQL, for the migration that loads them (schema 27,
// part 2): each map area's ward boxes and registered voters, and its centres with any
// position OpenStreetMap gave, for every campaign whose map area it is. Pure.

import type { Box } from "@/lib/geo";
import type { CentrePosition } from "@/lib/stations/match";
import type { RegisterCentre } from "@/lib/stations/register";

export type StationsArea = {
  /** The atlas key campaigns.map_area holds. */
  mapArea: string;
  centres: RegisterCentre[];
  positions: CentrePosition[];
  /** Each ward's outline box, by slug. */
  boxes: { slug: string; box: Box }[];
};

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (x: number) => String(Math.round(x * 1e6) / 1e6);

function areaSql(a: StationsArea): string {
  const registered = new Map<string, number>();
  for (const c of a.centres) registered.set(c.ward, (registered.get(c.ward) ?? 0) + c.registered);
  const wards = a.boxes
    .map(
      ({ slug, box }) =>
        `    (${q(slug)}, ${num(box.west)}, ${num(box.south)}, ${num(box.east)}, ${num(box.north)}, ${registered.get(slug) ?? 0})`,
    )
    .join(",\n");
  const at = new Map(a.positions.map((p) => [p.iebcCode, p]));
  const centres = a.centres
    .map((c) => {
      const p = at.get(c.iebcCode);
      const where = p ? `${num(p.lat)}, ${num(p.lng)}, ${q(p.placedBy)}` : "null, null, null";
      return `    (${q(c.iebcCode)}, ${q(c.code)}, ${q(c.name)}, ${q(c.ward)}, ${c.streams}, ${c.registered}, ${where})`;
    })
    .join(",\n");
  return `-- ${a.mapArea}: each ward's box and registered voters (its centres added up), then its centres.
update public.wards w
   set west = v.west, south = v.south, east = v.east, north = v.north,
       registered_voters = v.registered
  from (values
${wards}
  ) as v(slug, west, south, east, north, registered)
  join public.campaigns c on c.map_area = ${q(a.mapArea)}
 where w.campaign_id = c.id and w.slug = v.slug;

insert into public.polling_stations
  (campaign_id, code, iebc_code, name, ward_id, registered_voters, streams, lat, lng, placed_by,
   placed_at)
select c.id, v.code, v.iebc_code, v.name, w.id, v.registered, v.streams,
       v.lat::double precision, v.lng::double precision, v.placed_by,
       case when v.lat is null then null else now() end
  from (values
${centres}
  ) as v(iebc_code, code, name, ward, streams, registered, lat, lng, placed_by)
  join public.campaigns c on c.map_area = ${q(a.mapArea)}
  join public.wards w on w.campaign_id = c.id and w.slug = v.ward
on conflict (campaign_id, iebc_code) where iebc_code is not null do nothing;
`;
}

/** The whole migration: a check that no code the register needs is taken, each area, a count, the version. */
export function stationsSql(areas: StationsArea[]): string {
  const keys = areas.map((a) => q(a.mapArea)).join(", ");
  const want = areas.map((a) => `(${q(a.mapArea)}, ${a.centres.length})`).join(", ");
  return `-- A station with no IEBC code holding a code the register needs would be lost: stop instead.
do $$
begin
  if exists (select 1 from public.polling_stations s
               join public.campaigns c on c.id = s.campaign_id
              where c.map_area in (${keys}) and s.iebc_code is null and s.code ~ '^PS-[0-9]{4}$') then
    raise exception 'A station with no IEBC code holds a PS- code the register needs: rename it first.';
  end if;
end $$;

${areas.map(areaSql).join("\n")}
-- Every campaign with one of these map areas has all of its centres.
do $$
declare
  short text;
begin
  select string_agg(format('%s has %s centres, not %s', c.slug, k.n, e.want), '; ') into short
    from (values ${want}) as e(map_area, want)
    join public.campaigns c on c.map_area = e.map_area
    cross join lateral (select count(*) as n from public.polling_stations s
                         where s.campaign_id = c.id and s.iebc_code is not null) k
   where k.n <> e.want;
  if short is not null then
    raise exception 'The centres did not all load: %', short;
  end if;
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 27 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
`;
}

/** The migration file as scripts/stations/build-sql.ts writes it: a header, then stationsSql. */
export const stationsMigration = (areas: StationsArea[]): string =>
  "-- Schema 27, part 2: the polling centres of IEBC's 2022 register for every campaign with a map\n" +
  "-- area (Nairobi for Sakaja and Kalonzo, Mathira for Mathira), from data/stations, with the\n" +
  "-- positions OpenStreetMap's schools gave (© OpenStreetMap contributors, ODbL). Safe to run again.\n" +
  "-- Written by scripts/stations/build-sql.ts: change the CSV files and run it again, not this file.\n\n" +
  stationsSql(areas);
