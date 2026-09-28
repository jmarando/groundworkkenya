-- The voter file: adding people by hand, at the door and by import, and
-- queueing a broadcast. Consent is the thread through all of it: recorded
-- with where it came from, never assumed, never laid over a STOP.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- Everything below runs as Sakaja's field agent (b2) unless it says otherwise.

-- test: adding a person by hand checks the number, the name and consent
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  r jsonb;
  p public.people;
begin
  assert pg_temp.fails_with(
    $q$select public.add_person('0712345678', 'Wanjiku', null, null, 'sw', 50, null, '{}', null)$q$,
    'Use a Kenyan mobile number like 0712 345 678.');
  assert pg_temp.fails_with(
    $q$select public.add_person('+254712345678', '  ', null, null, 'sw', 50, null, '{}', null)$q$,
    'Add their name.');
  assert pg_temp.fails_with(
    $q$select public.add_person('+254712345678', 'Wanjiku', null, null, 'sw', 50, null, '{"sms": true}', ' ')$q$,
    'Say how they agreed to be contacted.');

  r := public.add_person('+254712345678', ' Wanjiku ', null, null, null, 250, null,
                         '{"sms": true}', 'Signed the sheet at the rally');
  select * into p from public.people where id = (r ->> 'id')::uuid;
  assert p.full_name = 'Wanjiku' and p.language = 'sw' and p.support_score = 100;
  assert p.consent_sms and not p.consent_whatsapp;
  assert exists (select 1 from public.person_events
                  where person_id = p.id and kind = 'consent_given'
                    and detail = 'Agreed to SMS: Signed the sheet at the rally');

  assert pg_temp.fails_with(
    $q$select public.add_person('+254712345678', 'Someone else', null, null, 'sw', 0, null, '{}', null)$q$,
    '+254712345678 is already on file as Wanjiku.');
end $$;
rollback;

-- test: someone new met at the door
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  r jsonb;
  p public.people;
  visit uuid := gen_random_uuid();
begin
  r := public.record_door(visit, null,
         '{"phone": "+254722000111", "name": "Kamau", "language": "sw"}', 'spoke', 4, 'Water',
         '{"sms": true, "whatsapp": true}', 'Said yes at the door', now(), null);
  assert (r ->> 'created')::boolean and not (r ->> 'repeat')::boolean;
  select * into p from public.people where id = (r ->> 'person_id')::uuid;
  assert p.source = 'door' and p.support_score = 75, 'support 4 of 5 is 75';
  assert p.consent_sms and p.consent_whatsapp and not p.consent_call;
  assert p.last_contacted_at is not null;
  assert (select count(*) from public.person_events where person_id = p.id) = 3,
    'added, the visit, and the consent';
  assert (select detail from public.person_events where client_id = visit) = 'Water';

  -- The phone syncs the same visit again: nothing new is recorded.
  r := public.record_door(visit, null,
         '{"phone": "+254722000111", "name": "Kamau"}', 'spoke', 4, 'Water',
         '{"sms": true}', 'Said yes at the door', now(), null);
  assert (r ->> 'repeat')::boolean;
  assert (select count(*) from public.person_events where person_id = p.id) = 3;

  -- A second visit to the same number goes on the same record.
  r := public.record_door(gen_random_uuid(), null,
         '{"phone": "+254722000111", "name": "A different spelling"}', 'spoke', null, null,
         '{}', null, now(), null);
  assert (r ->> 'person_id')::uuid = p.id and not (r ->> 'created')::boolean;
  assert (select full_name from public.people where id = p.id) = 'Kamau', 'blanks are filled, names kept';
end $$;
rollback;

-- test: the door checks what it is told
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    $q$select public.record_door(null, null, '{}', 'spoke', null, null, '{}', null, now(), null)$q$,
    'Each visit needs its own id.');
  assert pg_temp.fails_with(
    $q$select public.record_door(gen_random_uuid(), null, '{"phone": "+254722000111", "name": "K"}',
                                 'waved', null, null, '{}', null, now(), null)$q$,
    'Unknown outcome.');
  assert pg_temp.fails_with(
    $q$select public.record_door(gen_random_uuid(), null, '{"phone": "+254722000111", "name": "K"}',
                                 'spoke', 6, null, '{}', null, now(), null)$q$,
    'Support is 1 to 5.');
  assert pg_temp.fails_with(
    $q$select public.record_door(gen_random_uuid(), null, '{"phone": "+254722000111", "name": "K"}',
                                 'not_home', null, null, '{}', null, now(), null)$q$,
    'A new person is someone you spoke to.');
  assert pg_temp.fails_with(
    $q$select public.record_door(gen_random_uuid(), null, '{"phone": "+254722000111", "name": "K"}',
                                 'spoke', null, null, '{"call": true}', '', now(), null)$q$,
    'Say how they agreed to be contacted.');
end $$;
rollback;

-- test: consent at the door never overrides a STOP
begin;
insert into public.people (phone, full_name, opted_out) values ('+254733000222', 'Njeri', true);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  pid uuid := (select id from public.people where phone = '+254733000222');
  r jsonb;
begin
  r := public.record_door(gen_random_uuid(), pid, null, 'spoke', 3, null,
                          '{"sms": true}', 'Said yes at the door', now(), null);
  assert (r ->> 'consent_blocked')::boolean, 'the visit says consent was not recorded';
  assert not (select consent_sms from public.people where id = pid);
  assert not exists (select 1 from public.person_events where person_id = pid and kind = 'consent_given');
end $$;
rollback;

-- test: the visit time is kept honest and a bad location is dropped
begin;
insert into public.people (phone, full_name) values ('+254744000333', 'Atieno');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  pid uuid := (select id from public.people where phone = '+254744000333');
  e public.person_events;
  v uuid;
begin
  v := gen_random_uuid();
  perform public.record_door(v, pid, null, 'not_home', null, null, '{}', null,
                             now() + interval '1 day', '{"lat": 51.5, "lng": -0.1}');
  select * into e from public.person_events where client_id = v;
  assert e.created_at = now(), 'a visit cannot be in the future';
  assert e.lat is null, 'London is not in Kenya';
  assert (select last_contacted_at from public.people where id = pid) is null, 'an empty house is not contact';

  v := gen_random_uuid();
  perform public.record_door(v, pid, null, 'refused', null, null, '{}', null,
                             now() - interval '30 days', '{"lat": -1.28, "lng": 36.82, "accuracy": 900}');
  select * into e from public.person_events where client_id = v;
  assert e.created_at = now() - interval '7 days', 'a month-old visit is clamped to a week';
  assert e.lat is null, 'a fix 900 m wide pins nobody';
  assert (select lat from public.people where id = pid) is null;

  v := gen_random_uuid();
  perform public.record_door(v, pid, null, 'spoke', null, null, '{}', null, now(),
                             '{"lat": -1.28, "lng": 36.82, "accuracy": 12, "buildingId": "6GCRPR6C+24"}');
  assert (select building_id from public.people where id = pid) = '6GCRPR6C+24';
  assert (select lat from public.people where id = pid) = -1.28;

  -- An older visit synced late does not move the pin.
  perform public.record_door(gen_random_uuid(), pid, null, 'spoke', null, null, '{}', null,
                             now() - interval '2 days', '{"lat": -0.5, "lng": 37.0, "accuracy": 10}');
  assert (select lat from public.people where id = pid) = -1.28;
end $$;
rollback;

-- test: an import keeps valid numbers once each, and consent only when stated
do $$
declare
  rows jsonb := '[
    {"phone": "+254712000001", "name": "Moraa", "sms": true},
    {"phone": "+254712000001", "name": "Moraa again", "sms": true},
    {"phone": "0712000002", "name": "Local format"},
    {"phone": "+254112000003", "name": " ", "whatsapp": true}
  ]';
  n integer;
begin
  select count(*) into n from public.parse_import_rows(rows, true);
  assert n = 2, 'duplicates and bad numbers dropped';
  assert (select sms from public.parse_import_rows(rows, true) where phone = '+254712000001');
  assert not (select sms from public.parse_import_rows(rows, false) where phone = '+254712000001'),
    'no consent unless the importer says the list has it';
  assert (select full_name from public.parse_import_rows(rows, true) where phone = '+254112000003') is null;
end $$;

-- test: a broadcast reaches only people who agreed to SMS, and only once
begin;
insert into public.people (phone, full_name, consent_sms) values ('+254755000001', 'Yes', true);
insert into public.people (phone, full_name, consent_sms) values ('+254755000002', 'No consent', false);
insert into public.people (phone, full_name, consent_sms, opted_out) values ('+254755000003', 'Stopped', true, true);
-- Sending a broadcast is for the candidate or the campaign manager (c3).
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare
  key uuid := gen_random_uuid();
  r jsonb;
  again jsonb;
  reachable integer;
begin
  assert pg_temp.fails_with(
    format('select public.queue_broadcast(%L, %L, %L)', key, '{}', 'Rally at noon'),
    'Say how to opt out, for example "STOP kujiondoa".');
  assert pg_temp.fails_with(
    format('select public.queue_broadcast(%L, %L, %L)', key, '{}', 'Stopover at the market'),
    'Say how to opt out, for example "STOP kujiondoa".');

  reachable := (public.broadcast_estimate('{}') ->> 'reachable')::int;
  r := public.queue_broadcast(key, '{}', 'Rally at noon. STOP kujiondoa');
  assert (r ->> 'queued')::int = reachable, 'queued exactly the estimate';
  assert exists (select 1 from public.messages m join public.people p on p.id = m.person_id
                  where m.broadcast_id = (r ->> 'id')::uuid and p.phone = '+254755000001');
  assert not exists (select 1 from public.messages m join public.people p on p.id = m.person_id
                      where m.broadcast_id = (r ->> 'id')::uuid and p.phone in ('+254755000002', '+254755000003'));

  -- A double click: the same composer key reports the first send.
  again := public.queue_broadcast(key, '{}', 'Rally at noon. STOP kujiondoa');
  assert (again ->> 'repeat')::boolean and again ->> 'id' = r ->> 'id';
  assert (select count(*) from public.messages where broadcast_id = (r ->> 'id')::uuid) = reachable;
end $$;
rollback;
