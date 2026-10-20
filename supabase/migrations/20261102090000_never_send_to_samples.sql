-- Schema 43: sample contacts are never messaged.
--
-- Sample people (tags contain 'sample', added by supabase/seeds/sample-activity*.sql to show the
-- console working) carry made-up numbers that may belong to real people. An SMS broadcast counts
-- them as matching the audience but never queues to them; the WhatsApp and auto-call senders skip
-- them the same way in the server code.

create or replace function public.broadcast_estimate(_audience jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'matched',   count(*)::integer,
    'reachable', (count(*) filter (
                    where p.consent_sms and not p.opted_out and not ('sample' = any(p.tags))
                  ))::integer
  )
    from public.people p
   where public.in_broadcast_audience(_audience, p.ward_id, p.segment, p.support_score)
$$;

revoke all on function public.broadcast_estimate(jsonb) from public, anon;
grant execute on function public.broadcast_estimate(jsonb) to authenticated;

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
     and not ('sample' = any(p.tags))
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
as $$ select 43 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
