-- Polling centres (schema 27): the register's centres in every campaign with a map area, the
-- wards' boxes and registered voters, Sakaja's sample stations retired, and who may say where a
-- centre is. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: the register's centres in each campaign, and its wards' boxes and voters
do $$
declare
  n integer;
begin
  assert public.groundwork_schema_version() >= 27;
  select count(*) into n from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
   where c.slug = 'sakaja' and s.iebc_code is not null;
  assert n = 378, format('Sakaja has %s centres', n);
  select count(*) into n from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
   where c.slug = 'kalonzo' and s.iebc_code is not null;
  assert n = 378, format('Kalonzo has %s centres', n);
  select count(*) into n from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
   where c.slug = 'mathira' and s.iebc_code is not null;
  assert n = 109, format('Mathira has %s centres', n);
  assert (select sum(s.registered_voters) from public.polling_stations s
            join public.campaigns c on c.id = s.campaign_id where c.slug = 'kalonzo') = 2415310;
  assert (select sum(s.registered_voters) from public.polling_stations s
            join public.campaigns c on c.id = s.campaign_id where c.slug = 'mathira') = 104492;
  assert (select s.code from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'mathira' and s.iebc_code = '0190960477001') = 'PS-0001';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.map_area is not null and w.west is null) = 0, 'every ward has its box';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.map_area is not null
             and w.registered_voters <> (select coalesce(sum(s.registered_voters), 0)
                                           from public.polling_stations s
                                          where s.ward_id = w.id and s.iebc_code is not null)) = 0,
    'every ward''s voters are its centres''';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'sakaja' and s.iebc_code is null) = 0, 'no sample was used, so none is left';
  assert (select count(*) from public.polling_stations where placed_by = 'osm') > 100;
  assert (select count(*) from public.polling_stations
           where placed_by is not null and placed_at is null) = 0;
end $$;

-- test: a sample the team used is kept as SAMPLE-, the rest go, and again changes nothing
begin;
do $$
declare
  sakaja uuid := 'ca000000-0000-4000-8000-000000000002';
  kile uuid := (select id from public.wards where campaign_id = sakaja and slug = 'kileleshwa');
  gati uuid := (select id from public.wards where campaign_id = sakaja and slug = 'gatina');
begin
  insert into public.polling_stations
    (id, campaign_id, code, name, ward_id, registered_voters, streams, agent_name, status) values
    ('00000000-0000-0000-0000-00000000c001', sakaja, 'PS-9001', 'Kileleshwa Primary School', kile, 4000, 3, 'Agent Kileleshwa', 'confirmed'),
    ('00000000-0000-0000-0000-00000000c002', sakaja, 'PS-9002', 'Gatina Primary School', gati, 4000, 3, 'Wanjiru Kamau', 'confirmed'),
    ('00000000-0000-0000-0000-00000000c003', sakaja, 'PS-9003', 'Kileleshwa Primary School', kile, 4000, 3, null, 'unstaffed'),
    ('00000000-0000-0000-0000-00000000c004', sakaja, 'PS-9004', 'Gatina Primary School', gati, 4000, 3, 'Agent Gatina', 'confirmed');
  insert into public.stream_results (station_id, stream, votes, valid_votes, rejected, filed_by, channel)
  values ('00000000-0000-0000-0000-00000000c001', 1, '{}', 0, 0, '+254711000111', 'ussd');
  assert public.retire_sample_stations() = '{"gone": 2, "kept": 2}';
  assert (select code from public.polling_stations where id = '00000000-0000-0000-0000-00000000c001') = 'SAMPLE-0001';
  assert (select code from public.polling_stations where id = '00000000-0000-0000-0000-00000000c002') = 'SAMPLE-0002';
  assert not exists (select 1 from public.polling_stations
                      where id in ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000c004'));
  assert public.retire_sample_stations() = '{"gone": 0, "kept": 0}';
end $$;
rollback;

-- test: an organiser places a centre, within 2 km of its ward
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  st uuid := (select id from public.polling_stations
               where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0001');
  w public.wards;
  s public.polling_stations;
begin
  select wd.* into w from public.wards wd join public.polling_stations p on p.ward_id = wd.id where p.id = st;
  perform public.place_station(st, (w.south + w.north) / 2, (w.west + w.east) / 2);
  select * into s from public.polling_stations where id = st;
  assert s.placed_by = 'organiser' and s.placed_accuracy_m is null;
  assert s.placed_actor = '00000000-0000-0000-0000-0000000000c3' and s.placed_at is not null;
  assert s.lat = (w.south + w.north) / 2;
  assert pg_temp.fails_with(
    format('select public.place_station(%L, %s, %s)', st, w.north + 0.05, (w.west + w.east) / 2),
    'That is more than 2 km from the centre''s ward.');
end $$;
rollback;

-- test: only organisers and managers place a centre, and only their own campaign's
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  st uuid := (select id from public.polling_stations
               where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0001');
begin
  assert pg_temp.fails_with(format('select public.place_station(%L, -1.24, 36.75)', st),
    'Only organisers and managers can place a centre.');
  assert pg_temp.fails_with(format('select public.use_station_suggestion(%L)', st),
    'Only organisers and managers can place a centre.');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    format('select public.place_station(%L, -1.24, 36.75)',
           (select id from public.polling_stations
             where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0001')),
    'That centre is not on file.');
end $$;
rollback;

-- test: an agent at the centre moves its pin; a vague fix or one too far waits as a suggestion
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  st uuid := (select id from public.polling_stations
               where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0001');
  w public.wards;
  s public.polling_stations;
  mid_lat double precision;
  mid_lng double precision;
begin
  select wd.* into w from public.wards wd join public.polling_stations p on p.ward_id = wd.id where p.id = st;
  mid_lat := (w.south + w.north) / 2;
  mid_lng := (w.west + w.east) / 2;
  assert public.station_here(st, mid_lat, mid_lng, 12) = '{"moved": true}';
  select * into s from public.polling_stations where id = st;
  assert s.placed_by = 'agent' and s.placed_accuracy_m = 12;
  assert s.placed_actor = '00000000-0000-0000-0000-0000000000b2';
  assert public.station_here(st, mid_lat + 0.001, mid_lng, 80) = '{"why": "accuracy", "moved": false}';
  select * into s from public.polling_stations where id = st;
  assert s.lat = mid_lat, 'a vague fix leaves the pin';
  assert s.suggested_lat = mid_lat + 0.001 and s.suggested_accuracy_m = 80;
  assert s.suggested_by = '00000000-0000-0000-0000-0000000000b2';
  -- About 1.1 km north of the ward's box.
  assert public.station_here(st, w.north + 0.01, mid_lng, 10) = '{"why": "distance", "moved": false}';
  -- Within 300 m of the box is close enough.
  assert public.station_here(st, w.north + 0.002, mid_lng, 10) = '{"moved": true}';
  select * into s from public.polling_stations where id = st;
  assert s.suggested_lat is null, 'a move clears the suggestion';
end $$;
rollback;

-- test: an organiser takes an agent's suggestion, and the agent placed it
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  perform public.station_here(
    (select id from public.polling_stations
      where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0002'),
    -1.2401, 36.7501, 90);
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  st uuid := (select id from public.polling_stations
               where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0002');
  s public.polling_stations;
begin
  perform public.use_station_suggestion(st);
  select * into s from public.polling_stations where id = st;
  assert s.lat = -1.2401 and s.lng = 36.7501 and s.placed_by = 'agent';
  assert s.placed_accuracy_m = 90 and s.placed_actor = '00000000-0000-0000-0000-0000000000b2';
  assert s.suggested_lat is null;
  assert pg_temp.fails_with(format('select public.use_station_suggestion(%L)', st),
    'There is no suggestion waiting for that centre.');
end $$;
rollback;

-- test: the pending, and another campaign's agent, can't confirm a centre
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    format('select public.station_here(%L, -1.24, 36.75, 10)',
           (select id from public.polling_stations
             where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0001')),
    'Only the campaign''s team can confirm a centre.');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    format('select public.station_here(%L, -1.24, 36.75, 10)',
           (select s.id from public.polling_stations s
             where s.campaign_id = 'ca000000-0000-4000-8000-000000000002' and s.code = 'PS-0001')),
    'That centre is not on file.');
end $$;
rollback;

-- test: the team updates a station as before, but not where it is
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  st uuid := (select id from public.polling_stations
               where campaign_id = 'ca000000-0000-4000-8000-000000000002' and code = 'PS-0001');
begin
  update public.polling_stations set status = 'confirmed' where id = st;
  assert (select status from public.polling_stations where id = st) = 'confirmed';
  assert pg_temp.fails_with(
    format('update public.polling_stations set lat = 0, lng = 0, placed_by = %L where id = %L', 'agent', st),
    'permission denied for table polling_stations');
  assert pg_temp.fails_with(
    format('update public.polling_stations set iebc_code = %L where id = %L', '0000000000000', st),
    'permission denied for table polling_stations');
end $$;
rollback;

-- test: running both migrations again changes nothing
begin;
\ir ../../supabase/migrations/20261015090000_polling_centres.sql
\ir ../../supabase/migrations/20261015090100_polling_centres_data.sql
do $$
begin
  assert (select count(*) from public.polling_stations where iebc_code is not null) = 378 + 378 + 109;
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'sakaja') = 378;
  assert public.groundwork_schema_version() = 27;
end $$;
rollback;
