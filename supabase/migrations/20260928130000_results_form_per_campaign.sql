-- Result forms per campaign, and filing kept to the server.
--
-- Each race files its own polling-station form (34A president, 35A MP, 37A
-- governor, ...). The campaign's level already says which race it is, so the
-- photo receipt now reports the level alongside the station, and the server
-- names the right form to the agent.
--
-- The multi-campaign migration granted file_stream_result to signed-in users
-- along with the functions they do call. Agents file through the server with
-- the number the network gave, never from the console, so it goes back to
-- the service role only. (Signed-in callers could not write results anyway:
-- they hold no insert or update rights on stream_results.)

revoke execute on function public.file_stream_result(text, uuid, integer, integer[], integer, text)
  from public, anon, authenticated;
grant execute on function public.file_stream_result(text, uuid, integer, integer[], integer, text)
  to service_role;

-- As before, plus the campaign's level: the form to name in the reply.
create or replace function public.record_form_photo(
  _phone         text,
  _wa_message_id text,
  _wa_media_id   text,
  _caption       text,
  _code          text,
  _stream        integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _st     public.polling_stations;
  _found  integer := _stream;
begin
  select p.* into _st
    from public.polling_stations p
    left join lateral (
      select max(r.filed_at) as last
        from public.stream_results r
       where r.station_id = p.id and r.filed_by = _phone
    ) f on true
   where p.agent_phone = _phone
   order by (upper(p.code) = upper(coalesce(_code, ''))) desc, f.last desc nulls last, p.code
   limit 1;
  if not found then
    return null;
  end if;

  if _found is not null and (_found < 1 or _found > greatest(_st.streams, 1)) then
    _found := null;
  end if;
  if _found is null then
    select r.stream into _found
      from public.stream_results r
     where r.station_id = _st.id
       and r.superseded_at is null
       and not exists (select 1 from public.form_photos f where f.station_id = r.station_id and f.stream = r.stream)
     order by r.filed_at desc
     limit 1;
  end if;
  if _found is null and greatest(_st.streams, 1) = 1 then
    _found := 1;
  end if;

  insert into public.form_photos (station_id, stream, wa_message_id, wa_media_id, caption, from_phone)
  values (_st.id, _found, _wa_message_id, nullif(_wa_media_id, ''), nullif(left(_caption, 500), ''), _phone)
  on conflict (wa_message_id) do nothing;

  return jsonb_build_object(
    'station', _st.code,
    'stream', _found,
    'streams', greatest(_st.streams, 1),
    'level', (select c.level from public.campaigns c where c.id = _st.campaign_id));
end;
$$;

revoke all on function public.record_form_photo(text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_form_photo(text, text, text, text, text, integer) to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 12 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
