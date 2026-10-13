-- The Voters map's houses: each campaign's map area, Kalonzo's wards, and the
-- doors knocked at each house (house_visits), which record_door writes and
-- house_doors() and ward_houses() count for the map's colours.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: map areas, and Kalonzo's Nairobi wards
do $$
begin
  assert (select map_area from public.campaigns where slug = 'sakaja') = 'nairobi';
  assert (select map_area from public.campaigns where slug = 'kalonzo') = 'nairobi';
  assert (select map_area from public.campaigns where slug = 'mathira') = 'nyeri/mathira';
  assert (select count(*) from public.wards
           where campaign_id = 'ca000000-0000-4000-8000-000000000001') = 85, 'Kalonzo has 85 wards';
  assert (select sum(registered_voters) from public.wards
           where campaign_id = 'ca000000-0000-4000-8000-000000000001') = 2415310,
    'the 2022 register, 2,415,310';
  assert (select count(*) from public.wards
           where campaign_id = 'ca000000-0000-4000-8000-000000000001'
             and (target_votes <> 0 or supporters <> 0)) = 0, 'no targets yet';
  assert public.groundwork_schema_version() >= 23;
end $$;

-- test: a door knocked at a house is counted against the house
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  kile uuid := (select id from public.wards
                 where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  place jsonb := '{"lat": -1.26532, "lng": 36.76093, "accuracy": 8, "buildingId": "6GCRPQM6+V9F4"}';
  visit uuid := gen_random_uuid();
  r jsonb;
  pid uuid;
  h public.house_visits;
begin
  r := public.record_door(visit, null,
         jsonb_build_object('phone', '+254722000222', 'name', 'Atieno', 'ward_id', kile),
         'spoke', 4, 'Water', '{}', null, now(), place);
  pid := (r ->> 'person_id')::uuid;
  select * into h from public.house_visits where client_id = visit;
  assert h.pc = '6GCRPQM6+V9F4' and h.ward_id = kile and h.person_id = pid;
  assert h.outcome = 'spoke' and h.support = 4 and h.issue = 'Water';
  assert h.actor = '00000000-0000-0000-0000-0000000000b2';
  assert h.campaign_id = 'ca000000-0000-4000-8000-000000000002';
  assert abs(h.lat - -1.26532) < 1e-9 and h.accuracy_m = 8;

  -- The phone sends the same visit again: nothing new anywhere.
  r := public.record_door(visit, null,
         jsonb_build_object('phone', '+254722000222', 'name', 'Atieno', 'ward_id', kile),
         'spoke', 4, 'Water', '{}', null, now(), place);
  assert (r ->> 'repeat')::boolean;
  assert (select count(*) from public.house_visits where pc = '6GCRPQM6+V9F4') = 1;

  -- Nobody home: no score and no issue on the house.
  r := public.record_door(gen_random_uuid(), pid, null, 'not_home', 3, 'Roads', '{}', null, now(), place);
  assert (select count(*) from public.house_visits
           where pc = '6GCRPQM6+V9F4' and outcome = 'not_home'
             and support is null and issue is null) = 1;

  -- No house in the place: nothing counted against a house.
  r := public.record_door(gen_random_uuid(), pid, null, 'spoke', 5, null, '{}', null, now(),
         '{"lat": -1.26532, "lng": 36.76093, "accuracy": 8}');
  assert (select count(*) from public.house_visits where person_id = pid) = 2;
end $$;
rollback;

-- test: the office reads every door, an agent the ones they knocked, another campaign none
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
insert into public.house_visits (client_id, pc, outcome, visited_at)
values (gen_random_uuid(), '6GCRPQM6+2A', 'not_home', now());
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.house_visits (client_id, pc, outcome, visited_at)
values (gen_random_uuid(), '6GCRPQM6+3B', 'refused', now());
do $$
begin
  assert (select count(*) from public.house_visits) = 2, 'the manager reads both';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  assert (select count(*) from public.house_visits) = 1, 'the agent reads their own';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$
begin
  assert (select count(*) from public.house_visits) = 0, 'Mathira reads none of Sakaja''s';
end $$;
rollback;

-- test: nobody records a door as someone else, for another campaign, or changes one
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  assert pg_temp.fails_with(
    $q$insert into public.house_visits (client_id, pc, outcome, visited_at, actor)
       values (gen_random_uuid(), '6GCRPQM6+2A', 'spoke', now(), '00000000-0000-0000-0000-0000000000c3')$q$,
    'new row violates row-level security policy for table "house_visits"');
  assert pg_temp.fails_with(
    $q$insert into public.house_visits (campaign_id, client_id, pc, outcome, visited_at)
       values ('ca000000-0000-4000-8000-000000000003', gen_random_uuid(), '6GCRPQM6+2A', 'spoke', now())$q$,
    'new row violates row-level security policy "own campaign only" for table "house_visits"');
  assert pg_temp.fails_with(
    $q$update public.house_visits set outcome = 'spoke'$q$,
    'permission denied for table house_visits');
end $$;
rollback;

-- test: doors per ward and per house come from each house's latest visit in 30 days
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.house_visits (client_id, pc, ward_id, outcome, support, visited_at)
select gen_random_uuid(), v.pc, w.id, v.outcome, v.support, now() - v.age
  from (values ('6GCRPQM6+2A', 'kileleshwa', 'spoke', 5, interval '40 days'),
               ('6GCRPQM6+2A', 'kileleshwa', 'not_home', null, interval '2 days'),
               ('6GCRPQM6+3B', 'kileleshwa', 'spoke', 4, interval '1 day'),
               ('6GCRPQM6+5D', 'kawangware', 'refused', null, interval '0 days')
       ) as v(pc, ward, outcome, support, age)
  join public.wards w on w.slug = v.ward and w.campaign_id = 'ca000000-0000-4000-8000-000000000002';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
insert into public.house_visits (client_id, pc, ward_id, outcome, support, visited_at)
select gen_random_uuid(), '6GCRPQM6+4C', w.id, 'spoke', 2, now()
  from public.wards w
 where w.slug = 'kileleshwa' and w.campaign_id = 'ca000000-0000-4000-8000-000000000002';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  kile uuid := (select id from public.wards
                 where slug = 'kileleshwa' and campaign_id = 'ca000000-0000-4000-8000-000000000002');
  d record;
begin
  select * into d from public.house_doors() where ward_id = kile;
  assert d.knocked = 3 and d.rated = 2 and d.supporters = 1, 'A, B and C; B and C scored; B a supporter';
  assert d.doors_week = 3, 'three doors this week: the visit 40 days ago is older';
  assert d.agents_today = array['00000000-0000-0000-0000-0000000000b2'::uuid], 'only C was knocked today';
  assert (select string_agg(pc || ' ' || outcome, ', ' order by pc) from public.ward_houses(kile))
         = '6GCRPQM6+2A not_home, 6GCRPQM6+3B spoke, 6GCRPQM6+4C spoke';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
declare
  kile uuid := (select id from public.wards
                 where slug = 'kileleshwa' and campaign_id = 'ca000000-0000-4000-8000-000000000002');
  kawa uuid := (select id from public.wards
                 where slug = 'kawangware' and campaign_id = 'ca000000-0000-4000-8000-000000000002');
  d record;
begin
  select * into d from public.house_doors() where ward_id = kile;
  assert d.knocked = 1 and d.rated = 1 and d.supporters = 0, 'the agent counts the door they knocked';
  assert not exists (select 1 from public.house_doors() where ward_id = kawa),
    'and not the manager''s door in Kawangware';
end $$;
rollback;
