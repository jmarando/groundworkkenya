-- Door checks (schema 45): how far each visit was from its house, each person's day counted, and a
-- doubtful day's stipend held until someone approves it by name. Run with tests/sql/run.sh; each
-- test rolls back.

\ir fixtures.sql

-- Real plus codes, so the database can say where each house is: three doors on one Nairobi street.
create or replace function pg_temp.real_doors() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('pc', pc, 'lat', -1.29, 'lng', 36.82,
    'outline', jsonb_build_array(jsonb_build_array(jsonb_build_array(36.82, -1.29), jsonb_build_array(36.82002, -1.29),
                                                   jsonb_build_array(36.82002, -1.29002), jsonb_build_array(36.82, -1.29))),
    'ward_id', null))
    from unnest(array['6GCRPR6C+24', '6GCRPR6C+25', '6GCRPR6C+26', '6GCRPR6C+27']) pc $$;

create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: schema 45 is in
do $$ begin assert public.groundwork_schema_version() >= 45; end $$;

-- test: a plus code's centre is read as the app reads it
do $$
declare c record;
begin
  select * into c from public.pluscode_centre('6GCRPR6C+24');
  assert abs(c.lat - (-1.2899375)) < 1e-9 and abs(c.lng - 36.8203125) < 1e-9, 'centre of 6GCRPR6C+24';
  select * into c from public.pluscode_centre('6gcrwq5p+hrfj');
  assert abs(c.lat - (-1.0910575)) < 1e-9 and abs(c.lng - 36.78703515625) < 1e-9, 'an 11-digit code, any case';
  select * into c from public.pluscode_centre('TEST0000+01');
  assert c.lat is null and c.lng is null, 'not a plus code: nowhere';
  assert round(public.metres_between(-1.29, 36.82, -1.29, 36.83)) between 1110 and 1115, 'a hundredth of a degree is about 1.1 km';
end $$;

-- test: each visit is checked against its house; a day mostly away from the doors is held, then approved by name
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
begin
  perform public.create_walk_list('Kileleshwa real', null, kile, pg_temp.real_doors(), '00000000-0000-0000-0000-0000000000b2');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
declare lid uuid := (select id from public.my_walk_lists() limit 1);
begin
  -- At the door, 2 minutes apart; then two from a bar 1.1 km away; then one with no position.
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now() - interval '30 minutes',
    jsonb_build_object('lat', -1.2899375, 'lng', 36.8203125, 'accuracy', 8), lid, '6GCRPR6C+24');
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now() - interval '28 minutes',
    jsonb_build_object('lat', -1.2900, 'lng', 36.8205, 'accuracy', 12), lid, '6GCRPR6C+25');
  perform public.record_door(gen_random_uuid(), null, null, 'spoke', 4, 'Water', '{}', '', now() - interval '20 minutes',
    jsonb_build_object('lat', -1.2899, 'lng', 36.8303, 'accuracy', 10), lid, '6GCRPR6C+26');
  perform public.record_door(gen_random_uuid(), null, null, 'refused', null, '', '{}', '', now() - interval '20 minutes' + interval '5 seconds',
    null, lid, '6GCRPR6C+27');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  f record;
  sid uuid;
begin
  assert (select array_agg(place_check order by pc) from public.house_visits where pc like '6GCRPR6C+2_')
         = array['door', 'door', 'far', 'no_gps'], 'door, door, far, no position';
  assert (select distance_m from public.house_visits where pc = '6GCRPR6C+24') = 0, 'at the centre';
  assert (select distance_m between 1050 and 1150 from public.house_visits where pc = '6GCRPR6C+26'), 'about 1.1 km';

  select * into f from public.field_day_checks(current_date - 1, current_date)
   where user_id = '00000000-0000-0000-0000-0000000000b2';
  assert f.doors = 4 and f.at_door = 2 and f.far = 1 and f.no_gps = 1 and f.quick = 1 and f.late = 0, 'counted';
  assert f.held and f.reasons = array['far_or_no_gps'], 'half the doors away or unplaced: held';
  assert f.name is not null, 'named';

  assert public.stipends_from_field(current_date - 1, current_date, 1500) = 1, 'one day';
  select id into sid from public.agent_stipends where user_id = '00000000-0000-0000-0000-0000000000b2' and work_date = current_date;
  assert (select status = 'held' and check_note = 'far_or_no_gps' from public.agent_stipends where id = sid), 'held, with why';
  assert public.approve_stipends(array[sid]) = 1, 'approved when named';
  assert (select status from public.agent_stipends where id = sid) = 'approved', 'approved';
end $$;
rollback;

-- test: an agent can't read the field checks; a day at the doors is not held
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
begin
  perform public.create_walk_list('Kileleshwa real', null, kile, pg_temp.real_doors(), '00000000-0000-0000-0000-0000000000b2');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
declare lid uuid := (select id from public.my_walk_lists() limit 1);
begin
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now() - interval '10 minutes',
    jsonb_build_object('lat', -1.2899375, 'lng', 36.8203125, 'accuracy', 8), lid, '6GCRPR6C+24');
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now() - interval '8 minutes',
    jsonb_build_object('lat', -1.2903, 'lng', 36.8210, 'accuracy', 90), lid, '6GCRPR6C+25');
  assert pg_temp.state_of($q$select * from public.field_day_checks(current_date, current_date)$q$) = '42501', 'not for agents';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare f record;
begin
  select * into f from public.field_day_checks(current_date, current_date)
   where user_id = '00000000-0000-0000-0000-0000000000b2';
  assert f.doors = 2 and f.at_door = 2 and not f.held and f.reasons = '{}', 'a weak fix within its own accuracy is at the door';
  assert public.stipends_from_field(current_date, current_date, 1500) = 1, 'one day';
  assert (select status = 'pending' and check_note is null from public.agent_stipends
           where user_id = '00000000-0000-0000-0000-0000000000b2' and work_date = current_date), 'pending';
end $$;
rollback;
