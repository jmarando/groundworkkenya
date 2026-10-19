-- The atlas holds a ward's own race too: the Member of County Assembly (MCA), counted in the
-- ward, for the 2013, 2017 and 2022 general elections. Then Roysambu ward's 2017 MCA result
-- (data/atlas/nairobi, rows for that ward only). Safe to run again. No schema version change:
-- a constraint widened, and rows.

alter table public.atlas_elections drop constraint if exists atlas_elections_race_check;
alter table public.atlas_elections
  add constraint atlas_elections_race_check check (race in ('president', 'governor', 'mp', 'mca'));

insert into public.atlas_elections (id, year, race, held_on, note) values
  ('2013-mca', 2013, 'mca', '2013-03-04', null),
  ('2017-mca', 2017, 'mca', '2017-08-08', null),
  ('2022-mca', 2022, 'mca', '2022-08-09', null)
on conflict (id) do nothing;

insert into public.atlas_sources (id, title, publisher, url, note) values
  ('ballotwinners-roysambu-ward', 'ROYSAMBU Ward: MCA and Election Results', 'BallotWinners', 'https://ballotwinners.com/geography/ward/1394', 'A third-party site carrying IEBC''s declared results, every candidate as printed (surname first). 2017: 23,195 valid votes, which the eight candidates add up to. 2022 lists the winner only (Mumbi Sospeter Gathahu, independent, 6,317, as the Gazette gives), so it isn''t entered. 2013 gives no parties, so it isn''t entered either. Read 19 October 2026.')
on conflict (id) do update set title = excluded.title, publisher = excluded.publisher, url = excluded.url, note = excluded.note;

insert into public.atlas_candidates (id, election_id, seat, name, party, bloc) values
  ('2017-mca:nairobi/roysambu/roysambu:warutere-peter-muriithi', '2017-mca', 'nairobi/roysambu/roysambu', 'Warutere Peter Muriithi', 'JUBILEE PARTY', 'JUBILEE PARTY'),
  ('2017-mca:nairobi/roysambu/roysambu:mumbi-sospeter-githahu', '2017-mca', 'nairobi/roysambu/roysambu', 'Mumbi Sospeter Githahu', 'INDEPENDENT', 'Independent: Mumbi Sospeter Githahu'),
  ('2017-mca:nairobi/roysambu/roysambu:mugo-geoffrey-mwangi', '2017-mca', 'nairobi/roysambu/roysambu', 'Mugo Geoffrey Mwangi', 'INDEPENDENT', 'Independent: Mugo Geoffrey Mwangi'),
  ('2017-mca:nairobi/roysambu/roysambu:chege-fred-kamau', '2017-mca', 'nairobi/roysambu/roysambu', 'Chege Fred Kamau', 'INDEPENDENT', 'Independent: Chege Fred Kamau'),
  ('2017-mca:nairobi/roysambu/roysambu:wambogo-charles-muchangi', '2017-mca', 'nairobi/roysambu/roysambu', 'Wambogo Charles Muchangi', 'MAENDELEO CHAP CHAP PARTY', 'MAENDELEO CHAP CHAP PARTY'),
  ('2017-mca:nairobi/roysambu/roysambu:waweru-dennis-mwangi', '2017-mca', 'nairobi/roysambu/roysambu', 'Waweru Dennis Mwangi', 'INDEPENDENT', 'Independent: Waweru Dennis Mwangi'),
  ('2017-mca:nairobi/roysambu/roysambu:kamau-susan-wambui', '2017-mca', 'nairobi/roysambu/roysambu', 'Kamau Susan Wambui', 'SAFINA', 'SAFINA'),
  ('2017-mca:nairobi/roysambu/roysambu:mwari-benson-kuyu', '2017-mca', 'nairobi/roysambu/roysambu', 'Mwari Benson Kuyu', 'INDEPENDENT', 'Independent: Mwari Benson Kuyu')
on conflict (id) do update set election_id = excluded.election_id, seat = excluded.seat, name = excluded.name, party = excluded.party, bloc = excluded.bloc;

insert into public.atlas_results (candidate_id, area_key, votes, source_id) values
  ('2017-mca:nairobi/roysambu/roysambu:warutere-peter-muriithi', 'nairobi/roysambu/roysambu', 11829, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:mumbi-sospeter-githahu', 'nairobi/roysambu/roysambu', 3364, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:mugo-geoffrey-mwangi', 'nairobi/roysambu/roysambu', 2797, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:chege-fred-kamau', 'nairobi/roysambu/roysambu', 2679, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:wambogo-charles-muchangi', 'nairobi/roysambu/roysambu', 925, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:waweru-dennis-mwangi', 'nairobi/roysambu/roysambu', 720, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:kamau-susan-wambui', 'nairobi/roysambu/roysambu', 512, 'ballotwinners-roysambu-ward'),
  ('2017-mca:nairobi/roysambu/roysambu:mwari-benson-kuyu', 'nairobi/roysambu/roysambu', 369, 'ballotwinners-roysambu-ward')
on conflict (candidate_id, area_key) do update set votes = excluded.votes, source_id = excluded.source_id;

insert into public.atlas_turnout (election_id, area_key, registered, cast_votes, rejected, valid, source_id) values
  ('2017-mca', 'nairobi/roysambu/roysambu', null, null, null, 23195, 'ballotwinners-roysambu-ward')
on conflict (election_id, area_key) do update set registered = excluded.registered, cast_votes = excluded.cast_votes, rejected = excluded.rejected, valid = excluded.valid, source_id = excluded.source_id;
