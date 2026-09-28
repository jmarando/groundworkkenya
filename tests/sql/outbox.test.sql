-- The outbox: consent at send time, claims, the daily limit, and the rule
-- that a text which may have reached the provider is never sent twice.
-- Run with tests/sql/run.sh. Each test rolls back, so they do not interact.

\set QUIET on
\set ON_ERROR_STOP on

create or replace function pg_temp.person(_phone text, _sms boolean, _stop boolean default false)
returns uuid language sql as $$
  insert into public.people (phone, consent_sms, opted_out)
  values (_phone, _sms, _stop) returning id
$$;

create or replace function pg_temp.queue(
  _person uuid, _body text, _kind text default 'broadcast', _channel text default 'sms',
  _at timestamptz default now()
)
returns uuid language sql as $$
  insert into public.messages (person_id, phone, channel, direction, body, status, outbox_kind, created_at)
  select _person, coalesce((select phone from public.people where id = _person), '+254700000000'),
         _channel, 'out', _body, 'queued', _kind, _at
  returning id
$$;

create or replace function pg_temp.status_of(_id uuid)
returns text language sql as $$ select status from public.messages where id = _id $$;

-- test: dry run stages what passes the consent check and fails what does not
begin;
do $$
declare
  ok uuid := pg_temp.person('+254700000001', true);
  no_consent uuid := pg_temp.person('+254700000002', false);
  stopped uuid := pg_temp.person('+254700000003', true, true);
  m1 uuid := pg_temp.queue(ok, 'hello');
  m2 uuid := pg_temp.queue(no_consent, 'hello');
  m3 uuid := pg_temp.queue(stopped, 'hello');
  m4 uuid := pg_temp.queue(stopped, 'You are unsubscribed', 'reply');
  r jsonb;
begin
  r := public.process_outbox(false, 100);
  assert (r ->> 'staged')::int = 2, 'two staged: ' || r;
  assert (r ->> 'blocked')::int = 2, 'two blocked: ' || r;
  assert r -> 'claim' = 'null'::jsonb, 'no claim in dry run: ' || r;
  assert pg_temp.status_of(m1) = 'staged';
  assert (select error from public.messages where id = m2) = 'No SMS consent on record.';
  assert (select error from public.messages where id = m3) = 'Opted out before this message was sent.';
  assert pg_temp.status_of(m4) = 'staged', 'confirming an opt-out still goes';
end $$;
rollback;

-- test: a live claim marks rows sending under one claim id
begin;
do $$
declare
  p uuid := pg_temp.person('+254700000001', true);
  m uuid := pg_temp.queue(p, 'hello');
  r jsonb;
  row public.messages;
begin
  r := public.process_outbox(true, 100, null);
  select * into row from public.messages where id = m;
  assert row.status = 'sending';
  assert row.claim_id = (r ->> 'claim')::uuid, 'claim recorded on the row';
  assert row.attempts = 1 and row.claimed_at is not null;
  assert jsonb_array_length(r -> 'sending') = 1;
  assert r -> 'sending' -> 0 ->> 'phone' = '+254700000001';
end $$;
rollback;

-- test: social replies waiting for their own sender are left alone
begin;
do $$
declare
  p uuid := pg_temp.person('+254700000001', true);
  fb uuid := pg_temp.queue(p, 'thanks for the comment', 'broadcast', 'facebook');
begin
  perform public.process_outbox(true, 100, null);
  perform public.process_outbox(false, 100);
  assert pg_temp.status_of(fb) = 'queued', 'facebook row untouched';
end $$;
rollback;

-- test: a reply to someone who wrote in goes ahead of an earlier broadcast
begin;
do $$
declare
  a uuid := pg_temp.person('+254700000001', true);
  b uuid := pg_temp.person('+254700000002', true);
  bulk uuid := pg_temp.queue(a, 'rally at noon', 'broadcast', 'sms', now() - interval '5 minutes');
  reply uuid := pg_temp.queue(b, 'Asante, we got your answer', 'poll_thanks');
  r jsonb;
begin
  r := public.process_outbox(true, 1, null);
  assert r -> 'sending' -> 0 ->> 'id' = reply::text, 'reply first: ' || r;
  assert pg_temp.status_of(bulk) = 'queued';
end $$;
rollback;

-- test: the daily limit holds SMS back without failing them
begin;
do $$
declare
  p1 uuid := pg_temp.person('+254700000001', true);
  p2 uuid := pg_temp.person('+254700000002', true);
  p3 uuid := pg_temp.person('+254700000003', true);
  p4 uuid := pg_temp.person('+254700000004', false);
  earlier uuid := pg_temp.queue(p1, 'this morning');
  m1 uuid := pg_temp.queue(p1, 'one', 'broadcast', 'sms', now() - interval '3 minutes');
  m2 uuid := pg_temp.queue(p2, 'two', 'broadcast', 'sms', now() - interval '2 minutes');
  m3 uuid := pg_temp.queue(p3, 'three', 'broadcast', 'sms', now() - interval '1 minute');
  blocked uuid := pg_temp.queue(p4, 'no consent');
  airtime uuid := pg_temp.queue(p1, 'KES 20 airtime', 'reward', 'airtime');
  r jsonb;
begin
  -- One text already went out today.
  update public.messages
     set status = 'sent', claimed_at = now(), provider_ref = 'ATXid_1'
   where id = earlier;

  r := public.process_outbox(true, 100, 2);
  assert (r ->> 'held')::int = 2, 'two held: ' || r;
  assert pg_temp.status_of(m1) = 'sending', 'oldest fits under the limit';
  assert pg_temp.status_of(m2) = 'queued' and pg_temp.status_of(m3) = 'queued', 'rest wait';
  assert pg_temp.status_of(blocked) = 'failed', 'consent failures are not held';
  assert pg_temp.status_of(airtime) = 'sending', 'the limit is for SMS only';

  -- Texts from before midnight in Nairobi do not count against today.
  update public.messages
     set status = 'sent', provider_ref = 'ATXid_2', claimed_at = now() - interval '2 days'
   where id in (earlier, m1);
  r := public.process_outbox(true, 100, 2);
  assert pg_temp.status_of(m2) = 'sending' and pg_temp.status_of(m3) = 'sending', 'room again: ' || r;
end $$;
rollback;

-- test: only the claim holder can mark, record or release its rows
begin;
do $$
declare
  p uuid := pg_temp.person('+254700000001', true);
  m uuid := pg_temp.queue(p, 'hello');
  claim uuid;
  other uuid := gen_random_uuid();
  moved uuid[];
begin
  claim := (public.process_outbox(true, 100, null) ->> 'claim')::uuid;

  assert cardinality(public.outbox_mark_submitting(other, array[m])) = 0, 'stranger cannot mark';
  assert public.outbox_record(other, jsonb_build_array(jsonb_build_object('id', m, 'ok', true, 'ref', 'x'))) = 0,
    'stranger cannot record';
  assert public.outbox_release(other, array[m]) = 0, 'stranger cannot release';
  assert pg_temp.status_of(m) = 'sending';

  moved := public.outbox_mark_submitting(claim, array[m]);
  assert moved = array[m];
  assert pg_temp.status_of(m) = 'submitting';
  assert cardinality(public.outbox_mark_submitting(claim, array[m])) = 0, 'marking twice moves nothing';
  assert public.outbox_release(claim, array[m]) = 0, 'a submitted row cannot go back to the queue';
end $$;
rollback;

-- test: recording the provider's answer
begin;
do $$
declare
  a uuid := pg_temp.person('+254700000001', true);
  b uuid := pg_temp.person('+254700000002', true);
  ma uuid := pg_temp.queue(a, 'hello');
  mb uuid := pg_temp.queue(b, 'hello');
  claim uuid;
  n integer;
  row public.messages;
begin
  claim := (public.process_outbox(true, 100, null) ->> 'claim')::uuid;
  perform public.outbox_mark_submitting(claim, array[ma, mb]);

  n := public.outbox_record(claim, jsonb_build_array(
    jsonb_build_object('id', ma, 'ok', true, 'ref', 'ATXid_a', 'cost', 0.8),
    jsonb_build_object('id', mb, 'ok', false, 'error', 'InvalidPhoneNumber: not a valid phone number')
  ));
  assert n = 2, 'both recorded';

  select * into row from public.messages where id = ma;
  assert row.status = 'sent' and row.provider_ref = 'ATXid_a' and row.cost_kes = 0.8;
  assert row.sent_at is not null and row.claim_id is null and row.error is null;

  select * into row from public.messages where id = mb;
  assert row.status = 'failed' and row.error like 'InvalidPhoneNumber%' and row.provider_ref is null;

  -- A repeated record call (a retry after a lost answer) changes nothing.
  assert public.outbox_record(claim, jsonb_build_array(
    jsonb_build_object('id', mb, 'ok', true, 'ref', 'ATXid_b'))) = 0;
  assert pg_temp.status_of(mb) = 'failed';

  -- A cost that is not a number is ignored rather than breaking the batch.
  assert public.outbox_record(claim, '[{"id": "00000000-0000-0000-0000-000000000000", "ok": true, "cost": "KES 1"}]') = 0;
end $$;
rollback;

-- test: releasing unsent rows gives the attempt back
begin;
do $$
declare
  p uuid := pg_temp.person('+254700000001', true);
  m uuid := pg_temp.queue(p, 'hello');
  claim uuid;
begin
  claim := (public.process_outbox(true, 100, null) ->> 'claim')::uuid;
  assert public.outbox_release(claim, array[m]) = 1;
  assert pg_temp.status_of(m) = 'queued';
  assert (select attempts from public.messages where id = m) = 0;
  assert (select claim_id from public.messages where id = m) is null;
end $$;
rollback;

-- test: a dead worker's rows: unsent ones retry, handed-over ones never do
begin;
do $$
declare
  p uuid := pg_temp.person('+254700000001', true);
  never_sent uuid := pg_temp.queue(p, 'a');
  tired uuid := pg_temp.queue(p, 'b');
  handed_over uuid := pg_temp.queue(p, 'c');
  fresh uuid := pg_temp.queue(p, 'd');
  wa_reply uuid;
  r jsonb;
begin
  update public.messages set status = 'sending', claim_id = gen_random_uuid(), attempts = 1,
         claimed_at = now() - interval '11 minutes' where id = never_sent;
  update public.messages set status = 'sending', claim_id = gen_random_uuid(), attempts = 3,
         claimed_at = now() - interval '11 minutes' where id = tired;
  update public.messages set status = 'submitting', claim_id = gen_random_uuid(), attempts = 1,
         claimed_at = now() - interval '11 minutes' where id = handed_over;
  update public.messages set status = 'submitting', claim_id = gen_random_uuid(), attempts = 1,
         claimed_at = now() - interval '2 minutes' where id = fresh;
  -- A WhatsApp inbox reply is written 'sending' by the console, never claimed.
  insert into public.messages (person_id, phone, channel, direction, body, status, outbox_kind)
  values (p, '+254700000001', 'whatsapp', 'out', 'hi', 'sending', 'inbox_reply')
  returning id into wa_reply;

  r := public.process_outbox(false, 100);
  assert (r ->> 'requeued')::int = 2 and (r ->> 'unknown')::int = 1, 'counts: ' || r;
  -- Re-queued in the sweep, then staged by the same dry run.
  assert pg_temp.status_of(never_sent) = 'staged';
  assert pg_temp.status_of(tired) = 'failed';
  assert (select error from public.messages where id = tired) = 'Gave up after 3 attempts.';
  assert pg_temp.status_of(handed_over) = 'failed';
  assert (select error from public.messages where id = handed_over) like 'Outcome unknown%';
  assert pg_temp.status_of(fresh) = 'submitting', 'a worker still inside its window is left alone';
  assert pg_temp.status_of(wa_reply) = 'sending', 'console WhatsApp replies are not the outbox''s';
end $$;
rollback;

-- test: a slow worker cannot send rows that were re-queued and claimed again
begin;
do $$
declare
  p uuid := pg_temp.person('+254700000001', true);
  m uuid := pg_temp.queue(p, 'hello');
  slow uuid;
  fast uuid;
begin
  slow := (public.process_outbox(true, 100, null) ->> 'claim')::uuid;
  -- The slow worker stalls past the window; the sweep re-queues and another claims.
  update public.messages set claimed_at = now() - interval '11 minutes' where id = m;
  fast := (public.process_outbox(true, 100, null) ->> 'claim')::uuid;
  assert fast <> slow and (select claim_id from public.messages where id = m) = fast;

  assert cardinality(public.outbox_mark_submitting(slow, array[m])) = 0, 'the slow worker must not send';
  assert public.outbox_record(slow, jsonb_build_array(jsonb_build_object('id', m, 'ok', true, 'ref', 'x'))) = 0;
  assert cardinality(public.outbox_mark_submitting(fast, array[m])) = 1, 'the current holder can';
end $$;
rollback;

-- test: console users cannot run the outbox or touch claims
begin;
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.process_outbox(boolean, integer, integer)',
    'public.outbox_mark_submitting(uuid, uuid[])',
    'public.outbox_record(uuid, jsonb)',
    'public.outbox_release(uuid, uuid[])'
  ] loop
    assert not has_function_privilege('authenticated', fn, 'execute'), fn || ' open to authenticated';
    assert not has_function_privilege('anon', fn, 'execute'), fn || ' open to anon';
    assert has_function_privilege('service_role', fn, 'execute'), fn || ' closed to service_role';
  end loop;
  assert not exists (
    select 1 from pg_proc where proname = 'process_outbox' and pronargs = 2
  ), 'old two-argument process_outbox is gone';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 9; end $$;
