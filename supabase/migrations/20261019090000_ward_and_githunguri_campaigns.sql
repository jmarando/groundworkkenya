-- Three more campaigns: Githunguri's MP race, and the Roysambu and Athwana ward (MCA) races.
-- Roysambu's map is its ward alone (src/lib/map-areas.ts): the ward and its five centres are
-- copied from IEBC's 2022 register, as Nairobi's campaigns hold them. Githunguri's and Athwana's
-- wards come from their maps; their polling centres wait for IEBC's register. Safe to run again.
-- No schema change.

insert into public.campaigns (id, slug, name, candidate, seat, level, host, map_area) values
  ('ca000000-0000-4000-8000-000000000004', 'githunguri', 'Wamuchomba 2027', 'Gathoni Wamuchomba',
   'MP · Githunguri', 'mp', 'githunguri.groundwork.ke', 'kiambu/githunguri'),
  ('ca000000-0000-4000-8000-000000000005', 'roysambu', 'Roysambu Ward', null,
   'MCA · Roysambu', 'mca', 'roysambu.groundwork.ke', 'nairobi/roysambu/roysambu'),
  ('ca000000-0000-4000-8000-000000000006', 'athwana', 'Athwana Ward', null,
   'MCA · Athwana', 'mca', 'athwana.groundwork.ke', 'meru/tigania-west/athwana')
on conflict (id) do nothing;

-- Roysambu ward, as the Nairobi register gives it (data/stations/nairobi.csv: 5 centres,
-- 47 streams, 31,158 voters), with its outline's box.
insert into public.wards
  (campaign_id, slug, name, constituency, registered_voters, target_votes, supporters,
   west, south, east, north)
select 'ca000000-0000-4000-8000-000000000005', 'roysambu', 'Roysambu', 'Roysambu', 31158, 0, 0,
       36.82993, -1.26095, 36.89729, -1.20251
 where not exists (select 1 from public.wards
                    where campaign_id = 'ca000000-0000-4000-8000-000000000005' and slug = 'roysambu');

insert into public.polling_stations
  (campaign_id, code, iebc_code, name, ward_id, registered_voters, streams, lat, lng, placed_by,
   placed_at)
select w.campaign_id, v.code, v.iebc_code, v.name, w.id, v.registered, v.streams,
       v.lat::double precision, v.lng::double precision, v.placed_by,
       case when v.lat is null then null else now() end
  from (values
    ('0472791394013', 'PS-0145', 'MUTHAIGA PRIMARY SCHOOL', 2, 1380, -1.257969, 36.846443, 'osm'),
    ('0472791394014', 'PS-0146', 'THIKA ROAD PRIMARY SCHOOL', 6, 3879, -1.253346, 36.855523, 'osm'),
    ('0472791394015', 'PS-0147', 'GARDEN ESTATE PRIMARY SCHOOL', 13, 8914, -1.226375, 36.866788, 'osm'),
    ('0472791394016', 'PS-0148', 'MARURUI PRIMARY SCHOOL', 13, 8524, -1.210631, 36.86444, 'osm'),
    ('0472791394017', 'PS-0149', 'INDEPENDENT PRESBYTERIAN CHURCH COMPOUND', 13, 8461, null, null, null)
  ) as v(iebc_code, code, name, streams, registered, lat, lng, placed_by)
  join public.wards w
    on w.campaign_id = 'ca000000-0000-4000-8000-000000000005' and w.slug = 'roysambu'
on conflict (campaign_id, iebc_code) where iebc_code is not null do nothing;

-- Githunguri's five wards and Athwana, with their outlines' boxes (public/geo, geoBoundaries).
-- Their registered voters wait for IEBC's register, which isn't read for them yet.
insert into public.wards
  (campaign_id, slug, name, constituency, registered_voters, target_votes, supporters,
   west, south, east, north)
select v.campaign_id, v.slug, v.name, v.constituency, 0, 0, 0, v.west, v.south, v.east, v.north
  from (values
    ('ca000000-0000-4000-8000-000000000004'::uuid, 'githiga', 'Githiga', 'Githunguri', 36.67499, -1.10857, 36.76734, -1.0414),
    ('ca000000-0000-4000-8000-000000000004'::uuid, 'githunguri', 'Githunguri', 'Githunguri', 36.74054, -1.09441, 36.82897, -1.03429),
    ('ca000000-0000-4000-8000-000000000004'::uuid, 'ikinu', 'Ikinu', 'Githunguri', 36.76146, -1.12327, 36.85804, -1.08352),
    ('ca000000-0000-4000-8000-000000000004'::uuid, 'komothai', 'Komothai', 'Githunguri', 36.77326, -1.08632, 36.89804, -0.9757),
    ('ca000000-0000-4000-8000-000000000004'::uuid, 'ngewa', 'Ngewa', 'Githunguri', 36.79897, -1.1109, 36.88592, -1.0296),
    ('ca000000-0000-4000-8000-000000000006'::uuid, 'athwana', 'Athwana', 'Tigania West', 37.58195, 0.19626, 37.78219, 0.48731)
  ) as v(campaign_id, slug, name, constituency, west, south, east, north)
 where not exists (select 1 from public.wards w where w.campaign_id = v.campaign_id and w.slug = v.slug);
