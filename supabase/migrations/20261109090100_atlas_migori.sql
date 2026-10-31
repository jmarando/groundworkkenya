-- The election atlas's figures for kenya, migori, from data/atlas.
-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.

insert into public.atlas_sources (id, title, publisher, url, note) values
  ('worldpop-2020-agesex', 'Age and sex structures, Kenya, 2020, 100 m grid', 'WorldPop (University of Southampton)', 'https://hub.worldpop.org/geodata/listing?id=65', 'Estimates, summed inside each ward''s boundary through WorldPop''s statistics API (dataset wpgpas); 18–34 counts two fifths of the 15–19 band.'),
  ('iebc-2022-form-34c', 'Declaration of results for the election of President, national tallying centre, by county (Form 34C summary), 2022', 'IEBC', 'https://www.iebc.or.ke/uploads/resources/QLTlLJx0Vr.pdf', 'County and national totals as printed. Votes cast is valid plus rejected. The national valid total (14,213,137) is 110 more than the four candidates'' votes added up (14,213,027), as printed.'),
  ('electionskenya-2013-president', '2013 presidential results by county', 'electionskenya.org', 'http://www.electionskenya.org/results/PR/2013/', 'A third-party election observation site; its 2013 national totals match IEBC''s declaration. County rows list only the four leading candidates and no votes cast. Parties and coalitions come from the candidates'' widely reported 2013 tickets'),
  ('electionskenya-2022-register', 'Registered voters per county assembly ward, 2022', 'electionskenya.org', 'http://www.electionskenya.org/county/047/', 'Ward pages of a third-party site carrying IEBC''s 2022 register. Nairobi''s wards add up to 2,415,310 against IEBC''s declared 2,416,551. Mugumo-ini is spelt Mugumu-ini there.'),
  ('electionskenya-2022-candidates', '2022 candidates and registered voters by constituency', 'electionskenya.org', 'http://www.electionskenya.org/constituency/274/', 'Constituency pages of a third-party site carrying IEBC''s 2022 candidate list (official names and parties) and register; names are given here as other names then surname. Its county pages give the 2022 governor candidates; both lists are what the provisional results were checked against for completeness.'),
  ('google-open-buildings-v3', 'Open Buildings v3: building footprints', 'Google Open Buildings', 'https://sites.research.google/gr/open-buildings/', 'Footprints at confidence 0.65 or more, each counted in the ward its centre falls in, measured from the Voters map''s house files (outlines to about 0.6 m) (CC BY 4.0). Small structures are under 40 m², large buildings 200 m² or more.'),
  ('geoboundaries-ken-adm3', 'geoBoundaries Kenya ADM3 (wards)', 'geoBoundaries', 'https://www.geoboundaries.org/', 'Ward boundaries (Omare & Omare 2020, CC BY 4.0), simplified to about 3 m for the ward maps; areas are measured from them.'),
  ('iebc-2022-rov-per-polling-station', 'Register of voters per polling station, 2022 General Election', 'IEBC', 'https://www.iebc.or.ke/docs/rov_per_polling_station.pdf', '712 pages, dated 3 August 2022; each ward is its streams added up. Githunguri''s wards add up to 104,592 and Tigania West''s to 70,283, the constituency registers Mzalendo gives.'),
  ('iebc-2022-rov-per-constituency', 'Registered voters per constituency for the 2022 General Election', 'IEBC', 'https://www.iebc.or.ke/docs/rov_per_constituency.pdf', 'Kuria East: 41,976 registered voters. Its five wards, from IEBC''s register by polling station, add up to the same. Read 1 November 2026.'),
  ('ballotwinners-kuria-east', 'KURIA EAST Constituency: MP, Wards and Results', 'BallotWinners', 'https://ballotwinners.com/geography/constituency/260', 'A third-party site carrying IEBC''s declared results. 2017: all eight candidates as printed (surname first) and 26,771 valid votes, which they add up to. 2022 lists the winner only, so the 2022 race is entered from Mzalendo''s copy of the Gazette instead. 2013 gives no parties, so it isn''t entered. Its 36,301 registered voters is an earlier register than IEBC''s 2022 one, so it isn''t entered. Read 1 November 2026.'),
  ('mzalendo-2022-migori', 'Migori County: elections, Parliament and public money', 'Mzalendo', 'https://mzalendo.com/mps-performance/counties/migori/', 'Reproduces IEBC''s 2022 register by constituency and the Kenya Gazette''s declared winners (Gazette 9950 for MPs), winners only. Kuria East: 41,976 registered; Kemero Maisori Marwa Kitayama, UDA, 15,362 votes, which agrees with BallotWinners. No source read gives the 2022 runner-up''s votes, so the 2022 MP race holds the winner alone. Read 1 November 2026.'),
  ('star-2022-kuria-president', 'Ruto wins Kuria vote as Raila falters again', 'The Star', 'https://www.the-star.co.ke/counties/nyanza/2022-08-13-ruto-wins-kuria-vote-as-raila-falters-again', '13 August 2022. Kuria East''s presidential result as printed: Ruto 16,795, Raila 12,031, Wajackoyah 144 and Mwaure 62, all four candidates. It gives no valid or rejected total, so none is entered.')
on conflict (id) do update set title = excluded.title, publisher = excluded.publisher, url = excluded.url, note = excluded.note;

insert into public.atlas_areas (key, level, name, parent, iebc_code) values
  ('kenya', 'country', 'Kenya', null, null),
  ('migori', 'county', 'Migori', 'kenya', '044'),
  ('migori/kuria-east', 'constituency', 'Kuria East', 'migori', null),
  ('migori/kuria-east/gokeharaka-getambwega', 'ward', 'Gokeharaka/Getambwega', 'migori/kuria-east', null),
  ('migori/kuria-east/ntimaru-east', 'ward', 'Ntimaru East', 'migori/kuria-east', null),
  ('migori/kuria-east/ntimaru-west', 'ward', 'Ntimaru West', 'migori/kuria-east', null),
  ('migori/kuria-east/nyabasi-east', 'ward', 'Nyabasi East', 'migori/kuria-east', null),
  ('migori/kuria-east/nyabasi-west', 'ward', 'Nyabasi West', 'migori/kuria-east', null)
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
  ('2022-mp:migori/kuria-east:kemero-maisori-marwa-kitayama', '2022-mp', 'migori/kuria-east', 'Kemero Maisori Marwa Kitayama', 'UDA', 'UDA'),
  ('2017-mp:migori/kuria-east:kitayama-marwa-kemero-maisori', '2017-mp', 'migori/kuria-east', 'Kitayama Marwa Kemero Maisori', 'JUBILEE PARTY', 'JUBILEE PARTY'),
  ('2017-mp:migori/kuria-east:maroa-mwita-wilson-paul', '2017-mp', 'migori/kuria-east', 'Maroa Mwita Wilson Paul', 'AMANI NATIONAL CONGRESS', 'AMANI NATIONAL CONGRESS'),
  ('2017-mp:migori/kuria-east:robi-rahab', '2017-mp', 'migori/kuria-east', 'Robi Rahab', 'ORANGE DEMOCRATIC MOVEMENT', 'ORANGE DEMOCRATIC MOVEMENT'),
  ('2017-mp:migori/kuria-east:david-mwita-john', '2017-mp', 'migori/kuria-east', 'David Mwita John', 'MAENDELEO CHAP CHAP PARTY', 'MAENDELEO CHAP CHAP PARTY'),
  ('2017-mp:migori/kuria-east:mwikwabe-thomas-maneno', '2017-mp', 'migori/kuria-east', 'Mwikwabe Thomas Maneno', 'PARTY OF INDEPENDENT', 'PARTY OF INDEPENDENT'),
  ('2017-mp:migori/kuria-east:busunkwi-kaburu', '2017-mp', 'migori/kuria-east', 'Busunkwi Kaburu', 'KENYA AFRICAN NATIONAL UNION', 'KENYA AFRICAN NATIONAL UNION'),
  ('2017-mp:migori/kuria-east:mabanga-julius-chacha', '2017-mp', 'migori/kuria-east', 'Mabanga Julius Chacha', 'PROGRESSIVE PARTY OF KENYA', 'PROGRESSIVE PARTY OF KENYA'),
  ('2017-mp:migori/kuria-east:matiko-esther-r-chacha', '2017-mp', 'migori/kuria-east', 'Matiko Esther R Chacha', 'NATIONAL RAINBOW COALITION-KENYA', 'NATIONAL RAINBOW COALITION-KENYA')
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
  ('2022-president:kenya:william-ruto', 'migori/kuria-east', 16795, 'star-2022-kuria-president'),
  ('2022-president:kenya:raila-odinga', 'migori/kuria-east', 12031, 'star-2022-kuria-president'),
  ('2022-president:kenya:george-wajackoyah', 'migori/kuria-east', 144, 'star-2022-kuria-president'),
  ('2022-president:kenya:david-mwaure-waihiga', 'migori/kuria-east', 62, 'star-2022-kuria-president'),
  ('2022-mp:migori/kuria-east:kemero-maisori-marwa-kitayama', 'migori/kuria-east', 15362, 'mzalendo-2022-migori'),
  ('2017-mp:migori/kuria-east:kitayama-marwa-kemero-maisori', 'migori/kuria-east', 15499, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:maroa-mwita-wilson-paul', 'migori/kuria-east', 7832, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:robi-rahab', 'migori/kuria-east', 1643, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:david-mwita-john', 'migori/kuria-east', 1129, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:mwikwabe-thomas-maneno', 'migori/kuria-east', 198, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:busunkwi-kaburu', 'migori/kuria-east', 187, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:mabanga-julius-chacha', 'migori/kuria-east', 173, 'ballotwinners-kuria-east'),
  ('2017-mp:migori/kuria-east:matiko-esther-r-chacha', 'migori/kuria-east', 110, 'ballotwinners-kuria-east')
on conflict (candidate_id, area_key) do update set votes = excluded.votes, source_id = excluded.source_id;

insert into public.atlas_turnout (election_id, area_key, registered, cast_votes, rejected, valid, source_id) values
  ('2022-president', 'kenya', 22120458, 14326751, 113614, 14213137, 'iebc-2022-form-34c'),
  ('2017-mp', 'migori/kuria-east', null, null, null, 26771, 'ballotwinners-kuria-east')
on conflict (election_id, area_key) do update set registered = excluded.registered, cast_votes = excluded.cast_votes, rejected = excluded.rejected, valid = excluded.valid, source_id = excluded.source_id;

insert into public.atlas_register (year, area_key, registered, source_id) values
  (2022, 'migori/kuria-east', 41976, 'iebc-2022-rov-per-constituency'),
  (2022, 'migori/kuria-east/gokeharaka-getambwega', 7962, 'iebc-2022-rov-per-polling-station'),
  (2022, 'migori/kuria-east/ntimaru-east', 5591, 'iebc-2022-rov-per-polling-station'),
  (2022, 'migori/kuria-east/ntimaru-west', 8628, 'iebc-2022-rov-per-polling-station'),
  (2022, 'migori/kuria-east/nyabasi-east', 8930, 'iebc-2022-rov-per-polling-station'),
  (2022, 'migori/kuria-east/nyabasi-west', 10865, 'iebc-2022-rov-per-polling-station')
on conflict (year, area_key) do update set registered = excluded.registered, source_id = excluded.source_id;
