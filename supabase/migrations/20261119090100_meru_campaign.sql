-- Meru: the county woman representative's race, a county campaign as Nairobi's governor
-- campaign is. Its 45 wards come from the county's ward map (public/geo/meru-wards.json,
-- geoBoundaries), each with the registered voters IEBC's 2022 register by polling station gives
-- it (772,139 in all) and its constituency. The atlas's county (20261119090200) and the polling
-- centres (20261119090400) follow. Safe to run again. No schema change.
--
-- The candidate is not named here: this repository is public. Set campaigns.candidate (and the
-- campaign's name) when this is applied, and the demo carries the name (src/lib/demo forCampaign).

insert into public.campaigns (id, slug, name, candidate, seat, level, host, map_area) values
  ('ca000000-0000-4000-8000-000000000008', 'meru', 'Meru 2027', null,
   'Woman Rep · Meru', 'woman-rep', 'meru.groundwork.ke', 'meru')
on conflict (id) do nothing;

-- The limit IEBC gazetted for the county's seats (data/kenya/limits-2027-counties.csv, code 012:
-- governor, senator and woman representative share it), as 20261020090000 sets the others'.
update public.campaigns
   set spending_limit_kes = 80000292,
       spending_limit_source = 'IEBC, Kenya Gazette Notice 12251, 7 August 2026: County Woman Representative, Meru'
 where slug = 'meru' and spending_limit_kes is null;

insert into public.wards
  (campaign_id, slug, name, constituency, registered_voters, target_votes, supporters,
   west, south, east, north)
select v.campaign_id, v.slug, v.name, v.constituency, v.registered, 0, 0,
       v.west, v.south, v.east, v.north
  from (values
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kibirichia', 'Kibirichia', 'Buuri', 14840, 37.30843, -0.15184, 37.58318, 0.23713),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kiirua-naari', 'Kiirua/Naari', 'Buuri', 15690, 37.51869, 0.04389, 37.61106, 0.29577),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kisima', 'Kisima', 'Buuri', 18075, 37.24503, -0.00106, 37.53652, 0.29602),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'ruiri-rwarera', 'Ruiri/Rwarera', 'Buuri', 11521, 37.54806, 0.12910, 37.67715, 0.32740),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'timau', 'Timau', 'Buuri', 22215, 37.09280, -0.05317, 37.30311, 0.09849),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'abothuguchi-central', 'Abothuguchi Central', 'Central Imenti', 24397, 37.62751, -0.06644, 37.74133, 0.01084),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'abothuguchi-west', 'Abothuguchi West', 'Central Imenti', 24723, 37.30843, -0.15184, 37.64633, 0.05252),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kiagu', 'Kiagu', 'Central Imenti', 12318, 37.69751, -0.13246, 37.92988, -0.01163),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'mwanganthia', 'Mwanganthia', 'Central Imenti', 15057, 37.68127, -0.07283, 37.84713, 0.01101),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'akirang-ondu', 'Akirang''ondu', 'Igembe Central', 15637, 37.81071, 0.27130, 37.95783, 0.40747),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'athiru-ruujine', 'Athiru Ruujine', 'Igembe Central', 19920, 37.94937, 0.23832, 38.16993, 0.32103),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'igembe-east', 'Igembe East', 'Igembe Central', 19964, 37.97170, 0.11719, 38.30513, 0.33011),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kangeta', 'Kangeta', 'Igembe Central', 16103, 37.72757, 0.23883, 37.92096, 0.54025),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'njia', 'Njia', 'Igembe Central', 21810, 37.74994, 0.24947, 37.94392, 0.56614),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'amwathi', 'Amwathi', 'Igembe North', 19121, 37.96136, 0.36432, 38.16217, 0.67661),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'antuambui', 'Antuambui', 'Igembe North', 17113, 37.82716, 0.31019, 37.98879, 0.59917),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'antubetwe-kiongo', 'Antubetwe Kiongo', 'Igembe North', 15108, 37.96183, 0.30421, 38.17723, 0.37675),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'naathu', 'Naathu', 'Igembe North', 13879, 37.89470, 0.35369, 38.01774, 0.63887),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'ntunene', 'Ntunene', 'Igembe North', 11829, 37.77467, 0.31199, 37.97053, 0.46300),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'akachiu', 'Akachiu', 'Igembe South', 14371, 37.90198, 0.06382, 37.99970, 0.21105),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'athiru-gaiti', 'Athiru Gaiti', 'Igembe South', 14443, 37.95202, -0.09010, 38.41099, 0.23493),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kanuni', 'Kanuni', 'Igembe South', 14585, 37.94114, 0.01079, 38.27885, 0.20456),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kiegoi-antubochiu', 'Kiegoi/Antubochiu', 'Igembe South', 16514, 37.89508, 0.19128, 37.96416, 0.25309),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'maua', 'Maua', 'Igembe South', 17213, 37.92984, 0.22564, 37.98315, 0.28253),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'municipality', 'Municipality', 'North Imenti', 23655, 37.58607, 0.04604, 37.65423, 0.13086),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'ntima-east', 'Ntima East', 'North Imenti', 14904, 37.65167, 0.00581, 37.70329, 0.06043),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'ntima-west', 'Ntima West', 'North Imenti', 19161, 37.59260, 0.00022, 37.68822, 0.07033),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'nyaki-east', 'Nyaki East', 'North Imenti', 17329, 37.68371, -0.05732, 37.93800, 0.11014),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'nyaki-west', 'Nyaki West', 'North Imenti', 21192, 37.63564, 0.04008, 37.71385, 0.14878),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'abogeta-east', 'Abogeta East', 'South Imenti', 21169, 37.63678, -0.17245, 37.79413, -0.07656),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'abogeta-west', 'Abogeta West', 'South Imenti', 19074, 37.30843, -0.18369, 37.65763, -0.03504),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'igoji-east', 'Igoji East', 'South Imenti', 18203, 37.63861, -0.21082, 37.76688, -0.14644),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'igoji-west', 'Igoji West', 'South Imenti', 12496, 37.57093, -0.21929, 37.66554, -0.14363),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'mitunguu', 'Mitunguu', 'South Imenti', 14078, 37.67448, -0.18960, 37.86551, -0.06231),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'nkuene', 'Nkuene', 'South Imenti', 30622, 37.15970, -0.15184, 37.67928, 0.03824),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'karama', 'Karama', 'Tigania East', 12810, 37.67582, 0.20050, 37.84730, 0.52375),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kiguchwa', 'Kiguchwa', 'Tigania East', 11544, 37.82607, 0.12755, 37.91212, 0.24955),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'mikinduri', 'Mikinduri', 'Tigania East', 18246, 37.80888, 0.02353, 37.90570, 0.13715),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'muthara', 'Muthara', 'Tigania East', 19902, 37.60881, 0.16721, 37.84515, 0.51101),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'thangatha', 'Thangatha', 'Tigania East', 21025, 37.86419, 0.00725, 37.98261, 0.19637),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'akithii', 'Akithii', 'Tigania West', 16709, 37.63863, 0.12840, 37.84644, 0.27812),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'athwana', 'Athwana', 'Tigania West', 9123, 37.58195, 0.19626, 37.78219, 0.48731),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'kianjai', 'Kianjai', 'Tigania West', 21037, 37.57307, 0.10750, 37.82338, 0.33518),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'mbeu', 'Mbeu', 'Tigania West', 10384, 37.76742, 0.00040, 37.89149, 0.10807),
    ('ca000000-0000-4000-8000-000000000008'::uuid, 'nkomo', 'Nkomo', 'Tigania West', 13030, 37.67715, 0.07794, 37.80681, 0.16643)
  ) as v(campaign_id, slug, name, constituency, registered, west, south, east, north)
 where not exists (select 1 from public.wards w where w.campaign_id = v.campaign_id and w.slug = v.slug);
