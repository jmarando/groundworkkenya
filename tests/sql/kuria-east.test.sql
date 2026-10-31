-- Kuria East (an MP race, a demo workspace): the campaign and its five wards, the
-- spending limit, IEBC's polling centres, and the Migori atlas figures it reads. Run with
-- tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: the campaign, its wards' voters and boxes, and the gazetted spending limit
do $$
begin
  assert (select level from public.campaigns where slug = 'kuria-east') = 'mp', 'an MP race';
  assert (select map_area from public.campaigns where slug = 'kuria-east') = 'migori/kuria-east', 'its map area';
  assert (select name from public.campaigns where slug = 'kuria-east') = 'Kuria East 2027', 'its name';
  assert (select candidate from public.campaigns where slug = 'kuria-east') is null,
         'its candidate is named when it is applied, not in this public repository';
  assert (select host from public.campaigns where slug = 'kuria-east') = 'kuria-east.groundwork.ke', 'its console host';
  assert (select spending_limit_kes from public.campaigns where slug = 'kuria-east') = 18940937, 'Kuria East''s limit';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'kuria-east') = 5, 'five wards';
  assert (select sum(w.registered_voters) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'kuria-east') = 41976, 'IEBC''s 2022 register for the constituency';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'kuria-east' and (w.west is null or w.north is null)) = 0, 'every ward has its box';
end $$;

-- test: IEBC's centres load once, however often the campaign and centre migrations run
begin;
\ir ../../supabase/migrations/20261109090000_kuria_east_campaign.sql
\ir ../../supabase/migrations/20261109090300_polling_centres_kuria_east.sql
do $$
begin
  assert (select count(*) from public.campaigns where slug = 'kuria-east') = 1, 'one campaign';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'kuria-east') = 5, 'still five wards';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'kuria-east') = 75, '75 polling centres';
  assert (select sum(s.streams) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'kuria-east') = 92, '92 streams';
  assert (select sum(s.registered_voters) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'kuria-east') = 41976, 'the centres add up to the register';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'kuria-east' and s.iebc_code like '044260%') = 75, 'all carry IEBC''s 044260 prefix';
end $$;
rollback;

-- test: a ward's centres add up to the voters its ward holds
do $$
declare
  bad text;
begin
  select string_agg(w.slug, ', ') into bad
    from public.wards w
    join public.campaigns c on c.id = w.campaign_id
   where c.slug = 'kuria-east'
     and w.registered_voters <> (select coalesce(sum(s.registered_voters), 0)
                                   from public.polling_stations s where s.ward_id = w.id);
  assert bad is null, 'wards whose centres do not add up: ' || coalesce(bad, '');
end $$;

-- test: the Migori atlas holds the constituency, its wards, the register and the races
do $$
begin
  assert (select count(*) from public.atlas_areas where parent = 'migori/kuria-east' and level = 'ward') = 5, 'five atlas wards';
  assert (select registered from public.atlas_register where area_key = 'migori/kuria-east' and year = 2022) = 41976, 'the 2022 register';
  assert (select sum(r.registered) from public.atlas_register r join public.atlas_areas a on a.key = r.area_key
           where a.parent = 'migori/kuria-east' and r.year = 2022) = 41976, 'its wards add up to it';
  assert (select r.votes from public.atlas_results r join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2022-mp' and c.seat = 'migori/kuria-east' and r.area_key = 'migori/kuria-east') = 15362,
         'the 2022 winner''s votes';
  assert (select count(*) from public.atlas_candidates where election_id = '2017-mp' and seat = 'migori/kuria-east') = 8,
         'eight candidates in 2017';
  assert (select sum(r.votes) from public.atlas_results r join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2017-mp' and c.seat = 'migori/kuria-east')
       = (select valid from public.atlas_turnout where election_id = '2017-mp' and area_key = 'migori/kuria-east'),
         'the 2017 votes add up to the valid total';
  assert (select sum(r.votes) from public.atlas_results r join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2022-president' and r.area_key = 'migori/kuria-east') = 29032,
         'the four presidential candidates, as The Star printed them';
end $$;
