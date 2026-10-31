-- Kuria East: Monica Keriario's MP race, a demo workspace built the way Githunguri's was.
-- The five wards come from their map (public/geo/kuria-east-wards.json, geoBoundaries) with the
-- registered voters IEBC's 2022 register gives each (41,976 in all). Their polling centres follow
-- in 20261109090300, once the atlas holds the county. Safe to run again. No schema change.

insert into public.campaigns (id, slug, name, candidate, seat, level, host, map_area) values
  ('ca000000-0000-4000-8000-000000000007', 'kuria-east', 'Keriario 2027', 'Monica Keriario',
   'MP · Kuria East', 'mp', 'kuria-east.groundwork.ke', 'migori/kuria-east')
on conflict (id) do nothing;

-- The limit IEBC gazetted for the seat (data/kenya/limits-2027-constituencies.csv, code 260), as
-- 20261020090000 sets the other campaigns'.
update public.campaigns
   set spending_limit_kes = 18940937,
       spending_limit_source = 'IEBC, Kenya Gazette Notice 12251, 7 August 2026: Member of the National Assembly, Kuria East'
 where slug = 'kuria-east' and spending_limit_kes is null;

insert into public.wards
  (campaign_id, slug, name, constituency, registered_voters, target_votes, supporters,
   west, south, east, north)
select v.campaign_id, v.slug, v.name, v.constituency, v.registered, 0, 0,
       v.west, v.south, v.east, v.north
  from (values
    ('ca000000-0000-4000-8000-000000000007'::uuid, 'gokeharaka-getambwega', 'Gokeharaka/Getambwega', 'Kuria East', 7962, 34.5146, -1.30504, 34.60129, -1.21912),
    ('ca000000-0000-4000-8000-000000000007'::uuid, 'ntimaru-east', 'Ntimaru East', 'Kuria East', 5591, 34.67445, -1.35296, 34.71975, -1.26871),
    ('ca000000-0000-4000-8000-000000000007'::uuid, 'ntimaru-west', 'Ntimaru West', 'Kuria East', 8628, 34.6401, -1.38981, 34.73045, -1.30093),
    ('ca000000-0000-4000-8000-000000000007'::uuid, 'nyabasi-east', 'Nyabasi East', 'Kuria East', 8930, 34.62864, -1.33136, 34.69935, -1.20046),
    ('ca000000-0000-4000-8000-000000000007'::uuid, 'nyabasi-west', 'Nyabasi West', 'Kuria East', 10865, 34.58215, -1.33665, 34.6712, -1.16306)
  ) as v(campaign_id, slug, name, constituency, registered, west, south, east, north)
 where not exists (select 1 from public.wards w where w.campaign_id = v.campaign_id and w.slug = v.slug);
