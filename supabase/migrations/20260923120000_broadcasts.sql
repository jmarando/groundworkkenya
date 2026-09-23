-- Broadcasts: one message to a filtered audience, through the outbox.
--
-- Every send is recorded — who sent what, to which audience, how many — and
-- each queued message points back at it. Mass SMS spends money and speaks for
-- the campaign in public, so only admins and managers can send, enforced here
-- rather than by hiding a button.

create table if not exists public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  -- One per composer: a double-click or a retried request carries the same
  -- key, and the second insert is refused instead of texting everyone twice.
  client_key  uuid not null unique,
  body        text not null check (char_length(body) between 1 and 918),
  channel     text not null default 'sms' check (channel in ('sms')),
  audience    jsonb not null default '{}'::jsonb,
  matched     integer not null default 0,
  recipients  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists broadcasts_created_idx on public.broadcasts (created_at desc);

grant select, insert, update on public.broadcasts to authenticated;
grant all on public.broadcasts to service_role;
alter table public.broadcasts enable row level security;

drop policy if exists "broadcasts readable by team" on public.broadcasts;
drop policy if exists "broadcasts sent by staff" on public.broadcasts;
drop policy if exists "broadcast counts by staff" on public.broadcasts;
create policy "broadcasts readable by team" on public.broadcasts
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "broadcasts sent by staff" on public.broadcasts
  for insert to authenticated with check (public.is_staff(auth.uid()) and created_by = auth.uid());
create policy "broadcast counts by staff" on public.broadcasts
  for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

alter table public.messages
  add column if not exists broadcast_id uuid references public.broadcasts(id) on delete set null;

create index if not exists messages_broadcast_idx on public.messages (broadcast_id) where broadcast_id is not null;

-- Does a person fall inside a broadcast audience? Wards and segments as for
-- polls; "support" optionally narrows to bands of the support score, the
-- same bands the Broadcast screen shows: strong is 70 and up, undecided is
-- 40 to 69. No bands listed means no support filter.
create or replace function public.in_broadcast_audience(
  _audience jsonb, _ward_id uuid, _segment text, _support integer
)
returns boolean
language sql
immutable
as $$
  select public.in_poll_audience(_audience, _ward_id, _segment)
     and (case
            when coalesce(jsonb_typeof(_audience -> 'support'), 'null') <> 'array' then true
            when jsonb_array_length(_audience -> 'support') = 0 then true
            else ((_audience -> 'support') ? 'strong' and coalesce(_support, 0) >= 70)
              or ((_audience -> 'support') ? 'undecided' and coalesce(_support, 0) between 40 and 69)
          end)
$$;

revoke all on function public.in_broadcast_audience(jsonb, uuid, text, integer) from public, anon;
grant execute on function public.in_broadcast_audience(jsonb, uuid, text, integer) to authenticated, service_role;

-- Exactly who a broadcast would reach, counted by the same rule that sends.
create or replace function public.broadcast_estimate(_audience jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'matched',   count(*)::integer,
    'reachable', (count(*) filter (where p.consent_sms and not p.opted_out))::integer
  )
    from public.people p
   where public.in_broadcast_audience(_audience, p.ward_id, p.segment, p.support_score)
$$;

revoke all on function public.broadcast_estimate(jsonb) from public, anon;
grant execute on function public.broadcast_estimate(jsonb) to authenticated;

-- Record the broadcast and queue one message per consenting person, in one
-- transaction. Runs as the caller: only staff may insert the broadcast row,
-- so nobody else gets as far as queueing anything.
create or replace function public.queue_broadcast(_client_key uuid, _audience jsonb, _body text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _id       uuid;
  _matched  integer;
  _queued   integer;
  _earlier  jsonb;
begin
  if coalesce(btrim(_body), '') = '' then
    raise exception 'Write the message first.' using errcode = 'P0001';
  end if;
  -- The word itself: "Stopover at the market" is not an opt-out line.
  if _body !~* '\mstop\M' then
    raise exception 'Say how to opt out, for example "STOP kujiondoa".' using errcode = 'P0001';
  end if;

  insert into public.broadcasts (client_key, body, audience, created_by)
  values (_client_key, btrim(_body), coalesce(_audience, '{}'::jsonb), auth.uid())
  on conflict (client_key) do nothing
  returning id into _id;

  if _id is null then
    -- Same composer, second press: report the send that already happened.
    select jsonb_build_object('id', id, 'matched', matched, 'queued', recipients, 'repeat', true)
      into strict _earlier
      from public.broadcasts where client_key = _client_key;
    return _earlier;
  end if;

  select count(*) into _matched
    from public.people p
   where public.in_broadcast_audience(_audience, p.ward_id, p.segment, p.support_score);

  insert into public.messages
    (person_id, broadcast_id, phone, channel, direction, body, status, outbox_kind)
  select p.id, _id, p.phone, 'sms', 'out', btrim(_body), 'queued', 'broadcast'
    from public.people p
   where not p.opted_out
     and p.consent_sms
     and public.in_broadcast_audience(_audience, p.ward_id, p.segment, p.support_score);
  get diagnostics _queued = row_count;

  update public.broadcasts set matched = _matched, recipients = _queued where id = _id;

  return jsonb_build_object('id', _id, 'matched', _matched, 'queued', _queued, 'repeat', false);
end;
$$;

revoke all on function public.queue_broadcast(uuid, jsonb, text) from public, anon;
grant execute on function public.queue_broadcast(uuid, jsonb, text) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 3 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
