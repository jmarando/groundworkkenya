-- The election atlas's measured indicators for kenya, migori, from data/atlas.
-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.

insert into public.atlas_sources (id, title, publisher, url, note) values
  ('google-open-buildings-v3', 'Open Buildings v3: building footprints', 'Google Open Buildings', 'https://sites.research.google/gr/open-buildings/', 'Footprints at confidence 0.65 or more, each counted in the ward its centre falls in, measured from the Voters map''s house files (outlines to about 0.6 m) (CC BY 4.0). Small structures are under 40 m², large buildings 200 m² or more.'),
  ('geoboundaries-ken-adm3', 'geoBoundaries Kenya ADM3 (wards)', 'geoBoundaries', 'https://www.geoboundaries.org/', 'Ward boundaries (Omare & Omare 2020, CC BY 4.0), simplified to about 3 m for the ward maps; areas are measured from them.')
on conflict (id) do update set title = excluded.title, publisher = excluded.publisher, url = excluded.url, note = excluded.note;

insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values
  ('migori/kuria-east/gokeharaka-getambwega', 'area_km2', 2020, 52.807, 'geoboundaries-ken-adm3'),
  ('migori/kuria-east/gokeharaka-getambwega', 'buildings', 2023, 13984, 'google-open-buildings-v3'),
  ('migori/kuria-east/gokeharaka-getambwega', 'buildings_per_km2', 2023, 265, 'google-open-buildings-v3'),
  ('migori/kuria-east/gokeharaka-getambwega', 'median_building_m2', 2023, 34, 'google-open-buildings-v3'),
  ('migori/kuria-east/gokeharaka-getambwega', 'small_building_share', 2023, 0.638, 'google-open-buildings-v3'),
  ('migori/kuria-east/gokeharaka-getambwega', 'large_building_share', 2023, 0.012, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-east', 'area_km2', 2020, 24.29, 'geoboundaries-ken-adm3'),
  ('migori/kuria-east/ntimaru-east', 'buildings', 2023, 10524, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-east', 'buildings_per_km2', 2023, 433, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-east', 'median_building_m2', 2023, 39, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-east', 'small_building_share', 2023, 0.511, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-east', 'large_building_share', 2023, 0.007, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-west', 'area_km2', 2020, 33.112, 'geoboundaries-ken-adm3'),
  ('migori/kuria-east/ntimaru-west', 'buildings', 2023, 16461, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-west', 'buildings_per_km2', 2023, 497, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-west', 'median_building_m2', 2023, 39, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-west', 'small_building_share', 2023, 0.507, 'google-open-buildings-v3'),
  ('migori/kuria-east/ntimaru-west', 'large_building_share', 2023, 0.013, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-east', 'area_km2', 2020, 55.356, 'geoboundaries-ken-adm3'),
  ('migori/kuria-east/nyabasi-east', 'buildings', 2023, 16020, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-east', 'buildings_per_km2', 2023, 289, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-east', 'median_building_m2', 2023, 36, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-east', 'small_building_share', 2023, 0.544, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-east', 'large_building_share', 2023, 0.012, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-west', 'area_km2', 2020, 78.573, 'geoboundaries-ken-adm3'),
  ('migori/kuria-east/nyabasi-west', 'buildings', 2023, 21909, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-west', 'buildings_per_km2', 2023, 279, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-west', 'median_building_m2', 2023, 36, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-west', 'small_building_share', 2023, 0.55, 'google-open-buildings-v3'),
  ('migori/kuria-east/nyabasi-west', 'large_building_share', 2023, 0.015, 'google-open-buildings-v3'),
  ('migori/kuria-east', 'area_km2', 2020, 244.138, 'geoboundaries-ken-adm3'),
  ('migori/kuria-east', 'buildings', 2023, 78898, 'google-open-buildings-v3'),
  ('migori/kuria-east', 'buildings_per_km2', 2023, 323, 'google-open-buildings-v3'),
  ('migori/kuria-east', 'median_building_m2', 2023, 37, 'google-open-buildings-v3'),
  ('migori/kuria-east', 'small_building_share', 2023, 0.55, 'google-open-buildings-v3'),
  ('migori/kuria-east', 'large_building_share', 2023, 0.012, 'google-open-buildings-v3')
on conflict (area_key, indicator, year) do update set value = excluded.value, source_id = excluded.source_id;
