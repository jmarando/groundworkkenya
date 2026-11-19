-- Meru (a county woman representative's race): the campaign and its 45 wards, the spending
-- limit, IEBC's polling centres, the woman rep race in the atlas and the Meru figures it reads.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: the campaign, its wards' voters and boxes, and the gazetted spending limit
do $$
begin
  assert (select level from public.campaigns where slug = 'meru') = 'woman-rep',
         'a woman rep race, as the admin form writes it';
  assert (select seat from public.campaigns where slug = 'meru') = 'Woman Rep · Meru', 'its seat';
  assert (select map_area from public.campaigns where slug = 'meru') = 'meru', 'the county''s map';
  assert (select name from public.campaigns where slug = 'meru') = 'Meru 2027', 'its name';
  assert (select candidate from public.campaigns where slug = 'meru') is null,
         'its candidate is named when it is applied, not in this public repository';
  assert (select host from public.campaigns where slug = 'meru') = 'meru.groundwork.ke', 'its console host';
  assert (select spending_limit_kes from public.campaigns where slug = 'meru') = 80000292,
         'Meru''s county limit';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'meru') = 45, '45 wards';
  assert (select count(distinct w.constituency) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'meru') = 9, 'in nine constituencies';
  assert (select sum(w.registered_voters) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'meru') = 772139, 'IEBC''s 2022 register for the county';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'meru' and (w.west is null or w.north is null)) = 0, 'every ward has its box';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'athwana') = 1, 'Athwana''s own campaign keeps its one ward';
end $$;

-- test: IEBC's centres load once, however often the campaign and centre migrations run
begin;
\ir ../../supabase/migrations/20261119090100_meru_campaign.sql
\ir ../../supabase/migrations/20261119090400_polling_centres_meru.sql
do $$
begin
  assert (select count(*) from public.campaigns where slug = 'meru') = 1, 'one campaign';
  assert (select count(*) from public.wards w join public.campaigns c on c.id = w.campaign_id
           where c.slug = 'meru') = 45, 'still 45 wards';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'meru') = 1043, '1,043 polling centres';
  assert (select sum(s.streams) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'meru') = 1639, '1,639 streams';
  assert (select sum(s.registered_voters) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'meru') = 772139, 'the centres add up to the register';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'meru' and s.iebc_code like '012%') = 1043, 'all carry IEBC''s 012 prefix';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'meru' and s.lat is not null) = 30, 'the 30 OpenStreetMap placed';
  assert (select count(*) from public.polling_stations s join public.campaigns c on c.id = s.campaign_id
           where c.slug = 'athwana') = 14, 'Athwana''s campaign keeps its own 14 centres';
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
   where c.slug = 'meru'
     and w.registered_voters <> (select coalesce(sum(s.registered_voters), 0)
                                   from public.polling_stations s where s.ward_id = w.id);
  assert bad is null, 'wards whose centres do not add up: ' || coalesce(bad, '');
end $$;

-- test: the woman rep is an atlas race, and the Meru atlas holds the county, the register and the races
do $$
begin
  assert (select count(*) from public.atlas_elections where race = 'woman_rep') = 3,
         'the 2013, 2017 and 2022 woman rep races';
  assert (select count(*) from public.atlas_areas where parent = 'meru' and level = 'constituency') = 9,
         'nine atlas constituencies';
  assert (select count(*) from public.atlas_areas a join public.atlas_areas p on p.key = a.parent
           where p.parent = 'meru' and a.level = 'ward') = 45, '45 atlas wards';
  assert (select registered from public.atlas_register where area_key = 'meru' and year = 2022) = 772139,
         'the 2022 register';
  assert (select sum(r.registered) from public.atlas_register r join public.atlas_areas a on a.key = r.area_key
           where a.parent = 'meru' and a.level = 'constituency' and r.year = 2022) = 772139,
         'its constituencies add up to it';
  assert (select r.votes from public.atlas_results r join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2022-woman_rep' and c.seat = 'meru'
             and c.name = 'Elizabeth Karambu Kailemia' and r.area_key = 'meru') = 259445,
         'the 2022 winner''s votes, as Gazette 9951 gives them';
  assert (select count(*) from public.atlas_candidates where election_id = '2017-woman_rep' and seat = 'meru') = 6,
         'six candidates in 2017';
  assert (select sum(r.votes) from public.atlas_results r join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2017-woman_rep' and c.seat = 'meru')
       = (select valid from public.atlas_turnout where election_id = '2017-woman_rep' and area_key = 'meru'),
         'the 2017 votes add up to the valid total';
  assert (select count(*) from public.atlas_turnout where election_id = '2022-woman_rep' and area_key = 'meru') = 0,
         'no 2022 valid total: only the four leading candidates are on file';
  assert (select sum(r.votes) from public.atlas_results r join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2022-president' and r.area_key = 'meru')
       = (select valid from public.atlas_turnout where election_id = '2022-president' and area_key = 'meru'),
         'the presidential vote adds up to Form 34C''s valid total';
  assert (select bloc from public.atlas_candidates where election_id = '2022-governor' and seat = 'meru'
             and name = 'Kiraitu Murungi') = 'Azimio', 'DEP stood in Azimio';
end $$;

-- test: the atlas refuses a race it doesn't know
do $$
begin
  begin
    insert into public.atlas_elections (id, year, race, held_on) values ('2022-senator', 2022, 'senator', '2022-08-09');
    assert false, 'a senator race is not an atlas race';
  exception when check_violation then
    null;
  end;
end $$;
