-- Adding people by hand and by CSV import.
--
-- Two rules carry the legal weight here. Consent is recorded only with a
-- stated source — who agreed, how, and who on the campaign says so — because
-- under the Data Protection Act the campaign has to be able to show it. And
-- nothing added or imported can undo someone's STOP.
--
-- Every import is logged: who ran it, from which file, on what basis, and
-- what it changed, so the question "where did this number come from?" always
-- has an answer.

create table if not exists public.person_imports (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  source          text not null,
  consent_source  text,
  rows_total      integer not null default 0,
  created_count   integer not null default 0,
  updated_count   integer not null default 0,
  skipped_count   integer not null default 0,
  consent_count   integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

grant select, insert, update on public.person_imports to authenticated;
grant all on public.person_imports to service_role;
alter table public.person_imports enable row level security;

drop policy if exists "imports readable by staff" on public.person_imports;
drop policy if exists "imports run by staff" on public.person_imports;
drop policy if exists "import counts by staff" on public.person_imports;
create policy "imports readable by staff" on public.person_imports
  for select to authenticated using (public.is_staff(auth.uid()));
create policy "imports run by staff" on public.person_imports
  for insert to authenticated with check (public.is_staff(auth.uid()) and created_by = auth.uid());
create policy "import counts by staff" on public.person_imports
  for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ------------------------------------------------------------- add one

create or replace function public.add_person(
  _phone          text,
  _full_name      text,
  _ward_id        uuid,
  _segment        text,
  _language       text,
  _support_score  integer,
  _notes          text,
  _consent        jsonb,
  _consent_source text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _id       uuid;
  _existing record;
  _sms      boolean := coalesce((_consent ->> 'sms')::boolean, false);
  _wa       boolean := coalesce((_consent ->> 'whatsapp')::boolean, false);
  _call     boolean := coalesce((_consent ->> 'call')::boolean, false);
  _channels text;
begin
  if _phone !~ '^\+254[17][0-9]{8}$' then
    raise exception 'Use a Kenyan mobile number like 0712 345 678.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(_full_name), '') = '' then
    raise exception 'Add their name.' using errcode = 'P0001';
  end if;
  if (_sms or _wa or _call) and coalesce(btrim(_consent_source), '') = '' then
    raise exception 'Say how they agreed to be contacted.' using errcode = 'P0001';
  end if;

  select id, full_name into _existing from public.people where phone = _phone;
  if found then
    raise exception '% is already on file as %.', _phone, coalesce(_existing.full_name, 'an unnamed record')
      using errcode = 'P0001';
  end if;

  insert into public.people
    (phone, full_name, ward_id, segment, language, support_score, notes, source,
     consent_sms, consent_whatsapp, consent_call)
  values
    (_phone, btrim(_full_name), _ward_id, nullif(btrim(_segment), ''),
     coalesce(nullif(_language, ''), 'sw'), greatest(0, least(100, coalesce(_support_score, 0))),
     nullif(btrim(_notes), ''), 'manual', _sms, _wa, _call)
  returning id into _id;

  insert into public.person_events (person_id, kind, channel, detail, actor)
  values (_id, 'added', 'console', 'Added by hand', auth.uid());

  if _sms or _wa or _call then
    _channels := concat_ws(', ',
      case when _sms then 'SMS' end, case when _wa then 'WhatsApp' end, case when _call then 'calls' end);
    insert into public.person_events (person_id, kind, channel, detail, actor)
    values (_id, 'consent_given', 'console',
            left(format('Agreed to %s: %s', _channels, btrim(_consent_source)), 500), auth.uid());
  end if;

  return jsonb_build_object('id', _id);
end;
$$;

revoke all on function public.add_person(text, text, uuid, text, text, integer, text, jsonb, text) from public, anon;
grant execute on function public.add_person(text, text, uuid, text, text, integer, text, jsonb, text) to authenticated;

-- ------------------------------------------------------------ import many

-- Start an import: the log row first, so only staff get any further.
create or replace function public.begin_person_import(
  _filename text, _source text, _consent_source text, _rows_total integer
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  _id uuid;
begin
  if coalesce(btrim(_source), '') = '' then
    raise exception 'Say where this list came from.' using errcode = 'P0001';
  end if;
  insert into public.person_imports (filename, source, consent_source, rows_total, created_by)
  values (left(coalesce(nullif(btrim(_filename), ''), 'upload.csv'), 200), left(btrim(_source), 200),
          nullif(left(btrim(_consent_source), 300), ''), greatest(0, _rows_total), auth.uid())
  returning id into _id;
  return _id;
end;
$$;

revoke all on function public.begin_person_import(text, text, text, integer) from public, anon;
grant execute on function public.begin_person_import(text, text, text, integer) to authenticated;

-- Rows as sent by the console, cleaned: valid Kenyan mobiles only, one per
-- number, and consent flags that count only when the import stated a source.
create or replace function public.parse_import_rows(_rows jsonb, _consent_stated boolean)
returns table (
  phone text, full_name text, ward_id uuid, segment text, language text,
  sms boolean, wa boolean, call boolean
)
language sql
immutable
as $$
  select distinct on (r ->> 'phone')
         r ->> 'phone',
         nullif(btrim(r ->> 'name'), ''),
         nullif(r ->> 'wardId', '')::uuid,
         nullif(btrim(r ->> 'segment'), ''),
         nullif(r ->> 'language', ''),
         coalesce((r ->> 'sms')::boolean, false)      and _consent_stated,
         coalesce((r ->> 'whatsapp')::boolean, false) and _consent_stated,
         coalesce((r ->> 'call')::boolean, false)     and _consent_stated
    from jsonb_array_elements(_rows) r
   where (r ->> 'phone') ~ '^\+254[17][0-9]{8}$'
   order by r ->> 'phone'
$$;

revoke all on function public.parse_import_rows(jsonb, boolean) from public, anon;
grant execute on function public.parse_import_rows(jsonb, boolean) to authenticated;

-- One chunk of rows. New numbers are created; existing ones only have their
-- blanks filled in. Consent is granted only when the import stated its source,
-- is never taken away, and never overrides a STOP.
create or replace function public.import_people_chunk(_import_id uuid, _rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _imp      public.person_imports%rowtype;
  _created  integer := 0;
  _updated  integer := 0;
  _skipped  integer := 0;
  _consents integer := 0;
begin
  -- Visible only to staff, and only the person who started it may add to it.
  select * into _imp from public.person_imports where id = _import_id and created_by = auth.uid();
  if not found then
    raise exception 'Only an admin or manager can import people.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 1000 then
    raise exception 'Send rows in chunks of at most 1,000.' using errcode = 'P0001';
  end if;

  _skipped := jsonb_array_length(_rows)
              - (select count(*) from public.parse_import_rows(_rows, _imp.consent_source is not null));

  -- Fill blanks on people already on file; grant consent, never remove it,
  -- and never for someone who has said STOP.
  with upd as (
    update public.people p
       set full_name        = coalesce(p.full_name, i.full_name),
           ward_id          = coalesce(p.ward_id, i.ward_id),
           segment          = coalesce(p.segment, i.segment),
           consent_sms      = p.consent_sms      or (i.sms  and not p.opted_out),
           consent_whatsapp = p.consent_whatsapp or (i.wa   and not p.opted_out),
           consent_call     = p.consent_call     or (i.call and not p.opted_out)
      from public.parse_import_rows(_rows, _imp.consent_source is not null) i
     where p.phone = i.phone
    returning p.id,
              (i.sms or i.wa or i.call) and not p.opted_out as consented
  )
  select count(*), count(*) filter (where consented) into _updated, _consents from upd;

  with ins as (
    insert into public.people
      (phone, full_name, ward_id, segment, language, source, consent_sms, consent_whatsapp, consent_call)
    select i.phone, i.full_name, i.ward_id, i.segment, coalesce(i.language, 'sw'), 'import',
           i.sms, i.wa, i.call
      from public.parse_import_rows(_rows, _imp.consent_source is not null) i
     where not exists (select 1 from public.people p where p.phone = i.phone)
    on conflict (phone) do nothing
    returning id, consent_sms or consent_whatsapp or consent_call as consented
  ),
  ev as (
    insert into public.person_events (person_id, kind, channel, detail, actor)
    select id, 'imported', 'import', left(format('Imported from %s (%s)', _imp.filename, _imp.source), 500), auth.uid()
      from ins
    returning person_id
  )
  select count(*), _consents + count(*) filter (where consented) into _created, _consents from ins;

  -- The consent itself goes on each record, with where it came from.
  insert into public.person_events (person_id, kind, channel, detail, actor)
  select p.id, 'consent_given', 'import',
         left(format('Consent via import of %s: %s', _imp.filename, _imp.consent_source), 500), auth.uid()
    from public.people p
    join public.parse_import_rows(_rows, _imp.consent_source is not null) i on i.phone = p.phone
   where (i.sms or i.wa or i.call) and not p.opted_out;

  update public.person_imports
     set created_count = created_count + _created,
         updated_count = updated_count + _updated,
         skipped_count = skipped_count + _skipped,
         consent_count = consent_count + _consents
   where id = _import_id;

  return jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped, 'consented', _consents);
end;
$$;

revoke all on function public.import_people_chunk(uuid, jsonb) from public, anon;
grant execute on function public.import_people_chunk(uuid, jsonb) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 6 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
