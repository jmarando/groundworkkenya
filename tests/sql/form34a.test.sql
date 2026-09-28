-- Form 34A filing: the ballot, assigning agents, filing a stream, and photos.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- A station of our own beside the seeded ones, in Sakaja: 3 streams, 1,000 registered.
insert into public.polling_stations (id, campaign_id, code, name, registered_voters, streams, agent_name, agent_phone, status)
values ('00000000-0000-0000-0000-00000000f001', 'ca000000-0000-4000-8000-000000000002',
        'TS-0001', 'Test Primary', 1000, 3, 'Achieng', '+254711222333', 'confirmed');

create or replace function pg_temp.ballot3() returns void language sql as $$
  delete from public.ballot_candidates where campaign_id = 'ca000000-0000-4000-8000-000000000002';
  insert into public.ballot_candidates (campaign_id, position, name, party, ours) values
    ('ca000000-0000-4000-8000-000000000002', 1, 'Amani', 'ABC', true),
    ('ca000000-0000-4000-8000-000000000002', 2, 'Baraka', 'DEF', false),
    ('ca000000-0000-4000-8000-000000000002', 3, 'Chege', null, false);
$$;

create or replace function pg_temp.file(_stream int, _votes int[], _rejected int, _phone text default '+254711222333')
returns jsonb language sql as $$
  select public.file_stream_result(_phone, '00000000-0000-0000-0000-00000000f001', _stream, _votes, _rejected, 'ussd')
$$;

-- test: only staff set the ballot, and it is replaced as given before any filing
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with($q$select public.set_ballot('[{"name": "Amani"}]')$q$,
    'Only the candidate or campaign manager can change the ballot.');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$
begin
  assert public.set_ballot('[{"name": " Amani ", "party": "ABC", "ours": true}, {"name": "Baraka"}]') = 2;
  assert (select array_agg(name order by position) from public.ballot_candidates) = array['Amani', 'Baraka'];
  assert (select ours from public.ballot_candidates where name = 'Amani');
  assert public.set_ballot('[{"name": "Chege"}]') = 1, 'replaced, not appended';
  assert pg_temp.fails_with($q$select public.set_ballot('[{"name": "  "}]')$q$, 'Every candidate needs a name.');
end $$;
rollback;

-- test: staff assign agents by phone; clearing the phone unstaffs the station
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$
declare
  st public.polling_stations;
begin
  assert pg_temp.fails_with(
    $q$select public.assign_station_agent('00000000-0000-0000-0000-00000000f001', 'Kip', '0711222444')$q$,
    'Use a Kenyan mobile number like 0712 345 678.');
  perform public.assign_station_agent('00000000-0000-0000-0000-00000000f001', 'Kiprono', '+254711222444');
  select * into st from public.polling_stations where id = '00000000-0000-0000-0000-00000000f001';
  assert st.agent_phone = '+254711222444' and st.agent_name = 'Kiprono' and st.status = 'confirmed';
  perform public.assign_station_agent('00000000-0000-0000-0000-00000000f001', null, '');
  select * into st from public.polling_stations where id = '00000000-0000-0000-0000-00000000f001';
  assert st.agent_phone is null and st.status = 'unstaffed';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    $q$select public.assign_station_agent('00000000-0000-0000-0000-00000000f001', 'Me', '+254700000000')$q$,
    'Only the candidate or campaign manager can assign agents.');
end $$;
rollback;

-- test: an agent files a stream and the station's results follow
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
do $$
declare
  r jsonb;
  st public.polling_stations;
begin
  r := pg_temp.file(2, array[120, 80, 30], 5);
  assert r ->> 'station' = 'TS-0001' and (r ->> 'valid')::int = 230 and not (r ->> 'corrected')::boolean;
  select * into st from public.polling_stations where id = '00000000-0000-0000-0000-00000000f001';
  assert st.results -> 'candidates' = '{"Amani": 120, "Baraka": 80, "Chege": 30}'::jsonb, st.results::text;
  assert (st.results ->> 'rejected')::int = 5 and (st.results ->> '_streams')::int = 1;
  assert st.reported_at is not null;

  -- Another stream adds to the station.
  perform pg_temp.file(1, array[100, 100, 0], 0);
  select * into st from public.polling_stations where id = '00000000-0000-0000-0000-00000000f001';
  assert st.results -> 'candidates' = '{"Amani": 220, "Baraka": 180, "Chege": 30}'::jsonb, st.results::text;
  assert (st.results ->> '_streams')::int = 2;
end $$;
rollback;

-- test: filing again for a stream corrects it, and the old form is kept
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
do $$
declare
  r jsonb;
begin
  perform pg_temp.file(1, array[100, 50, 10], 2);
  r := pg_temp.file(1, array[101, 50, 10], 2);
  assert (r ->> 'corrected')::boolean;
  assert (select count(*) from public.stream_results where stream = 1) = 2, 'both kept';
  assert (select count(*) from public.stream_results where stream = 1 and superseded_at is null) = 1;
  assert (select results -> 'candidates' ->> 'Amani' from public.polling_stations
           where id = '00000000-0000-0000-0000-00000000f001') = '101', 'the correction counts';
end $$;
rollback;

-- test: the database refuses what cannot be right
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
do $$
begin
  assert pg_temp.fails_with($q$select pg_temp.file(1, array[1, 2, 3], 0, '+254799999999')$q$,
    'Namba hii si ya ajenti wa kituo TS-0001.');
  assert pg_temp.fails_with($q$select pg_temp.file(4, array[1, 2, 3], 0)$q$,
    'Mkondo 4 haupo. Kituo TS-0001 kina mikondo 3.');
  assert pg_temp.fails_with($q$select pg_temp.file(1, array[1, 2], 0)$q$,
    'Kura za wagombea 3 zinahitajika, zimepokelewa 2.');
  assert pg_temp.fails_with($q$select pg_temp.file(1, array[1, -2, 3], 0)$q$,
    'Kura haziwezi kuwa hasi.');
  assert pg_temp.fails_with($q$select pg_temp.file(1, array[900, 100, 0], 1)$q$,
    'Jumla 1001 ni zaidi ya wapiga kura 1000 waliosajiliwa kituo TS-0001.');
end $$;
rollback;

-- test: without a ballot there is nothing to file against
begin;
delete from public.ballot_candidates;
do $$
begin
  assert pg_temp.fails_with($q$select pg_temp.file(1, array[1], 0)$q$,
    'Orodha ya wagombea haijawekwa. Mjulishe mratibu.');
end $$;
rollback;

-- test: streams that together pass the register are kept and flagged
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
do $$
declare
  r jsonb;
begin
  perform pg_temp.file(1, array[400, 100, 0], 0);
  r := pg_temp.file(2, array[400, 100, 0], 1);
  assert (r ->> 'over_register')::boolean, 'flagged';
  assert (select over_register from public.stream_results where id = (r ->> 'id')::uuid);
end $$;
rollback;

-- test: once a form is filed the ballot order is locked, names still correctable
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
do $$ begin perform pg_temp.file(1, array[1, 2, 3], 0); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$
declare
  ids uuid[] := (select array_agg(id order by position) from public.ballot_candidates);
  locked text := 'Forms are already filed, so candidates cannot be added, removed or moved. Names and parties can still be corrected.';
begin
  assert pg_temp.fails_with(format($q$select public.set_ballot('[{"name": "Amani"}]')$q$), locked);
  assert pg_temp.fails_with(format(
    $q$select public.set_ballot(jsonb_build_array(
        jsonb_build_object('id', %L, 'name', 'Baraka'),
        jsonb_build_object('id', %L, 'name', 'Amani'),
        jsonb_build_object('id', %L, 'name', 'Chege')))$q$, ids[2], ids[1], ids[3]), locked);
  perform public.set_ballot(jsonb_build_array(
    jsonb_build_object('id', ids[1], 'name', 'Amani Wekesa', 'party', 'ABC', 'ours', true),
    jsonb_build_object('id', ids[2], 'name', 'Baraka'),
    jsonb_build_object('id', ids[3], 'name', 'Chege')));
  assert (select name from public.ballot_candidates where id = ids[1]) = 'Amani Wekesa';
end $$;
rollback;

-- test: a photo from the agent lands on the stream named, else the one waiting
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
do $$
declare
  r jsonb;
begin
  perform pg_temp.file(1, array[1, 2, 3], 0);
  perform pg_temp.file(3, array[1, 2, 3], 0);

  r := public.record_form_photo('+254711222333', 'wamid.1', 'media-1', '37A TS-0001/1', 'TS-0001', 1);
  assert r ->> 'station' = 'TS-0001' and (r ->> 'stream')::int = 1;
  assert r ->> 'level' = 'governor', 'the reply names the governor''s form: ' || r;

  -- No stream in the caption: the latest filed stream still without a photo.
  r := public.record_form_photo('+254711222333', 'wamid.2', 'media-2', null, null, null);
  assert (r ->> 'stream')::int = 3, r::text;

  -- Nothing waiting and nothing said: kept against the station, stream unknown.
  r := public.record_form_photo('+254711222333', 'wamid.3', 'media-3', 'another one', null, null);
  assert r -> 'stream' = 'null'::jsonb, r::text;

  -- WhatsApp delivered the same message twice: recorded once.
  perform public.record_form_photo('+254711222333', 'wamid.1', 'media-1', '34A TS-0001/1', 'TS-0001', 1);
  assert (select count(*) from public.form_photos where wa_message_id = 'wamid.1') = 1;

  -- Someone who is not an agent: nothing recorded.
  assert public.record_form_photo('+254799999999', 'wamid.4', 'media-4', null, null, null) is null;
  assert not exists (select 1 from public.form_photos where wa_message_id = 'wamid.4');
end $$;
rollback;

-- test: each campaign sets its own ballot and assigns its own agents
begin;
do $$ begin perform pg_temp.ballot3(); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$
begin
  assert public.set_ballot('[{"name": "Waruru", "ours": true}, {"name": "Challenger"}]') = 2;
  assert (select count(*) from public.ballot_candidates) = 2, 'Mathira sees its own ballot only';
  assert pg_temp.fails_with(
    $q$select public.assign_station_agent('00000000-0000-0000-0000-00000000f001', 'Mole', '+254722000999')$q$,
    'That station is not on file.');
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.ballot_candidates
           where campaign_id = 'ca000000-0000-4000-8000-000000000002') = 3, 'Sakaja''s ballot untouched';
  assert (select agent_phone from public.polling_stations
           where id = '00000000-0000-0000-0000-00000000f001') = '+254711222333', 'Sakaja''s agent untouched';
end $$;
rollback;

-- test: a station files against its own campaign's ballot
begin;
do $$
declare
  r jsonb;
begin
  perform pg_temp.ballot3();
  insert into public.ballot_candidates (campaign_id, position, name, ours) values
    ('ca000000-0000-4000-8000-000000000003', 1, 'Waruru', true),
    ('ca000000-0000-4000-8000-000000000003', 2, 'Challenger', false);
  insert into public.polling_stations (id, campaign_id, code, name, registered_voters, streams, agent_phone, status)
  values ('00000000-0000-0000-0000-00000000f003', 'ca000000-0000-4000-8000-000000000003',
          'MT-0001', 'Karatina Primary', 800, 1, '+254733444555', 'confirmed');

  assert pg_temp.fails_with(
    $q$select public.file_stream_result('+254733444555', '00000000-0000-0000-0000-00000000f003', 1, array[1, 2, 3], 0, 'ussd')$q$,
    'Kura za wagombea 2 zinahitajika, zimepokelewa 3.'), 'Mathira''s ballot has two candidates, not Sakaja''s three';
  r := public.file_stream_result('+254733444555', '00000000-0000-0000-0000-00000000f003', 1, array[300, 200], 4, 'ussd');
  assert (select results -> 'candidates' from public.polling_stations
           where id = '00000000-0000-0000-0000-00000000f003') = '{"Waruru": 300, "Challenger": 200}'::jsonb;
  assert (select campaign_id from public.stream_results where id = (r ->> 'id')::uuid)
         = 'ca000000-0000-4000-8000-000000000003', 'the filing belongs to Mathira';
end $$;
rollback;

-- test: the team reads filings and photos; nobody but the server writes them
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  fn text;
begin
  perform count(*) from public.stream_results;
  perform count(*) from public.form_photos;
  perform count(*) from public.ballot_candidates;
  assert not has_table_privilege('authenticated', 'public.stream_results', 'insert');
  assert not has_table_privilege('authenticated', 'public.form_photos', 'insert');
  assert not has_table_privilege('authenticated', 'public.ballot_candidates', 'insert');
  foreach fn in array array[
    'public.file_stream_result(text, uuid, integer, integer[], integer, text)',
    'public.record_form_photo(text, text, text, text, text, integer)'
  ] loop
    assert not has_function_privilege('authenticated', fn, 'execute'), fn;
    assert has_function_privilege('service_role', fn, 'execute'), fn;
  end loop;
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() >= 11; end $$;
