-- Poll engine, outbox and opt-out handling.
--
-- Audience selection, sampling and fan-out happen here rather than in the app:
-- one statement, one transaction, and no 1,000-row page limit quietly cutting
-- a 40,000-person launch down to the first thousand.
--
-- Nothing is sent from here. Messages are written as 'queued' and the outbox
-- decides what happens to them: while channels are in dry run they become
-- 'staged' (composed, addressed, never delivered).

-- ------------------------------------------------------------------- polls --

alter table public.polls
  add column if not exists question_sw   text,
  add column if not exists lang          text    not null default 'sw',
  add column if not exists weighting     boolean not null default true,
  add column if not exists reward_method text    not null default 'none',
  add column if not exists reward_amount integer not null default 0,
  add column if not exists launched_at   timestamptz;

-- Existing polls describe their reward as a label ("Airtime KES 20"). Carry
-- that into the fields the engine pays from, so a live poll keeps its promise.
update public.polls
   set reward_method = case when reward ~* 'm-?pesa' then 'mpesa' else 'airtime' end,
       reward_amount = least(500, (regexp_match(reward, '(\d+)'))[1]::integer)
 where reward_method = 'none'
   and reward ~* '(airtime|m-?pesa)'
   and reward ~ '\d';

alter table public.polls drop constraint if exists polls_lang_check;
alter table public.polls drop constraint if exists polls_reward_method_check;
alter table public.polls drop constraint if exists polls_reward_amount_check;
alter table public.polls add constraint polls_lang_check check (lang in ('sw', 'en'));
alter table public.polls add constraint polls_reward_method_check
  check (reward_method in ('none', 'airtime', 'mpesa'));
-- A hard ceiling on what one respondent can be paid. An extra zero typed into
-- the builder, multiplied by a constituency, is a campaign-ending sum.
alter table public.polls add constraint polls_reward_amount_check
  check (reward_amount between 0 and 500);

-- ------------------------------------------------------------ poll invites --
-- Who was actually invited, per channel: the denominator for response rates,
-- and how an inbound "2" is matched to the poll it answers.

create table if not exists public.poll_invites (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls(id)  on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  channel   text not null default 'sms',
  sent_at   timestamptz not null default now(),
  unique (poll_id, person_id, channel)
);

create index if not exists poll_invites_person_idx on public.poll_invites (person_id, sent_at desc);

grant select, insert on public.poll_invites to authenticated;
grant all on public.poll_invites to service_role;
alter table public.poll_invites enable row level security;

drop policy if exists "invites readable by team" on public.poll_invites;
drop policy if exists "invites writable by team" on public.poll_invites;
create policy "invites readable by team" on public.poll_invites
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "invites writable by team" on public.poll_invites
  for insert to authenticated with check (public.is_team_member(auth.uid()));

-- ------------------------------------------------------------------ people --

alter table public.people
  add column if not exists opted_out_at    timestamptz,
  add column if not exists last_inbound_at timestamptz;

update public.people
   set opted_out_at = updated_at
 where opted_out and opted_out_at is null;

-- ---------------------------------------------------------------- messages --
-- messages.kind already belongs to the social integration (dm / comment /
-- mention), so the outbox keeps its own column rather than overloading it.

alter table public.messages
  add column if not exists outbox_kind text    not null default 'broadcast',
  add column if not exists attempts    integer not null default 0,
  add column if not exists claimed_at  timestamptz;

create index if not exists messages_outbox_idx
  on public.messages (status, created_at)
  where direction = 'out';

create index if not exists messages_person_idx on public.messages (person_id, created_at desc);

-- ---------------------------------------------------------------- audience --

-- Does this person fall inside a poll's audience? Audiences are
-- {"wardIds": [...], "segments": [...]}; an empty or missing list means "any".
-- CASE rather than AND/OR: Postgres does not promise to evaluate those left to
-- right, and jsonb_array_length() raises on anything that is not an array.
create or replace function public.in_poll_audience(_audience jsonb, _ward_id uuid, _segment text)
returns boolean
language sql
immutable
as $$
  select
    (case
       when coalesce(jsonb_typeof(_audience -> 'wardIds'), 'null') <> 'array' then true
       when jsonb_array_length(_audience -> 'wardIds') = 0 then true
       else coalesce((_audience -> 'wardIds') ? (_ward_id::text), false)
     end)
    and
    (case
       when coalesce(jsonb_typeof(_audience -> 'segments'), 'null') <> 'array' then true
       when jsonb_array_length(_audience -> 'segments') = 0 then true
       else coalesce((_audience -> 'segments') ? _segment, false)
     end)
$$;

revoke all on function public.in_poll_audience(jsonb, uuid, text) from public, anon;
grant execute on function public.in_poll_audience(jsonb, uuid, text) to authenticated, service_role;

-- How many people a candidate audience reaches. Runs as the caller, so row
-- level security applies: someone awaiting approval counts nobody.
create or replace function public.audience_estimate(_audience jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'people',    count(*)::integer,
    'reachable', (count(*) filter (where p.consent_sms))::integer
  )
    from public.people p
   where not p.opted_out
     and public.in_poll_audience(_audience, p.ward_id, p.segment)
$$;

revoke all on function public.audience_estimate(jsonb) from public, anon;
grant execute on function public.audience_estimate(jsonb) to authenticated;

-- Ward and segment sizes for the poll builder.
create or replace function public.audience_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total',          (select count(*)::integer from public.people),
    'reachableBySms', (select count(*)::integer from public.people where consent_sms and not opted_out),
    'byWard', coalesce((
      select jsonb_agg(jsonb_build_object('wardId', ward_id, 'people', n, 'reachable', r))
        from (select ward_id,
                     count(*)::integer as n,
                     (count(*) filter (where consent_sms and not opted_out))::integer as r
                from public.people
               where ward_id is not null
               group by ward_id) w), '[]'::jsonb),
    'bySegment', coalesce((
      select jsonb_agg(jsonb_build_object('segment', segment, 'people', n))
        from (select segment, count(*)::integer as n
                from public.people
               where segment is not null
               group by segment) s), '[]'::jsonb)
  )
$$;

revoke all on function public.audience_counts() from public, anon;
grant execute on function public.audience_counts() to authenticated;

-- ------------------------------------------------------------------ launch --

-- Launch a draft poll: claim it, pick the audience, write one invite per
-- person and one queued SMS each.
--
-- Runs as the caller: row level security decides who may launch (polls are
-- managed by admins and managers) and who may be read and written.
--
-- The status flip comes first and is conditional, so two people pressing
-- Launch at once cannot text the same audience twice: the second finds no
-- draft to claim.
create or replace function public.launch_poll(_poll_id uuid, _sms_body text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _poll      public.polls%rowtype;
  _sample    integer;
  _audience  integer;
  _reachable integer;
  _queued    integer := 0;
begin
  update public.polls
     set status = 'live', opens_at = now(), launched_at = now()
   where id = _poll_id
     and status in ('draft', 'scheduled')
  returning * into _poll;

  if not found then
    raise exception 'That poll is not a draft, or you are not allowed to launch it.'
      using errcode = 'P0001';
  end if;

  _sample := coalesce(_poll.sample_target, 0);

  select count(*), count(*) filter (where p.consent_sms)
    into _audience, _reachable
    from public.people p
   where not p.opted_out
     and public.in_poll_audience(_poll.audience, p.ward_id, p.segment);

  if 'sms' = any(_poll.channels) and coalesce(btrim(_sms_body), '') <> '' then
    -- Stratified sample: every ward keeps its share of the audience, so a
    -- sample of 2,000 from a county does not come back 60% from one estate.
    --
    -- Largest-remainder allocation: each ward takes its exact quota rounded
    -- down, and the places left over go to the wards with the biggest
    -- fractions. Every ward lands within one person of its true share and the
    -- total is exactly the target. The simpler alternatives both fail on real
    -- ward sizes: rounding each quota falls short (85 wards of 12 sampled to
    -- 100 round to one each and return 85), and divisor methods can starve a
    -- large ward when many small ones sit near a rounding boundary.
    with reachable as materialized (
      select p.id, p.phone, p.ward_id
        from public.people p
       where not p.opted_out
         and p.consent_sms
         and public.in_poll_audience(_poll.audience, p.ward_id, p.segment)
    ),
    total as materialized (
      select count(*) as n from reachable
    ),
    wards as materialized (
      select ward_id, count(*)::numeric * _sample / (select n from total) as quota
        from reachable
       group by ward_id
    ),
    alloc as materialized (
      select ward_id,
             floor(quota)::integer
               + case when row_number() over (order by quota - floor(quota) desc, random())
                           <= _sample - sum(floor(quota)) over ()
                      then 1 else 0 end as take
        from wards
    ),
    ranked as materialized (
      select r.id, r.phone, r.ward_id,
             row_number() over (partition by r.ward_id order by random()) as rn
        from reachable r
    ),
    chosen as materialized (
      select k.id, k.phone
        from ranked k
        left join alloc a on a.ward_id is not distinct from k.ward_id
       where _sample <= 0
          or (select n from total) <= _sample
          or k.rn <= a.take
    ),
    invited as (
      insert into public.poll_invites (poll_id, person_id, channel)
      select _poll_id, c.id, 'sms' from chosen c
      on conflict (poll_id, person_id, channel) do nothing
      returning person_id
    )
    insert into public.messages
      (person_id, poll_id, phone, channel, direction, body, status, outbox_kind)
    select c.id, _poll_id, c.phone, 'sms', 'out', _sms_body, 'queued', 'poll_invite'
      from chosen c
      join invited i on i.person_id = c.id;

    get diagnostics _queued = row_count;
  end if;

  return jsonb_build_object(
    'code',      _poll.code,
    'audience',  _audience,
    'reachable', _reachable,
    'queued',    _queued
  );
end;
$$;

revoke all on function public.launch_poll(uuid, text) from public, anon;
grant execute on function public.launch_poll(uuid, text) to authenticated;

-- ----------------------------------------------------------------- results --

-- Everything the results panel needs, already aggregated: answers by ward,
-- option and channel, and the audience frame by ward that the weights come
-- from. A 40,000-answer poll comes back as a few hundred rows.
create or replace function public.poll_tallies(_poll_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  _audience jsonb;
begin
  select audience into _audience from public.polls where id = _poll_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'wardId', ward_id, 'optionKey', option_key, 'channel', channel, 'n', n))
        from (select ward_id, option_key, channel, count(*)::integer as n
                from public.poll_responses
               where poll_id = _poll_id
               group by ward_id, option_key, channel) t), '[]'::jsonb),
    'frame', coalesce((
      select jsonb_agg(jsonb_build_object('wardId', ward_id, 'n', n))
        from (select p.ward_id, count(*)::integer as n
                from public.people p
               where not p.opted_out
                 and public.in_poll_audience(_audience, p.ward_id, p.segment)
               group by p.ward_id) f), '[]'::jsonb),
    'invites', (select count(*)::integer from public.poll_invites where poll_id = _poll_id)
  );
end;
$$;

revoke all on function public.poll_tallies(uuid) from public, anon;
grant execute on function public.poll_tallies(uuid) to authenticated;

-- ------------------------------------------------------------------ outbox --

-- Should this message be held back? Asked at send time, not queue time: a
-- broadcast takes minutes to drain, and someone who replies STOP in minute
-- one must not receive the message queued for them in minute zero.
create or replace function public.outbox_block_reason(
  _channel          text,
  _kind             text,
  _opted_out        boolean,
  _consent_sms      boolean,
  _consent_whatsapp boolean
)
returns text
language sql
immutable
as $$
  select case
    -- A request to confirm consent is the one unsolicited message allowed,
    -- and never to someone who has already said STOP.
    when _kind = 'consent_check' then
      case when coalesce(_opted_out, false) then 'Opted out: consent requests are not sent.' end
    -- A direct answer to someone who just messaged in, including confirming
    -- their opt-out, is transactional.
    when _kind in ('reply', 'poll_thanks') then null
    -- A reward is owed for an answer already given; opting out afterwards
    -- does not cancel it.
    when _channel in ('airtime', 'mpesa') then null
    -- The person record is gone (deleted, or erased on request): send nothing.
    when _opted_out is null then 'No person on record for this message.'
    when _opted_out then 'Opted out before this message was sent.'
    when _channel = 'sms' and not coalesce(_consent_sms, false) then 'No SMS consent on record.'
    when _channel = 'wa' and not coalesce(_consent_whatsapp, false) then 'No WhatsApp consent on record.'
  end
$$;

revoke all on function public.outbox_block_reason(text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.outbox_block_reason(text, text, boolean, boolean, boolean) to service_role;

-- Work through the queue. In dry run, messages that pass the consent check
-- become 'staged'; live, they become 'sending' and are handed back for the
-- provider to deliver. SKIP LOCKED lets two workers run without both picking
-- up -- and sending -- the same message.
create or replace function public.process_outbox(_live boolean default false, _limit integer default 5000)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _staged  integer;
  _blocked integer;
  _sending jsonb;
begin
  -- A worker that died mid-send leaves rows 'sending'. Retry them, up to a point.
  update public.messages
     set status = case when attempts >= 3 then 'failed' else 'queued' end,
         error  = case when attempts >= 3 then coalesce(error, 'Gave up after 3 attempts.') else error end
   where status = 'sending'
     and claimed_at < now() - interval '10 minutes';

  with batch as materialized (
    select m.id,
           public.outbox_block_reason(
             m.channel, m.outbox_kind, p.opted_out, p.consent_sms, p.consent_whatsapp
           ) as reason
      from public.messages m
      left join public.people p on p.id = m.person_id
     where m.direction = 'out'
       and m.status = 'queued'
     order by m.created_at
     limit greatest(1, least(coalesce(_limit, 5000), 50000))
       for update of m skip locked
  ),
  done as (
    update public.messages m
       set status     = case when b.reason is not null then 'failed'
                             when _live then 'sending'
                             else 'staged' end,
           error      = b.reason,
           claimed_at = case when b.reason is null and _live then now() else m.claimed_at end,
           attempts   = case when b.reason is null and _live then m.attempts + 1 else m.attempts end
      from batch b
     where m.id = b.id
    returning m.id, m.status, m.channel, m.phone, m.body, m.outbox_kind, m.poll_id
  )
  select count(*) filter (where status = 'staged'),
         count(*) filter (where status = 'failed'),
         coalesce(jsonb_agg(jsonb_build_object(
                    'id', id, 'channel', channel, 'phone', phone, 'body', body,
                    'kind', outbox_kind, 'pollId', poll_id))
                  filter (where status = 'sending'), '[]'::jsonb)
    into _staged, _blocked, _sending
    from done;

  return jsonb_build_object('staged', _staged, 'blocked', _blocked, 'sending', _sending, 'live', _live);
end;
$$;

revoke all on function public.process_outbox(boolean, integer) from public, anon, authenticated;
grant execute on function public.process_outbox(boolean, integer) to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 2 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
