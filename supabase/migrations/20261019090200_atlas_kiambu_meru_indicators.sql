-- The election atlas's measured indicators for kenya, kiambu, meru, from data/atlas.
-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.

insert into public.atlas_sources (id, title, publisher, url, note) values
  ('google-open-buildings-v3', 'Open Buildings v3: building footprints', 'Google Open Buildings', 'https://sites.research.google/gr/open-buildings/', 'Footprints at confidence 0.65 or more, each counted in the ward its centre falls in, measured from the Voters map''s house files (outlines to about 0.6 m) (CC BY 4.0). Small structures are under 40 m², large buildings 200 m² or more.'),
  ('geoboundaries-ken-adm3', 'geoBoundaries Kenya ADM3 (wards)', 'geoBoundaries', 'https://www.geoboundaries.org/', 'Ward boundaries (Omare & Omare 2020, CC BY 4.0), simplified to about 3 m for the ward maps; areas are measured from them.')
on conflict (id) do update set title = excluded.title, publisher = excluded.publisher, url = excluded.url, note = excluded.note;

insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values
  ('kiambu/githunguri/githiga', 'area_km2', 2020, 40.163, 'geoboundaries-ken-adm3'),
  ('kiambu/githunguri/githiga', 'buildings', 2023, 32555, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githiga', 'buildings_per_km2', 2023, 811, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githiga', 'median_building_m2', 2023, 28, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githiga', 'small_building_share', 2023, 0.642, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githiga', 'large_building_share', 2023, 0.015, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githunguri', 'area_km2', 2020, 36.191, 'geoboundaries-ken-adm3'),
  ('kiambu/githunguri/githunguri', 'buildings', 2023, 34711, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githunguri', 'buildings_per_km2', 2023, 959, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githunguri', 'median_building_m2', 2023, 29, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githunguri', 'small_building_share', 2023, 0.624, 'google-open-buildings-v3'),
  ('kiambu/githunguri/githunguri', 'large_building_share', 2023, 0.017, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ikinu', 'area_km2', 2020, 21.988, 'geoboundaries-ken-adm3'),
  ('kiambu/githunguri/ikinu', 'buildings', 2023, 22528, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ikinu', 'buildings_per_km2', 2023, 1025, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ikinu', 'median_building_m2', 2023, 29, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ikinu', 'small_building_share', 2023, 0.624, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ikinu', 'large_building_share', 2023, 0.012, 'google-open-buildings-v3'),
  ('kiambu/githunguri/komothai', 'area_km2', 2020, 42.176, 'geoboundaries-ken-adm3'),
  ('kiambu/githunguri/komothai', 'buildings', 2023, 30335, 'google-open-buildings-v3'),
  ('kiambu/githunguri/komothai', 'buildings_per_km2', 2023, 719, 'google-open-buildings-v3'),
  ('kiambu/githunguri/komothai', 'median_building_m2', 2023, 27, 'google-open-buildings-v3'),
  ('kiambu/githunguri/komothai', 'small_building_share', 2023, 0.654, 'google-open-buildings-v3'),
  ('kiambu/githunguri/komothai', 'large_building_share', 2023, 0.013, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ngewa', 'area_km2', 2020, 30.177, 'geoboundaries-ken-adm3'),
  ('kiambu/githunguri/ngewa', 'buildings', 2023, 22641, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ngewa', 'buildings_per_km2', 2023, 750, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ngewa', 'median_building_m2', 2023, 29, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ngewa', 'small_building_share', 2023, 0.613, 'google-open-buildings-v3'),
  ('kiambu/githunguri/ngewa', 'large_building_share', 2023, 0.017, 'google-open-buildings-v3'),
  ('kiambu/githunguri', 'area_km2', 2020, 170.695, 'geoboundaries-ken-adm3'),
  ('kiambu/githunguri', 'buildings', 2023, 142770, 'google-open-buildings-v3'),
  ('kiambu/githunguri', 'buildings_per_km2', 2023, 836, 'google-open-buildings-v3'),
  ('kiambu/githunguri', 'median_building_m2', 2023, 28, 'google-open-buildings-v3'),
  ('kiambu/githunguri', 'small_building_share', 2023, 0.633, 'google-open-buildings-v3'),
  ('kiambu/githunguri', 'large_building_share', 2023, 0.015, 'google-open-buildings-v3'),
  ('meru/tigania-west/athwana', 'area_km2', 2020, 146.774, 'geoboundaries-ken-adm3'),
  ('meru/tigania-west/athwana', 'buildings', 2023, 11346, 'google-open-buildings-v3'),
  ('meru/tigania-west/athwana', 'buildings_per_km2', 2023, 77, 'google-open-buildings-v3'),
  ('meru/tigania-west/athwana', 'median_building_m2', 2023, 22, 'google-open-buildings-v3'),
  ('meru/tigania-west/athwana', 'small_building_share', 2023, 0.797, 'google-open-buildings-v3'),
  ('meru/tigania-west/athwana', 'large_building_share', 2023, 0.015, 'google-open-buildings-v3')
on conflict (area_key, indicator, year) do update set value = excluded.value, source_id = excluded.source_id;
