-- Walk lists (schema 28): a list and its doors, who may plan and read them, a house on one open list
-- only, record_door at a list's door (with a person or without), and a list turning done by itself.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- Doors for a list: TEST0000+01 ... down one street, each a small square, in walking order.
create or replace function pg_temp.doors(_from integer, _to integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('pc', 'TEST0000+' || lpad(i::text, 2, '0'), 'lat', -1.28 - i * 0.00005, 'lng', 36.78,
    'outline', jsonb_build_array(jsonb_build_array(jsonb_build_array(36.78, -1.28), jsonb_build_array(36.78002, -1.28),
                                                   jsonb_build_array(36.78002, -1.28002), jsonb_build_array(36.78, -1.28))),
    'ward_id', null) order by i) from generate_series(_from, _to) i $$;

-- True when running _sql raises the SQLSTATE _state.
create or replace function pg_temp.fails_state(_sql text, _state text)
returns boolean language plpgsql as $$
begin
  execute _sql;
  return false;
exception when others then
  if sqlstate <> _state then
    raise notice 'expected %, got % (%)', _state, sqlstate, sqlerrm;
    return false;
  end if;
  return true;
end $$;

-- test: schema 28 is in
do $$ begin assert public.groundwork_schema_version() >= 28; end $$;

-- test: staff make and give a list, an agent cannot
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  made jsonb;
  lid uuid;
begin
  made := public.create_walk_list('Kileleshwa Primary 1', null, kile, pg_temp.doors(1, 5), '00000000-0000-0000-0000-0000000000b2');
  lid := (made ->> 'id')::uuid;
  assert (made ->> 'left_off')::int = 0;
  assert (select status = 'out' and given_to = '00000000-0000-0000-0000-0000000000b2'
                 and first_sent_at is not null and given_at is not null and done_at is null
                 and made_by = '00000000-0000-0000-0000-0000000000c3' and ward_id = kile
                 and name = 'Kileleshwa Primary 1' and campaign_id = 'ca000000-0000-4000-8000-000000000002'
            from public.walk_lists where id = lid);
  assert (select count(*) from public.walk_list_doors where walk_list_id = lid) = 5;
  assert (select position from public.walk_list_doors where walk_list_id = lid and pc = 'TEST0000+03') = 3;
  assert (select ward_id = kile and campaign_id = 'ca000000-0000-4000-8000-000000000002'
            from public.walk_list_doors where walk_list_id = lid and pc = 'TEST0000+03'), 'a door with no ward takes the list''s';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  lid uuid := (select id from public.walk_lists where name = 'Kileleshwa Primary 1');
begin
  assert lid is not null, 'the agent reads the list they were given';
  assert pg_temp.fails_with($q$ select public.create_walk_list('x', null, (select id from public.wards limit 1), pg_temp.doors(1, 2)) $q$,
    'Only organisers and managers can plan walk lists.');
  assert pg_temp.fails_state($q$ select public.create_walk_list('x', null, (select id from public.wards limit 1), pg_temp.doors(1, 2)) $q$, '42501');
  assert pg_temp.fails_with(format($q$ select public.give_walk_list(%L, %L) $q$, lid, '00000000-0000-0000-0000-0000000000b2'),
    'Only organisers and managers can plan walk lists.');
  assert pg_temp.fails_with(format($q$ select public.close_walk_list(%L) $q$, lid),
    'Only organisers and managers can plan walk lists.');
  assert pg_temp.fails_state($q$ update public.walk_lists set status = 'done' $q$, '42501'), 'no writing a list directly';
  assert pg_temp.fails_state($q$ delete from public.walk_list_doors $q$, '42501'), 'no writing a door directly';
end $$;
rollback;

-- test: a house is on one open list only, and a list with every house taken is refused
begin;
-- Mathira's ward and centre, for the refusals below (Sakaja's manager cannot read them).
do $$
begin
  perform set_config('walk.m_ward', (select id::text from public.wards
                                      where campaign_id = 'ca000000-0000-4000-8000-000000000003' order by slug limit 1), true);
  perform set_config('walk.m_centre', (select id::text from public.polling_stations
                                        where campaign_id = 'ca000000-0000-4000-8000-000000000003' order by code limit 1), true);
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  one jsonb;
  two jsonb;
begin
  one := public.create_walk_list('One', null, kile, pg_temp.doors(1, 5), null);
  assert (select status = 'draft' and given_to is null and given_at is null and first_sent_at is null
            from public.walk_lists where id = (one ->> 'id')::uuid), 'no one to give it to: a draft, which holds its houses';
  two := public.create_walk_list('Two', null, kile, pg_temp.doors(4, 9), null);
  assert (two ->> 'left_off')::int = 2;
  assert (select count(*) from public.walk_list_doors where walk_list_id = (two ->> 'id')::uuid) = 4;
  assert (select array_agg(pc order by position) from public.walk_list_doors where walk_list_id = (two ->> 'id')::uuid)
       = array['TEST0000+06', 'TEST0000+07', 'TEST0000+08', 'TEST0000+09'], 'the doors left are numbered again from 1';
  assert pg_temp.fails_with(format($q$ select public.create_walk_list('Three', null, %L, pg_temp.doors(1, 3), null) $q$, kile),
    'Every one of those houses is on another list.');
  assert pg_temp.fails_with(format($q$ select public.create_walk_list('Four', null, %L, '[]'::jsonb, null) $q$, kile),
    'Pick at least one house.');
  assert pg_temp.fails_with(format($q$ select public.create_walk_list('Five', null, %L, pg_temp.doors(20, 170), null) $q$, kile),
    'A list is at most 150 houses.');
  assert pg_temp.fails_with(format($q$ select public.create_walk_list('Six', %L, %L, pg_temp.doors(30, 31), null) $q$,
    current_setting('walk.m_centre')::uuid, kile), 'That centre isn''t on file.');
  assert pg_temp.fails_with(format($q$ select public.create_walk_list('Seven', null, %L, pg_temp.doors(30, 31), null) $q$,
    current_setting('walk.m_ward')::uuid), 'That ward isn''t on file.');
  assert pg_temp.fails_with(format($q$ select public.create_walk_list('  ', null, %L, pg_temp.doors(30, 31), null) $q$, kile),
    'Name the list, in 80 letters or fewer.');
  assert (select count(*) from public.walk_lists where name in ('Three', 'Four', 'Five', 'Six', 'Seven', '  ')) = 0,
    'a refused list leaves nothing behind';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$
begin
  -- Mathira plans the same plus codes: another campaign's lists are not this one's.
  assert ((public.create_walk_list('Mathira 1', null,
            (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000003' order by slug limit 1),
            pg_temp.doors(1, 5), null)) ->> 'left_off')::int = 0;
end $$;
rollback;

-- test: closing frees the houses, giving again keeps the progress, giving to a stranger is refused
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  one jsonb;
begin
  one := public.create_walk_list('One', null, kile, pg_temp.doors(1, 5), null);
  perform public.close_walk_list((one ->> 'id')::uuid);
  assert (select status = 'done' and done_at is not null and closed_by = '00000000-0000-0000-0000-0000000000c3'
            from public.walk_lists where id = (one ->> 'id')::uuid);
  assert ((public.create_walk_list('Again', null, kile, pg_temp.doors(1, 3), null)) ->> 'left_off')::int = 0,
    'a closed list no longer holds its houses';
  perform public.create_walk_list('Two', null, kile, pg_temp.doors(6, 9), '00000000-0000-0000-0000-0000000000b2');
end $$;
reset role;
-- Two first went out a day ago, so giving it again must not start the count over.
update public.walk_lists set first_sent_at = now() - interval '1 day' where name = 'Two';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  perform public.record_door('00000000-0000-4000-8000-0000000000d1', null, null, 'not_home', null, '', '{}', '', now(), null,
                             (select id from public.walk_lists where name = 'Two'), 'TEST0000+06');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  two uuid := (select id from public.walk_lists where name = 'Two');
begin
  assert (select done from public.walk_list_counts(array[two])) = 1;
  perform public.give_walk_list(two, '00000000-0000-0000-0000-0000000000a1');
  assert (select status = 'out' and given_to = '00000000-0000-0000-0000-0000000000a1' and given_at is not null
                 and first_sent_at = now() - interval '1 day'
            from public.walk_lists where id = two), 'given again: the new holder, the same first_sent_at';
  assert (select done from public.walk_list_counts(array[two])) = 1, 'the progress stays';
  assert pg_temp.fails_with(format($q$ select public.give_walk_list(%L, %L) $q$, two, '00000000-0000-0000-0000-0000000000f6'),
    'That person isn''t on your team.');
  assert pg_temp.fails_with(format($q$ select public.give_walk_list(%L, %L) $q$, two, '00000000-0000-0000-0000-0000000000d4'),
    'That person isn''t on your team.');
  assert pg_temp.fails_with(format($q$ select public.give_walk_list(%L, %L) $q$, two, '00000000-0000-0000-0000-0000000000a9'),
    'That person isn''t on your team.');
  assert (select given_to from public.walk_lists where id = two) = '00000000-0000-0000-0000-0000000000a1', 'a refused hand-over changes nothing';
  perform public.close_walk_list(two);
  assert pg_temp.fails_with(format($q$ select public.give_walk_list(%L, %L) $q$, two, '00000000-0000-0000-0000-0000000000b2'),
    'That list is done.');
end $$;
rollback;

-- test: an agent reads their lists, doors and the visits at them; another campaign's agent reads none
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  sakaja uuid := 'ca000000-0000-4000-8000-000000000002';
  kile uuid := (select id from public.wards where campaign_id = sakaja and slug = 'kileleshwa');
  st uuid := (select id from public.polling_stations where campaign_id = sakaja and code = 'PS-0001');
begin
  perform public.create_walk_list('A', st, kile, pg_temp.doors(1, 4), '00000000-0000-0000-0000-0000000000b2');
  perform public.create_walk_list('B', null, kile, pg_temp.doors(6, 9), '00000000-0000-0000-0000-0000000000c3');
  -- Visits by the manager, from before the lists went out, at a door of each.
  insert into public.house_visits (campaign_id, client_id, pc, ward_id, outcome, visited_at, actor)
  values (sakaja, gen_random_uuid(), 'TEST0000+02', kile, 'spoke', now() - interval '2 days', '00000000-0000-0000-0000-0000000000c3'),
         (sakaja, gen_random_uuid(), 'TEST0000+07', kile, 'spoke', now() - interval '2 days', '00000000-0000-0000-0000-0000000000c3');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
declare
  a uuid := (select id from public.walk_lists where name = 'A');
begin
  assert (select count(*) from public.walk_lists) = 1, 'the agent reads the one list they hold';
  assert (select count(*) from public.walk_list_doors) = 4;
  assert (select count(*) from public.walk_list_doors(a)) = 4;
  assert (select count(*) from public.house_visits where pc = 'TEST0000+02') = 1, 'the visit at their door, by someone else';
  assert (select count(*) from public.house_visits where pc = 'TEST0000+07') = 0, 'not the visits at a door of another list';
  assert (select doors = 4 and done = 0 and centre_name is not null from public.my_walk_lists()),
    'a visit from before the list went out is not progress';
  assert (select last_outcome = 'spoke' from public.walk_list_doors(a) where pc = 'TEST0000+02');
  assert (select last_outcome is null from public.walk_list_doors(a) where pc = 'TEST0000+01');
  assert (select count(*) from public.walk_list_doors(a) where lat is not null and outline is not null) = 4;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
do $$
begin
  assert (select count(*) from public.walk_lists) = 0;
  assert (select count(*) from public.walk_list_doors) = 0;
  assert (select count(*) from public.my_walk_lists()) = 0;
  assert (select count(*) from public.house_visits where pc like 'TEST0000+%') = 0, 'Mathira''s agent reads none of Sakaja''s';
end $$;
rollback;

-- test: record_door at a list door with no person is a visit on the house, with the list
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
begin
  perform public.create_walk_list('A', null,
    (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa'),
    pg_temp.doors(1, 4), '00000000-0000-0000-0000-0000000000b2');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  list_a uuid := (select id from public.walk_lists where name = 'A');
  cid uuid := '00000000-0000-4000-8000-00000000e601';
  r jsonb;
  list_m uuid;
begin
  r := public.record_door(cid, null, null, 'not_home', null, '', '{}', '', now(), null, list_a, 'TEST0000+01');
  assert (r ->> 'repeat') = 'false' and (r -> 'person_id') = 'null'::jsonb, r::text;
  assert (select walk_list_id = list_a and person_id is null and outcome = 'not_home' and ward_id = kile
                 and pc = 'TEST0000+01' and actor = '00000000-0000-0000-0000-0000000000b2'
            from public.house_visits where client_id = cid);
  assert (public.record_door(cid, null, null, 'not_home', null, '', '{}', '', now(), null, list_a, 'TEST0000+01')) = '{"repeat": true}';
  assert (select count(*) from public.house_visits where client_id = cid) = 1;

  -- Spoke, but no one gave a name: the house alone, with the score.
  perform public.record_door(gen_random_uuid(), null, null, 'spoke', 3, 'Water', '{}', '', now(), null, list_a, 'TEST0000+02');
  assert (select person_id is null and support = 3 and issue = 'Water' and walk_list_id = list_a
            from public.house_visits where pc = 'TEST0000+02');

  -- A door that is not on the list, a list that does not exist, and another campaign's list: the same words.
  assert pg_temp.fails_with(format($q$ select public.record_door(%L, null, null, 'spoke', 3, '', '{}', '', now(), null, %L, 'TEST0000+99') $q$,
    gen_random_uuid(), list_a), 'That door isn''t on this list.');
  assert pg_temp.fails_with(format($q$ select public.record_door(%L, null, null, 'spoke', 3, '', '{}', '', now(), null, %L, 'TEST0000+01') $q$,
    gen_random_uuid(), gen_random_uuid()), 'That door isn''t on this list.');
  assert pg_temp.fails_with(format($q$ select public.record_door(%L, null, null, 'spoke', 3, '', '{}', '', now(), null, %L, null) $q$,
    gen_random_uuid(), list_a), 'That door isn''t on this list.');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', true);
  list_m := ((public.create_walk_list('M', null,
              (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000003' order by slug limit 1),
              pg_temp.doors(1, 2), null)) ->> 'id')::uuid;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  assert pg_temp.fails_with(format($q$ select public.record_door(%L, null, null, 'spoke', 3, '', '{}', '', now(), null, %L, 'TEST0000+01') $q$,
    gen_random_uuid(), list_m), 'That door isn''t on this list.');
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.person_events e join public.house_visits v on v.client_id = e.client_id),
    'no person, so no events';
  assert (select count(*) from public.house_visits where walk_list_id is not null) = 2;
end $$;
rollback;

-- test: record_door at a list door with a new person records the person, the event and the house
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
begin
  perform public.create_walk_list('A', null,
    (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa'),
    pg_temp.doors(1, 4), '00000000-0000-0000-0000-0000000000b2');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  list_a uuid := (select id from public.walk_lists where name = 'A');
  r jsonb;
begin
  r := public.record_door(gen_random_uuid(), null, '{"phone":"+254712000001","name":"Mercy","ward_id":null,"language":"sw"}',
                          'spoke', 4, '', '{}', '', now(), null, list_a, 'TEST0000+02');
  assert (r ->> 'created') = 'true';
  assert exists (select 1 from public.people where phone = '+254712000001');
  assert (select count(*) from public.person_events where kind in ('added', 'door_spoke') and person_id = (r ->> 'person_id')::uuid) = 2;
  assert (select person_id = (r ->> 'person_id')::uuid and walk_list_id = list_a and support = 4 and ward_id = kile
            from public.house_visits where pc = 'TEST0000+02' and actor = '00000000-0000-0000-0000-0000000000b2'),
    'the house takes the door and its ward, not the person''s';
  assert (select building_id = 'TEST0000+02' from public.people where id = (r ->> 'person_id')::uuid), 'the door is their home';
  -- The place the phone read names another house; the door is the house.
  perform public.record_door(gen_random_uuid(), (r ->> 'person_id')::uuid, null, 'spoke', 5, '', '{}', '', now(),
    '{"lat": -1.28, "lng": 36.78, "accuracy": 8, "buildingId": "TEST0000+03"}', list_a, 'TEST0000+04');
  assert (select count(*) from public.house_visits where pc = 'TEST0000+04' and walk_list_id = list_a) = 1;
  assert (select count(*) from public.house_visits where pc = 'TEST0000+03') = 0;
end $$;
rollback;

-- test: a knock is never refused because the list moved on
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  lid uuid;
begin
  lid := ((public.create_walk_list('A', null,
            (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa'),
            pg_temp.doors(1, 4), '00000000-0000-0000-0000-0000000000b2')) ->> 'id')::uuid;
  perform set_config('walk.a', lid::text, true);
  -- Given to someone else while the first agent's phone had no signal.
  perform public.give_walk_list(lid, '00000000-0000-0000-0000-0000000000a1');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  lid uuid := current_setting('walk.a')::uuid;
begin
  assert (select count(*) from public.walk_lists) = 0, 'the first agent no longer reads it';
  perform public.record_door('00000000-0000-4000-8000-00000000e801', null, null, 'not_home', null, '', '{}', '', now(), null, lid, 'TEST0000+02');
  assert (select walk_list_id = lid from public.house_visits where client_id = '00000000-0000-4000-8000-00000000e801');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
begin
  perform public.close_walk_list(current_setting('walk.a')::uuid);
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  lid uuid := current_setting('walk.a')::uuid;
begin
  perform public.record_door('00000000-0000-4000-8000-00000000e802', null, null, 'spoke', 3, '', '{}', '', now(), null, lid, 'TEST0000+03');
  assert (select walk_list_id = lid from public.house_visits where client_id = '00000000-0000-4000-8000-00000000e802');
end $$;
reset role;
do $$
begin
  assert (select status = 'done' and closed_by = '00000000-0000-0000-0000-0000000000c3'
            from public.walk_lists where id = current_setting('walk.a')::uuid), 'closed by hand, and it stays so';
end $$;
rollback;

-- test: the list is done once every door has a visit since it first went out, and only once
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
begin
  perform public.create_walk_list('A', null,
    (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa'),
    pg_temp.doors(1, 3), '00000000-0000-0000-0000-0000000000b2');
end $$;
reset role;
-- A visit at door 1 from before the list first went out is not progress.
insert into public.house_visits (campaign_id, client_id, pc, outcome, visited_at, actor)
values ('ca000000-0000-4000-8000-000000000002', gen_random_uuid(), 'TEST0000+01', 'spoke', now() - interval '1 hour',
        '00000000-0000-0000-0000-0000000000b2');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  list_a uuid := (select id from public.walk_lists where name = 'A');
begin
  perform public.record_door(gen_random_uuid(), null, null, 'spoke', 3, '', '{}', '', now(), null, list_a, 'TEST0000+02');
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now(), null, list_a, 'TEST0000+03');
  assert (select status from public.walk_lists where id = list_a) = 'out', 'the old visit at door 1 does not count';
  assert (select doors = 3 and done = 2 and not_home = 1 from public.walk_list_counts(array[list_a]));
  -- The last door is knocked from the ward list, with no list on the visit: it counts all the same.
  perform public.record_door(gen_random_uuid(), null, '{"phone":"+254712000002","name":"Otieno","ward_id":null}', 'spoke', 3, '', '{}', '', now(),
    '{"lat": -1.28005, "lng": 36.78, "accuracy": 8, "buildingId": "TEST0000+01"}');
  assert (select status = 'done' and done_at is not null from public.walk_lists where id = list_a);
  assert (select doors = 3 and done = 3 and not_home = 1 from public.walk_list_counts(array[list_a]));
end $$;
reset role;
-- It was done an hour ago; another visit must leave that as it was.
update public.walk_lists set done_at = now() - interval '1 hour' where name = 'A';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now(), null,
                             (select id from public.walk_lists where name = 'A'), 'TEST0000+01');
end $$;
reset role;
do $$
begin
  assert (select status = 'done' and done_at = now() - interval '1 hour' from public.walk_lists where name = 'A'), 'done once';
end $$;
rollback;

-- test: walk_list_team lists agents first with the doors still open, planning lists only the houses that matter
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  sakaja uuid := 'ca000000-0000-4000-8000-000000000002';
  kile uuid := (select id from public.wards where campaign_id = sakaja and slug = 'kileleshwa');
  manager uuid := '00000000-0000-0000-0000-0000000000c3';
begin
  perform public.create_walk_list('A', null, kile, pg_temp.doors(1, 4), '00000000-0000-0000-0000-0000000000b2');
  perform public.close_walk_list(((public.create_walk_list('C', null, kile, pg_temp.doors(20, 21), manager)) ->> 'id')::uuid);
  insert into public.house_visits (campaign_id, client_id, pc, ward_id, outcome, visited_at, actor) values
    (sakaja, gen_random_uuid(), 'TEST0000+10', kile, 'spoke', now() - interval '10 days', manager),
    (sakaja, gen_random_uuid(), 'TEST0000+11', kile, 'not_home', now() - interval '1 day', manager),
    (sakaja, gen_random_uuid(), 'TEST0000+12', kile, 'spoke', now() - interval '40 days', manager),
    (sakaja, gen_random_uuid(), 'TEST0000+13', kile, 'refused', now() - interval '2 days', manager);
end $$;
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
begin
  assert (select role = 'agent' and user_id = '00000000-0000-0000-0000-0000000000b2' and doors_open = 4 from public.walk_list_team() limit 1);
  assert (select count(*) from public.walk_list_team()) = 3, 'the candidate, the manager and the agent; not the one waiting to be admitted';
  assert (select doors_open = 0 from public.walk_list_team() where user_id = '00000000-0000-0000-0000-0000000000c3'), 'a done list has none open';
  assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+10' and spoke_or_refused_at is not null) = 1;
  assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+11' and not_home_at is not null) = 1;
  assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+12') = 0, 'only a visit 40 days ago';
  assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+13' and spoke_or_refused_at is not null) = 1, 'refused counts with spoke';
  assert (select on_list from public.walk_list_planning(kile) where pc = 'TEST0000+01') = (select id from public.walk_lists where name = 'A');
  assert (select array_agg(pc) from public.walk_list_planning(kile)) = (select array_agg(pc order by pc) from public.walk_list_planning(kile)),
    'in plus code order, so a long history pages without gaps';
  assert (select count(*) from public.walk_list_planning(kile) where pc in ('TEST0000+20', 'TEST0000+21')) = 0, 'a done list holds nothing';
  assert (select count(*) from public.walk_list_planning(kile) where pc like 'TEST0000+%') = 7,
    'four doors on the open list and three recent visits';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  assert pg_temp.fails_state($q$ select * from public.walk_list_team() $q$, '42501');
  assert pg_temp.fails_state(format($q$ select * from public.walk_list_planning(%L) $q$, (select id from public.wards limit 1)), '42501');
end $$;
rollback;

-- test: plain visits are unchanged
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  place jsonb := '{"lat": -1.26532, "lng": 36.76093, "accuracy": 8, "buildingId": "6GCRPQM6+V9F4"}';
  visit uuid := gen_random_uuid();
  r jsonb;
  pid uuid;
  h public.house_visits;
begin
  r := public.record_door(visit, null, jsonb_build_object('phone', '+254722000333', 'name', 'Atieno', 'ward_id', kile),
                          'spoke', 4, 'Water', '{}', null, now(), place);
  pid := (r ->> 'person_id')::uuid;
  assert (r ->> 'created') = 'true' and (r ->> 'repeat') = 'false' and (r ->> 'consent_blocked') = 'false', r::text;
  select * into h from public.house_visits where client_id = visit;
  assert h.pc = '6GCRPQM6+V9F4' and h.ward_id = kile and h.person_id = pid and h.walk_list_id is null;
  assert h.outcome = 'spoke' and h.support = 4 and h.issue = 'Water';
  assert (public.record_door(visit, null, jsonb_build_object('phone', '+254722000333', 'name', 'Atieno', 'ward_id', kile),
                             'spoke', 4, 'Water', '{}', null, now(), place)) = '{"repeat": true}';
  assert (select count(*) from public.house_visits where pc = '6GCRPQM6+V9F4') = 1;
  -- Without a list, a visit still needs a person; a door named without a list is ignored.
  assert pg_temp.fails_with(format($q$ select public.record_door(%L, null, null, 'not_home', null, '', '{}', '', now(), null) $q$, gen_random_uuid()),
    'Use a Kenyan mobile number like 0712 345 678.');
  perform public.record_door(gen_random_uuid(), pid, null, 'not_home', null, null, '{}', null, now(), place, null, 'TEST0000+01');
  assert (select count(*) from public.house_visits where pc = '6GCRPQM6+V9F4' and outcome = 'not_home' and walk_list_id is null) = 1;
  assert (select count(*) from public.house_visits where pc = 'TEST0000+01') = 0;
end $$;
rollback;
