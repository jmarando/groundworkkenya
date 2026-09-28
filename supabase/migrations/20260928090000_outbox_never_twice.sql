-- Live SMS: never send the same message twice, stay under a daily limit, and
-- record what the provider said in one round trip.
--
-- The outbox claims rows as 'sending'. Just before a batch goes to Africa's
-- Talking the worker moves it to 'submitting'. The difference matters when a
-- worker dies part way:
--   'sending'     claimed, not yet handed to the provider. Nothing went out,
--                 so the row goes back to the queue.
--   'submitting'  handed to the provider, answer not recorded. It may well
--                 have been delivered, so it fails as "outcome unknown" and is
--                 never sent again on its own. A missing text can be resent by
--                 a person who has checked; a duplicate cannot be taken back.
-- Every claim carries a claim_id, and only the worker holding it can move or
-- record its rows: a slow worker cannot act on rows that were re-queued and
-- claimed by another in the meantime.

alter table public.messages add column if not exists claim_id uuid;

create index if not exists messages_claim_idx
  on public.messages (claim_id) where claim_id is not null;

-- The daily limit counts SMS claimed since midnight in Nairobi.
create index if not exists messages_sms_claimed_idx
  on public.messages (claimed_at)
  where direction = 'out' and channel = 'sms' and claimed_at is not null;

-- The old signature is replaced, not overloaded: PostgREST refuses to choose
-- between two functions that both accept (_live, _limit).
drop function if exists public.process_outbox(boolean, integer);

-- Work through the queue. In dry run, messages that pass the consent check
-- become 'staged'; live, they become 'sending' under a new claim and are
-- handed back for the provider to deliver.
--
-- Only the outbox's own channels are touched. Social replies wait in
-- 'queued' for their own sender and must not be failed here.
--
-- Replies to people who wrote in go ahead of a broadcast queued before them.
--
-- _daily_cap limits SMS claimed per Nairobi day; what does not fit stays
-- queued for tomorrow, or until the limit is raised. Null means no limit.
create or replace function public.process_outbox(
  _live      boolean default false,
  _limit     integer default 5000,
  _daily_cap integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _claim    uuid := gen_random_uuid();
  _day      timestamptz := date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  _room     integer;
  _requeued integer;
  _unknown  integer;
  _staged   integer;
  _blocked  integer;
  _held     integer;
  _sending  jsonb;
begin
  -- One claimer at a time, so the daily count and the claim agree.
  perform pg_advisory_xact_lock(hashtext('groundwork.process_outbox'));

  -- Claimed but never handed over: nothing went out, so queue it again.
  with stale as (
    update public.messages
       set status   = case when attempts >= 3 then 'failed' else 'queued' end,
           error    = case when attempts >= 3 then coalesce(error, 'Gave up after 3 attempts.') else error end,
           claim_id = null
     where status = 'sending'
       and direction = 'out'
       and claimed_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*) into _requeued from stale;

  -- Handed over and never answered: it may have been delivered. Not retried.
  with lost as (
    update public.messages
       set status   = 'failed',
           error    = 'Outcome unknown: sending was interrupted after the text reached the SMS provider. '
                   || 'Check whether it arrived before sending it again.',
           claim_id = null
     where status = 'submitting'
       and direction = 'out'
       and claimed_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*) into _unknown from lost;

  if _live and _daily_cap is not null then
    select greatest(0, _daily_cap - count(*))
      into _room
      from public.messages
     where direction = 'out'
       and channel = 'sms'
       and claimed_at >= _day
       and (status in ('sending', 'submitting', 'sent', 'delivered')
            or (status = 'failed' and provider_ref is not null));
  end if;

  with batch as materialized (
    select m.id,
           m.channel,
           m.outbox_kind in ('reply', 'poll_thanks', 'inbox_reply') as urgent,
           m.created_at,
           public.outbox_block_reason(
             m.channel, m.outbox_kind, p.opted_out, p.consent_sms, p.consent_whatsapp
           ) as reason
      from public.messages m
      left join public.people p on p.id = m.person_id
     where m.direction = 'out'
       and m.status = 'queued'
       and m.channel in ('sms', 'wa', 'airtime', 'mpesa')
     order by urgent desc, m.created_at, m.id
     limit greatest(1, least(coalesce(_limit, 5000), 50000))
       for update of m skip locked
  ),
  -- Window functions cannot share a query level with FOR UPDATE.
  counted as (
    select b.*,
           count(*) filter (where b.channel = 'sms' and b.reason is null)
             over (order by b.urgent desc, b.created_at, b.id rows unbounded preceding) as sms_n
      from batch b
  ),
  chosen as (
    select c.*,
           (_live and _room is not null and c.channel = 'sms' and c.reason is null and c.sms_n > _room) as held
      from counted c
  ),
  done as (
    update public.messages m
       set status     = case when c.reason is not null then 'failed'
                             when _live then 'sending'
                             else 'staged' end,
           error      = c.reason,
           claimed_at = case when c.reason is null and _live then now() else m.claimed_at end,
           claim_id   = case when c.reason is null and _live then _claim else m.claim_id end,
           attempts   = case when c.reason is null and _live then m.attempts + 1 else m.attempts end
      from chosen c
     where m.id = c.id
       and not c.held
    returning m.id, m.status, m.channel, m.phone, m.body, m.outbox_kind, m.poll_id
  )
  select count(*) filter (where status = 'staged'),
         count(*) filter (where status = 'failed'),
         coalesce(jsonb_agg(jsonb_build_object(
                    'id', id, 'channel', channel, 'phone', phone, 'body', body,
                    'kind', outbox_kind, 'pollId', poll_id))
                  filter (where status = 'sending'), '[]'::jsonb),
         (select count(*) from chosen where held)
    into _staged, _blocked, _sending, _held
    from done;

  return jsonb_build_object(
    'live',     _live,
    'claim',    case when _live then _claim end,
    'staged',   _staged,
    'blocked',  _blocked,
    'held',     _held,
    'requeued', _requeued,
    'unknown',  _unknown,
    'sending',  _sending
  );
end;
$$;

revoke all on function public.process_outbox(boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.process_outbox(boolean, integer, integer) to service_role;

-- Move claimed rows to 'submitting' just before they go to the provider.
-- Returns the ids actually moved; only those may be sent.
create or replace function public.outbox_mark_submitting(_claim uuid, _ids uuid[])
returns uuid[]
language sql
security invoker
set search_path = public
as $$
  with moved as (
    update public.messages
       set status = 'submitting'
     where claim_id = _claim
       and status = 'sending'
       and id = any(_ids)
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from moved
$$;

revoke all on function public.outbox_mark_submitting(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.outbox_mark_submitting(uuid, uuid[]) to service_role;

-- Record the provider's answer for a batch in one round trip.
-- _results: [{"id": uuid, "ok": bool, "ref": text, "cost": number, "error": text}]
create or replace function public.outbox_record(_claim uuid, _results jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with r as (
    select distinct on ((x ->> 'id')::uuid)
           (x ->> 'id')::uuid                     as id,
           coalesce((x ->> 'ok')::boolean, false) as ok,
           nullif(x ->> 'ref', '')                as ref,
           case when x ->> 'cost' ~ '^[0-9]+(\.[0-9]+)?$'
                then (x ->> 'cost')::numeric end  as cost,
           nullif(left(coalesce(x ->> 'error', ''), 500), '') as err
      from jsonb_array_elements(coalesce(_results, '[]'::jsonb)) x
     order by (x ->> 'id')::uuid
  ),
  recorded as (
    update public.messages m
       set status       = case when r.ok then 'sent' else 'failed' end,
           provider_ref = case when r.ok then r.ref else m.provider_ref end,
           sent_at      = case when r.ok then now() else m.sent_at end,
           cost_kes     = case when r.ok then coalesce(r.cost, m.cost_kes) else m.cost_kes end,
           error        = case when r.ok then null else coalesce(r.err, 'Not sent.') end,
           claim_id     = null
      from r
     where m.id = r.id
       and m.claim_id = _claim
       and m.status in ('sending', 'submitting')
    returning 1
  )
  select count(*)::integer from recorded
$$;

revoke all on function public.outbox_record(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.outbox_record(uuid, jsonb) to service_role;

-- Hand back rows this worker claimed but did not get to (time ran out, or it
-- stopped after trouble with the provider). They were never handed over, so
-- the attempt does not count.
create or replace function public.outbox_release(_claim uuid, _ids uuid[])
returns integer
language sql
security invoker
set search_path = public
as $$
  with released as (
    update public.messages
       set status   = 'queued',
           claim_id = null,
           attempts = greatest(0, attempts - 1)
     where claim_id = _claim
       and status = 'sending'
       and id = any(_ids)
    returning 1
  )
  select count(*)::integer from released
$$;

revoke all on function public.outbox_release(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.outbox_release(uuid, uuid[]) to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 9 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
