-- Schema 42: auto-calls and calls. The office reads its own; principals keep the voice and make
-- auto-calls; anyone in the office may place an Inbox call; agents and other campaigns see
-- nothing. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 42 is in
do $$ begin assert public.groundwork_schema_version() >= 42; end $$;

-- test: a manager keeps the voice and makes an auto-call; the agent and Mathira see none of it
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
insert into public.campaign_voices (voice_id, name, consent_note)
values ('AbCdEf1234567890', 'Candidate', 'Recorded and approved by the candidate on 20 October 2026.');
insert into public.voice_blasts (title, script, source) values ('Rally Saturday', 'Hello', 'clone');
insert into public.voice_calls (kind, blast_id, to_phone)
select 'test', id, '254700000001' from public.voice_blasts;
do $$ begin
  assert (select count(*) from public.voice_calls) = 1;
  assert pg_temp.fails_with($q$update public.campaign_voices set consent_note = 'too short'$q$,
    'new row for relation "campaign_voices" violates check constraint "campaign_voices_consent_note_check"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.campaign_voices) = 0;
  assert (select count(*) from public.voice_blasts) = 0;
  assert (select count(*) from public.voice_calls) = 0;
  assert pg_temp.fails_with($q$insert into public.voice_blasts (title, source) values ('mine', 'standard')$q$,
    'new row violates row-level security policy for table "voice_blasts"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.voice_blasts) = 0;
  assert (select count(*) from public.voice_calls) = 0;
end $$;
rollback;

-- test: one auto-call reaches a person once; a phone number is digits
begin;
insert into public.voice_blasts (id, campaign_id, title, source) values
  ('b1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'x', 'standard');
insert into public.people (id, campaign_id, phone) values
  ('e1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', '+254700000002');
insert into public.voice_calls (campaign_id, kind, blast_id, person_id, to_phone)
values ('ca000000-0000-4000-8000-000000000002', 'blast', 'b1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', '254700000002');
do $$ begin
  assert pg_temp.fails_with($q$insert into public.voice_calls (campaign_id, kind, blast_id, person_id, to_phone) values ('ca000000-0000-4000-8000-000000000002', 'blast', 'b1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', '254700000002')$q$,
    'duplicate key value violates unique constraint "voice_calls_once_idx"');
  assert pg_temp.fails_with($q$insert into public.voice_calls (campaign_id, kind, to_phone) values ('ca000000-0000-4000-8000-000000000002', 'test', '+2547')$q$,
    'new row for relation "voice_calls" violates check constraint "voice_calls_to_phone_check"');
end $$;
rollback;
