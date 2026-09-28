-- Form 34A filing by polling agents: counts over USSD, the photo on WhatsApp.
-- See docs/superpowers/specs/2026-09-28-form-34a-filing-design.md.
--
-- A polling agent is the phone number on their station. USSD and WhatsApp
-- carry a number the network vouches for, so agents file without accounts.
-- Each stream's filing is kept; a later one for the same stream supersedes
-- it. The station's `results` are recomputed from the current filings, so the
-- war room's tally and coverage read them as before.

-- ---------------------------------------------------------------- ballot --

create table if not exists public.ballot_candidates (
  id         uuid primary key default gen_random_uuid(),
  -- The order agents key votes in, as printed on the ballot.
  position   smallint not null unique check (position between 1 and 30),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  party      text check (char_length(party) <= 30),
  ours       boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists ballot_candidates_name_key
  on public.ballot_candidates (lower(btrim(name)));

alter table public.ballot_candidates enable row level security;
revoke all on public.ballot_candidates from anon, authenticated;
grant select on public.ballot_candidates to authenticated;
grant all on public.ballot_candidates to service_role;
drop policy if exists "ballot readable by team" on public.ballot_candidates;
create policy "ballot readable by team" on public.ballot_candidates
  for select to authenticated using (public.is_team_member(auth.uid()));

-- ------------------------------------------------------- stream results --

create table if not exists public.stream_results (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references public.polling_stations(id) on delete cascade,
  stream        smallint not null check (stream between 1 and 30),
  -- {"<ballot candidate id>": votes}
  votes         jsonb not null,
  valid_votes   integer not null check (valid_votes >= 0),
  rejected      integer not null check (rejected >= 0),
  -- The agent's number, as the network gave it.
  filed_by      text not null,
  channel       text not null check (channel in ('ussd', 'whatsapp', 'console')),
  corrected     boolean not null default false,
  over_register boolean not null default false,
  filed_at      timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index if not exists stream_results_current
  on public.stream_results (station_id, stream) where superseded_at is null;
create index if not exists stream_results_filed_idx on public.stream_results (filed_at desc);

alter table public.stream_results enable row level security;
revoke all on public.stream_results from anon, authenticated;
grant select on public.stream_results to authenticated;
grant all on public.stream_results to service_role;
drop policy if exists "results readable by team" on public.stream_results;
create policy "results readable by team" on public.stream_results
  for select to authenticated using (public.is_team_member(auth.uid()));

-- ----------------------------------------------------------- form photos --

-- The photo stays in the campaign's WhatsApp; this records that it came, from
-- whom, and which stream it belongs to.
create table if not exists public.form_photos (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references public.polling_stations(id) on delete cascade,
  stream        smallint check (stream between 1 and 30),
  wa_message_id text not null unique,
  wa_media_id   text,
  caption       text check (char_length(caption) <= 500),
  from_phone    text not null,
  received_at   timestamptz not null default now()
);

create index if not exists form_photos_station_idx on public.form_photos (station_id, stream);

alter table public.form_photos enable row level security;
revoke all on public.form_photos from anon, authenticated;
grant select on public.form_photos to authenticated;
grant all on public.form_photos to service_role;
drop policy if exists "photos readable by team" on public.form_photos;
create policy "photos readable by team" on public.form_photos
  for select to authenticated using (public.is_team_member(auth.uid()));

-- ------------------------------------------------------------- functions --

-- Set the ballot. Before the first filing the list is replaced as given.
-- After it, the same candidates must stay in the same order, because every
-- filing so far was keyed in that order; names and parties can be corrected.
create or replace function public.set_ballot(_candidates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _current uuid[];
  _given   uuid[];
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only an admin or manager can change the ballot.' using errcode = '42501';
  end if;
  if jsonb_typeof(_candidates) is distinct from 'array' then
    raise exception 'The ballot is a list of candidates.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(_candidates) > 30 then
    raise exception 'A ballot has at most 30 candidates.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(_candidates) c where coalesce(btrim(c ->> 'name'), '') = '') then
    raise exception 'Every candidate needs a name.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('groundwork.ballot'));

  if exists (select 1 from public.stream_results) then
    select array_agg(id order by position) into _current from public.ballot_candidates;
    select array_agg(nullif(c ->> 'id', '')::uuid order by t.ord) into _given
      from jsonb_array_elements(_candidates) with ordinality as t(c, ord);
    if _given is distinct from _current then
      raise exception 'Forms are already filed, so candidates cannot be added, removed or moved. Names and parties can still be corrected.'
        using errcode = 'P0001';
    end if;
    update public.ballot_candidates b
       set name  = btrim(c ->> 'name'),
           party = nullif(btrim(c ->> 'party'), ''),
           ours  = coalesce((c ->> 'ours')::boolean, false)
      from jsonb_array_elements(_candidates) c
     where b.id = (c ->> 'id')::uuid;
    return jsonb_array_length(_candidates);
  end if;

  delete from public.ballot_candidates;
  insert into public.ballot_candidates (id, position, name, party, ours)
  select coalesce(nullif(c ->> 'id', '')::uuid, gen_random_uuid()), t.ord, btrim(c ->> 'name'),
         nullif(btrim(c ->> 'party'), ''), coalesce((c ->> 'ours')::boolean, false)
    from jsonb_array_elements(_candidates) with ordinality as t(c, ord);
  return jsonb_array_length(_candidates);
end;
$$;

revoke all on function public.set_ballot(jsonb) from public, anon;
grant execute on function public.set_ballot(jsonb) to authenticated;

-- Put an agent on a station, or take them off with an empty phone. The phone
-- is how the agent is recognised on USSD and WhatsApp.
create or replace function public.assign_station_agent(_station_id uuid, _name text, _phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only an admin or manager can assign agents.' using errcode = '42501';
  end if;

  if coalesce(btrim(_phone), '') = '' then
    update public.polling_stations
       set agent_name = null, agent_phone = null, status = 'unstaffed'
     where id = _station_id;
  else
    if _phone !~ '^\+254[17][0-9]{8}$' then
      raise exception 'Use a Kenyan mobile number like 0712 345 678.' using errcode = 'P0001';
    end if;
    if coalesce(btrim(_name), '') = '' then
      raise exception 'Add the agent''s name.' using errcode = 'P0001';
    end if;
    update public.polling_stations
       set agent_name  = left(btrim(_name), 80),
           agent_phone = _phone,
           status      = case when status = 'unstaffed' then 'confirmed' else status end
     where id = _station_id;
  end if;

  if not found then
    raise exception 'That station is not on file.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assign_station_agent(uuid, text, text) from public, anon;
grant execute on function public.assign_station_agent(uuid, text, text) to authenticated;

-- File one stream's Form 34A. Called by the server for an agent on USSD, with
-- the number the network gave. Messages are in Swahili: they go straight to
-- the agent's screen.
create or replace function public.file_stream_result(
  _phone      text,
  _station_id uuid,
  _stream     integer,
  _votes      integer[],
  _rejected   integer,
  _channel    text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _st     public.polling_stations;
  _ballot uuid[];
  _valid  integer;
  _prev   uuid;
  _id     uuid;
  _total  integer;
  _over   boolean;
begin
  -- One filing per station at a time, so two streams landing together both
  -- see the other in the station total.
  select * into _st from public.polling_stations where id = _station_id for update;
  if not found then
    raise exception 'Kituo hakipatikani.' using errcode = 'P0001';
  end if;
  if _st.agent_phone is distinct from _phone then
    raise exception 'Namba hii si ya ajenti wa kituo %.', _st.code using errcode = '42501';
  end if;
  if _stream is null or _stream < 1 or _stream > greatest(_st.streams, 1) then
    raise exception 'Mkondo % haupo. Kituo % kina mikondo %.', _stream, _st.code, greatest(_st.streams, 1)
      using errcode = 'P0001';
  end if;

  select array_agg(id order by position) into _ballot from public.ballot_candidates;
  if _ballot is null then
    raise exception 'Orodha ya wagombea haijawekwa. Mjulishe mratibu.' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(_votes), 0) <> cardinality(_ballot) then
    raise exception 'Kura za wagombea % zinahitajika, zimepokelewa %.', cardinality(_ballot), coalesce(cardinality(_votes), 0)
      using errcode = 'P0001';
  end if;
  if _rejected is null or _rejected < 0 or exists (select 1 from unnest(_votes) v where v is null or v < 0) then
    raise exception 'Kura haziwezi kuwa hasi.' using errcode = 'P0001';
  end if;

  select sum(v) into _valid from unnest(_votes) v;
  if _st.registered_voters > 0 and _valid + _rejected > _st.registered_voters then
    raise exception 'Jumla % ni zaidi ya wapiga kura % waliosajiliwa kituo %.',
      _valid + _rejected, _st.registered_voters, _st.code using errcode = 'P0001';
  end if;

  update public.stream_results
     set superseded_at = now()
   where station_id = _station_id and stream = _stream and superseded_at is null
  returning id into _prev;

  insert into public.stream_results
    (station_id, stream, votes, valid_votes, rejected, filed_by, channel, corrected)
  select _station_id, _stream, jsonb_object_agg(z.id, z.n), _valid, _rejected, _phone, _channel, _prev is not null
    from unnest(_ballot, _votes) as z(id, n)
  returning id into _id;

  -- The streams together above the register: kept, and flagged for a person.
  select coalesce(sum(valid_votes + rejected), 0) into _total
    from public.stream_results
   where station_id = _station_id and superseded_at is null;
  _over := _st.registered_voters > 0 and _total > _st.registered_voters;
  if _over then
    update public.stream_results set over_register = true where id = _id;
  end if;

  update public.polling_stations p
     set results = (
           select jsonb_build_object(
                    'candidates', coalesce(jsonb_object_agg(b.name, t.n) filter (where b.name is not null), '{}'::jsonb),
                    'rejected',   (select coalesce(sum(r.rejected), 0) from public.stream_results r
                                    where r.station_id = _station_id and r.superseded_at is null),
                    '_streams',   (select count(*) from public.stream_results r
                                    where r.station_id = _station_id and r.superseded_at is null))
             from (select e.key::uuid as id, sum(e.value::integer) as n
                     from public.stream_results r, jsonb_each_text(r.votes) e
                    where r.station_id = _station_id and r.superseded_at is null
                    group by e.key) t
             left join public.ballot_candidates b on b.id = t.id),
         reported_at = now()
   where p.id = _station_id;

  return jsonb_build_object(
    'id', _id, 'station', _st.code, 'stream', _stream, 'valid', _valid, 'rejected', _rejected,
    'corrected', _prev is not null, 'over_register', _over);
end;
$$;

revoke all on function public.file_stream_result(text, uuid, integer, integer[], integer, text) from public, anon, authenticated;
grant execute on function public.file_stream_result(text, uuid, integer, integer[], integer, text) to service_role;

-- A photo of a form sent on WhatsApp. Null when the sender is not an agent.
-- The station is the one named in the caption, else the one they filed for
-- last; the stream is the one named, else their latest filed stream that has
-- no photo yet.
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

  return jsonb_build_object('station', _st.code, 'stream', _found, 'streams', greatest(_st.streams, 1));
end;
$$;

revoke all on function public.record_form_photo(text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_form_photo(text, text, text, text, text, integer) to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 11 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
