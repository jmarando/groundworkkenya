-- The election atlas's figures for kenya, kiambu, meru, from data/atlas.
-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.

insert into public.atlas_sources (id, title, publisher, url, note) values
  ('worldpop-2020-agesex', 'Age and sex structures, Kenya, 2020, 100 m grid', 'WorldPop (University of Southampton)', 'https://hub.worldpop.org/geodata/listing?id=65', 'Estimates, summed inside each ward''s boundary through WorldPop''s statistics API (dataset wpgpas); 18–34 counts two fifths of the 15–19 band.'),
  ('iebc-2022-form-34c', 'Declaration of results for the election of President, national tallying centre, by county (Form 34C summary), 2022', 'IEBC', 'https://www.iebc.or.ke/uploads/resources/QLTlLJx0Vr.pdf', 'County and national totals as printed. Votes cast is valid plus rejected. The national valid total (14,213,137) is 110 more than the four candidates'' votes added up (14,213,027), as printed.'),
  ('electionskenya-2013-president', '2013 presidential results by county', 'electionskenya.org', 'http://www.electionskenya.org/results/PR/2013/', 'A third-party election observation site; its 2013 national totals match IEBC''s declaration. County rows list only the four leading candidates and no votes cast. Parties and coalitions come from the candidates'' widely reported 2013 tickets'),
  ('electionskenya-2022-register', 'Registered voters per county assembly ward, 2022', 'electionskenya.org', 'http://www.electionskenya.org/county/047/', 'Ward pages of a third-party site carrying IEBC''s 2022 register. Nairobi''s wards add up to 2,415,310 against IEBC''s declared 2,416,551. Mugumo-ini is spelt Mugumu-ini there.'),
  ('electionskenya-2022-candidates', '2022 candidates and registered voters by constituency', 'electionskenya.org', 'http://www.electionskenya.org/constituency/274/', 'Constituency pages of a third-party site carrying IEBC''s 2022 candidate list (official names and parties) and register; names are given here as other names then surname. Its county pages give the 2022 governor candidates; both lists are what the provisional results were checked against for completeness.'),
  ('google-open-buildings-v3', 'Open Buildings v3: building footprints', 'Google Open Buildings', 'https://sites.research.google/gr/open-buildings/', 'Footprints at confidence 0.65 or more, each counted in the ward its centre falls in, measured from the Voters map''s house files (outlines to about 0.6 m) (CC BY 4.0). Small structures are under 40 m², large buildings 200 m² or more.'),
  ('geoboundaries-ken-adm3', 'geoBoundaries Kenya ADM3 (wards)', 'geoBoundaries', 'https://www.geoboundaries.org/', 'Ward boundaries (Omare & Omare 2020, CC BY 4.0), simplified to about 3 m for the ward maps; areas are measured from them.'),
  ('mzalendo-2022-kiambu', 'Kiambu County: elections, Parliament and public money', 'Mzalendo', 'https://mzalendo.com/mps-performance/counties/kiambu/', 'Reproduces IEBC''s 2022 register by constituency and the Kenya Gazette''s declared winners (Gazette 9950 for MPs), winners only. Githunguri: 104,592 registered; Wamuchomba Gathoni, UDA, 34,646 votes. Read 19 October 2026.'),
  ('nairobileo-2025-wamuchomba', 'Woman MP Who Holds Record for Receiving Highest Number of Votes in Kenya', 'Nairobi Leo', 'https://www.nairobileo.co.ke/features/article/18973/woman-mp-who-holds-record-for-receiving-highest-number-of-votes-in-kenya', '25 January 2025. Githunguri''s 2022 MP race, the top two as printed: Wamuchomba 34,646 and Jubilee''s Gabriel Kago 31,127. The winner''s figure agrees with the Gazette as Mzalendo gives it. No valid total, so shares are of the candidates listed.'),
  ('mzalendo-2022-meru', 'Meru County: elections, Parliament and public money', 'Mzalendo', 'https://mzalendo.com/mps-performance/counties/meru/', 'Reproduces IEBC''s 2022 register by constituency and the Kenya Gazette''s declared winners, winners only (Gazette 9956 for MCAs: Athwana, Dionisio Jim Muchui, UDA, 3,864). Tigania West: 70,283 registered. Read 19 October 2026.')
on conflict (id) do update set title = excluded.title, publisher = excluded.publisher, url = excluded.url, note = excluded.note;

insert into public.atlas_areas (key, level, name, parent, iebc_code) values
  ('kenya', 'country', 'Kenya', null, null),
  ('kiambu', 'county', 'Kiambu', 'kenya', '022'),
  ('meru', 'county', 'Meru', 'kenya', '012'),
  ('kiambu/githunguri', 'constituency', 'Githunguri', 'kiambu', null),
  ('meru/tigania-west', 'constituency', 'Tigania West', 'meru', null),
  ('kiambu/githunguri/githiga', 'ward', 'Githiga', 'kiambu/githunguri', null),
  ('kiambu/githunguri/githunguri', 'ward', 'Githunguri', 'kiambu/githunguri', null),
  ('kiambu/githunguri/ikinu', 'ward', 'Ikinu', 'kiambu/githunguri', null),
  ('kiambu/githunguri/komothai', 'ward', 'Komothai', 'kiambu/githunguri', null),
  ('kiambu/githunguri/ngewa', 'ward', 'Ngewa', 'kiambu/githunguri', null),
  ('meru/tigania-west/athwana', 'ward', 'Athwana', 'meru/tigania-west', null)
on conflict (key) do update set level = excluded.level, name = excluded.name, parent = excluded.parent, iebc_code = excluded.iebc_code;

insert into public.atlas_candidates (id, election_id, seat, name, party, bloc) values
  ('2013-president:kenya:uhuru-kenyatta', '2013-president', 'kenya', 'Uhuru Kenyatta', 'TNA', 'Jubilee'),
  ('2013-president:kenya:raila-odinga', '2013-president', 'kenya', 'Raila Odinga', 'ODM', 'CORD'),
  ('2013-president:kenya:musalia-mudavadi', '2013-president', 'kenya', 'Musalia Mudavadi', 'UDF', 'Amani'),
  ('2013-president:kenya:peter-kenneth', '2013-president', 'kenya', 'Peter Kenneth', 'KNC', 'Eagle'),
  ('2013-president:kenya:mohamed-abduba-dida', '2013-president', 'kenya', 'Mohamed Abduba Dida', 'ARK', 'ARK'),
  ('2013-president:kenya:martha-karua', '2013-president', 'kenya', 'Martha Karua', 'NARC-Kenya', 'NARC-Kenya'),
  ('2013-president:kenya:james-ole-kiyiapi', '2013-president', 'kenya', 'James ole Kiyiapi', 'RBK', 'RBK'),
  ('2013-president:kenya:paul-muite', '2013-president', 'kenya', 'Paul Muite', 'Safina', 'Safina'),
  ('2022-president:kenya:raila-odinga', '2022-president', 'kenya', 'Raila Odinga', 'ODM', 'Azimio'),
  ('2022-president:kenya:william-ruto', '2022-president', 'kenya', 'William Ruto', 'UDA', 'Kenya Kwanza'),
  ('2022-president:kenya:david-mwaure-waihiga', '2022-president', 'kenya', 'David Mwaure Waihiga', 'Agano', 'Agano'),
  ('2022-president:kenya:george-wajackoyah', '2022-president', 'kenya', 'George Wajackoyah', 'Roots Party', 'Roots Party'),
  ('2017-president:kenya:uhuru-kenyatta', '2017-president', 'kenya', 'Uhuru Kenyatta', 'Jubilee', 'Jubilee'),
  ('2017-president:kenya:raila-odinga', '2017-president', 'kenya', 'Raila Odinga', 'ODM', 'NASA'),
  ('2022-mp:kiambu/githunguri:gathoni-wamuchomba', '2022-mp', 'kiambu/githunguri', 'Gathoni Wamuchomba', 'UDA', 'UDA'),
  ('2022-mp:kiambu/githunguri:gabriel-kago', '2022-mp', 'kiambu/githunguri', 'Gabriel Kago', 'Jubilee', 'Jubilee')
on conflict (id) do update set election_id = excluded.election_id, seat = excluded.seat, name = excluded.name, party = excluded.party, bloc = excluded.bloc;

insert into public.atlas_results (candidate_id, area_key, votes, source_id) values
  ('2013-president:kenya:uhuru-kenyatta', 'kenya', 6173433, 'electionskenya-2013-president'),
  ('2013-president:kenya:raila-odinga', 'kenya', 5340546, 'electionskenya-2013-president'),
  ('2013-president:kenya:musalia-mudavadi', 'kenya', 483981, 'electionskenya-2013-president'),
  ('2013-president:kenya:peter-kenneth', 'kenya', 72786, 'electionskenya-2013-president'),
  ('2013-president:kenya:mohamed-abduba-dida', 'kenya', 52848, 'electionskenya-2013-president'),
  ('2013-president:kenya:martha-karua', 'kenya', 43881, 'electionskenya-2013-president'),
  ('2013-president:kenya:james-ole-kiyiapi', 'kenya', 40998, 'electionskenya-2013-president'),
  ('2013-president:kenya:paul-muite', 'kenya', 12580, 'electionskenya-2013-president'),
  ('2022-president:kenya:raila-odinga', 'kenya', 6942930, 'iebc-2022-form-34c'),
  ('2022-president:kenya:william-ruto', 'kenya', 7176141, 'iebc-2022-form-34c'),
  ('2022-president:kenya:david-mwaure-waihiga', 'kenya', 31987, 'iebc-2022-form-34c'),
  ('2022-president:kenya:george-wajackoyah', 'kenya', 61969, 'iebc-2022-form-34c'),
  ('2022-mp:kiambu/githunguri:gathoni-wamuchomba', 'kiambu/githunguri', 34646, 'nairobileo-2025-wamuchomba'),
  ('2022-mp:kiambu/githunguri:gabriel-kago', 'kiambu/githunguri', 31127, 'nairobileo-2025-wamuchomba')
on conflict (candidate_id, area_key) do update set votes = excluded.votes, source_id = excluded.source_id;

insert into public.atlas_turnout (election_id, area_key, registered, cast_votes, rejected, valid, source_id) values
  ('2022-president', 'kenya', 22120458, 14326751, 113614, 14213137, 'iebc-2022-form-34c')
on conflict (election_id, area_key) do update set registered = excluded.registered, cast_votes = excluded.cast_votes, rejected = excluded.rejected, valid = excluded.valid, source_id = excluded.source_id;

insert into public.atlas_register (year, area_key, registered, source_id) values
  (2022, 'kiambu/githunguri', 104592, 'mzalendo-2022-kiambu'),
  (2022, 'meru/tigania-west', 70283, 'mzalendo-2022-meru')
on conflict (year, area_key) do update set registered = excluded.registered, source_id = excluded.source_id;

insert into public.atlas_population (area_key, year, total, adults, young_adults, source_id) values
  ('kiambu/githunguri/githiga', 2020, 36243, 22746, 10338, 'worldpop-2020-agesex'),
  ('kiambu/githunguri/githunguri', 2020, 42989, 26971, 12259, 'worldpop-2020-agesex'),
  ('kiambu/githunguri/ikinu', 2020, 27888, 17528, 7976, 'worldpop-2020-agesex'),
  ('kiambu/githunguri/komothai', 2020, 35886, 22455, 10157, 'worldpop-2020-agesex'),
  ('kiambu/githunguri/ngewa', 2020, 30890, 19413, 8839, 'worldpop-2020-agesex'),
  ('meru/tigania-west/athwana', 2020, 20965, 11096, 5551, 'worldpop-2020-agesex')
on conflict (area_key, year) do update set total = excluded.total, adults = excluded.adults, young_adults = excluded.young_adults, source_id = excluded.source_id;
