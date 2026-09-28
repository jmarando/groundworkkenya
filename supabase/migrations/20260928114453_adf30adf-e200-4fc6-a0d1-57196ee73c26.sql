
-- ===== Campaigns and membership =====
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  candidate text,
  seat text not null,
  level text not null default 'mp',
  host text unique,
  owns_channels boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.campaigns to authenticated;
grant all on public.campaigns to service_role;
alter table public.campaigns enable row level security;

create type public.campaign_role as enum ('candidate', 'manager', 'organiser', 'agent', 'pending');

create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.campaign_members (campaign_id);
grant select on public.campaign_members to authenticated;
grant all on public.campaign_members to service_role;
alter table public.campaign_members enable row level security;

create table public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (email)
);
grant select on public.campaign_invites to authenticated;
grant all on public.campaign_invites to service_role;
alter table public.campaign_invites enable row level security;

-- Which campaign the super admin is looking at.
create table public.admin_focus (
  user_id uuid primary key references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  updated_at timestamptz not null default now()
);
grant select on public.admin_focus to authenticated;
grant all on public.admin_focus to service_role;
alter table public.admin_focus enable row level security;

create trigger campaigns_touch before update on public.campaigns for each row execute function public.touch_updated_at();
create trigger campaign_members_touch before update on public.campaign_members for each row execute function public.touch_updated_at();

insert into public.campaigns (id, slug, name, candidate, seat, level, host, owns_channels) values
  ('ca000000-0000-4000-8000-000000000001', 'kalonzo', 'Kalonzo 2027', 'Kalonzo Musyoka', 'President · Kenya', 'president', 'kalonzo.groundwork.ke', false),
  ('ca000000-0000-4000-8000-000000000002', 'sakaja', 'Sakaja 2027', 'Johnson Sakaja', 'Governor · Nairobi', 'governor', 'sakaja.groundwork.ke', true),
  ('ca000000-0000-4000-8000-000000000003', 'mathira', 'Waruru Gikandi', 'Waruru Gikandi', 'MP · Mathira', 'mp', 'mathira.groundwork.ke', false);

-- ===== Helpers =====
create or replace function public.is_super_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin')
$$;

create or replace function public.my_campaign()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select campaign_id from public.campaign_members where user_id = auth.uid()),
    (select f.campaign_id from public.admin_focus f
      where f.user_id = auth.uid() and public.is_super_admin(auth.uid())))
$$;

create or replace function public.my_campaign_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role::text from public.campaign_members where user_id = auth.uid()),
    case when public.is_super_admin(auth.uid()) then 'super' end)
$$;

-- On the team of the campaign they are working in.
create or replace function public.is_team_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin(_user_id)
      or exists (select 1 from public.campaign_members
                  where user_id = _user_id and role in ('candidate','manager','organiser','agent'))
$$;

-- The money-and-strategy circle: candidate and campaign manager.
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin(_user_id)
      or exists (select 1 from public.campaign_members
                  where user_id = _user_id and role in ('candidate','manager'))
$$;

create or replace function public.can_admit(_user_id uuid, _campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin(_user_id)
      or exists (select 1 from public.campaign_members
                  where user_id = _user_id and campaign_id = _campaign and role in ('candidate','manager'))
$$;

create or replace function public.channel_campaign()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.campaigns where owns_channels order by created_at limit 1
$$;

-- Policies on the new tables
create policy "campaigns readable" on public.campaigns for select to authenticated
  using (public.is_super_admin(auth.uid()) or id = public.my_campaign());
create policy "members readable in campaign" on public.campaign_members for select to authenticated
  using (user_id = auth.uid() or public.can_admit(auth.uid(), campaign_id));
create policy "invites readable by admitters" on public.campaign_invites for select to authenticated
  using (public.can_admit(auth.uid(), campaign_id));
create policy "own focus" on public.admin_focus for select to authenticated using (user_id = auth.uid());

-- Candidates see the profiles of people in their campaign.
create policy "profiles readable in campaign" on public.profiles for select to authenticated
  using (exists (select 1 from public.campaign_members m
                  where m.user_id = profiles.user_id and public.can_admit(auth.uid(), m.campaign_id)));

-- ===== Stamp every campaign record =====
create or replace function public.stamp_campaign()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  i integer := 0;
  v uuid;
  c uuid;
begin
  if new.campaign_id is not null then return new; end if;
  while i < tg_nargs loop
    execute format('select ($1).%I::uuid', tg_argv[i + 1]) using new into v;
    if v is not null then
      execute format('select campaign_id from public.%I where id = $1', tg_argv[i]) using v into c;
      if c is not null then new.campaign_id := c; return new; end if;
    end if;
    i := i + 2;
  end loop;
  new.campaign_id := coalesce(public.my_campaign(), public.channel_campaign());
  return new;
end $$;

do $$
declare
  t record;
  sakaja uuid := 'ca000000-0000-4000-8000-000000000002';
begin
  for t in select * from (values
    ('wards', ''), ('people', 'wards,ward_id'), ('person_events', 'people,person_id'),
    ('person_imports', ''), ('polls', ''), ('poll_invites', 'polls,poll_id'),
    ('poll_responses', 'polls,poll_id'), ('conversations', 'people,person_id'),
    ('broadcasts', ''),
    ('messages', 'conversations,conversation_id,people,person_id,polls,poll_id,broadcasts,broadcast_id'),
    ('contributions', ''), ('expenses', ''), ('polling_stations', 'wards,ward_id'),
    ('incidents', 'polling_stations,station_id,wards,ward_id'),
    ('agent_stipends', 'polling_stations,station_id,wards,ward_id'),
    ('stream_results', 'polling_stations,station_id'), ('form_photos', 'polling_stations,station_id'),
    ('ballot_candidates', ''), ('listening_topics', ''), ('listening_mentions', 'listening_topics,topic_id'),
    ('listening_alerts', 'listening_topics,topic_id'),
    ('listening_alert_events', 'listening_alerts,alert_id,listening_mentions,mention_id'),
    ('social_accounts', '')
  ) as x(tbl, parents)
  loop
    execute format('alter table public.%I add column campaign_id uuid references public.campaigns(id) on delete cascade', t.tbl);
    execute format('update public.%I set campaign_id = %L where campaign_id is null', t.tbl, sakaja);
    execute format('alter table public.%I alter column campaign_id set not null', t.tbl);
    execute format('create index on public.%I (campaign_id)', t.tbl);
    execute format('create trigger stamp_campaign before insert on public.%I for each row execute function public.stamp_campaign(%s)',
      t.tbl, coalesce((select string_agg(quote_literal(p), ',') from unnest(string_to_array(nullif(t.parents, ''), ',')) p), ''));
    execute format('create policy "own campaign only" on public.%I as restrictive for all to authenticated using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign())', t.tbl);
  end loop;
end $$;

-- Uniqueness is per campaign now
alter table public.people drop constraint people_phone_key;
alter table public.people add constraint people_campaign_phone_key unique (campaign_id, phone);
alter table public.wards drop constraint wards_slug_key;
alter table public.wards add constraint wards_campaign_slug_key unique (campaign_id, slug);
alter table public.polling_stations drop constraint polling_stations_code_key;
alter table public.polling_stations add constraint polling_stations_campaign_code_key unique (campaign_id, code);
alter table public.ballot_candidates drop constraint ballot_candidates_position_key;
alter table public.ballot_candidates add constraint ballot_candidates_campaign_position_key unique (campaign_id, position);
drop index public.ballot_candidates_name_key;
create unique index ballot_candidates_campaign_name_key on public.ballot_candidates (campaign_id, lower(btrim(name)));
drop index public.listening_mentions_url_key;
create unique index listening_mentions_campaign_url_key on public.listening_mentions (campaign_id, url);

-- ===== Functions that must stay inside one campaign =====
create or replace function public.assign_station_agent(_station_id uuid, _name text, _phone text)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only the candidate or campaign manager can assign agents.' using errcode = '42501';
  end if;
  if coalesce(btrim(_phone), '') = '' then
    update public.polling_stations set agent_name = null, agent_phone = null, status = 'unstaffed'
     where id = _station_id and campaign_id = public.my_campaign();
  else
    if _phone !~ '^\+254[17][0-9]{8}$' then
      raise exception 'Use a Kenyan mobile number like 0712 345 678.' using errcode = 'P0001';
    end if;
    if coalesce(btrim(_name), '') = '' then
      raise exception 'Add the agent''s name.' using errcode = 'P0001';
    end if;
    update public.polling_stations
       set agent_name = left(btrim(_name), 80), agent_phone = _phone,
           status = case when status = 'unstaffed' then 'confirmed' else status end
     where id = _station_id and campaign_id = public.my_campaign();
  end if;
  if not found then
    raise exception 'That station is not on file.' using errcode = 'P0001';
  end if;
end; $function$;

create or replace function public.set_ballot(_candidates jsonb)
returns integer language plpgsql security definer set search_path = public as $function$
declare
  _current uuid[];
  _given   uuid[];
  _c       uuid := public.my_campaign();
begin
  if not public.is_staff(auth.uid()) or _c is null then
    raise exception 'Only the candidate or campaign manager can change the ballot.' using errcode = '42501';
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
  perform pg_advisory_xact_lock(hashtext('groundwork.ballot.' || _c::text));
  if exists (select 1 from public.stream_results where campaign_id = _c) then
    select array_agg(id order by position) into _current from public.ballot_candidates where campaign_id = _c;
    select array_agg(nullif(c ->> 'id', '')::uuid order by t.ord) into _given
      from jsonb_array_elements(_candidates) with ordinality as t(c, ord);
    if _given is distinct from _current then
      raise exception 'Forms are already filed, so candidates cannot be added, removed or moved. Names and parties can still be corrected.'
        using errcode = 'P0001';
    end if;
    update public.ballot_candidates b
       set name = btrim(c ->> 'name'), party = nullif(btrim(c ->> 'party'), ''),
           ours = coalesce((c ->> 'ours')::boolean, false)
      from jsonb_array_elements(_candidates) c
     where b.id = (c ->> 'id')::uuid and b.campaign_id = _c;
    return jsonb_array_length(_candidates);
  end if;
  delete from public.ballot_candidates where campaign_id = _c;
  insert into public.ballot_candidates (id, position, name, party, ours, campaign_id)
  select coalesce(nullif(c ->> 'id', '')::uuid, gen_random_uuid()), t.ord, btrim(c ->> 'name'),
         nullif(btrim(c ->> 'party'), ''), coalesce((c ->> 'ours')::boolean, false), _c
    from jsonb_array_elements(_candidates) with ordinality as t(c, ord);
  return jsonb_array_length(_candidates);
end; $function$;

-- Results filed by agents over SMS/WhatsApp use their own campaign's ballot.
do $$
declare src text;
begin
  select pg_get_functiondef('public.file_stream_result(text,uuid,integer,integer[],integer,text)'::regprocedure) into src;
  src := replace(src, 'select array_agg(id order by position) into _ballot from public.ballot_candidates;',
                      'select array_agg(id order by position) into _ballot from public.ballot_candidates where campaign_id = _st.campaign_id;');
  src := replace(src, 'left join public.ballot_candidates b on b.id = t.id),',
                      'left join public.ballot_candidates b on b.id = t.id and b.campaign_id = _st.campaign_id),');
  execute src;

  select pg_get_functiondef('public.import_people_chunk(uuid,jsonb)'::regprocedure) into src;
  src := replace(src, 'on conflict (phone) do nothing', 'on conflict (campaign_id, phone) do nothing');
  execute src;
end $$;

-- ===== Joining, admitting, inviting =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _inv public.campaign_invites;
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (user_id) do nothing;
  if lower(new.email) = 'justin@glab.africa' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  select * into _inv from public.campaign_invites where lower(email) = lower(new.email);
  if found then
    insert into public.campaign_members (campaign_id, user_id, role) values (_inv.campaign_id, new.id, _inv.role)
    on conflict (user_id) do nothing;
    delete from public.campaign_invites where id = _inv.id;
  end if;
  return new;
end $$;

-- Someone signed in on a campaign's address asks to join it.
create or replace function public.request_campaign_access(_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare _c uuid; _mine uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select id into _c from public.campaigns where slug = _slug;
  if _c is null then raise exception 'No such campaign.' using errcode = 'P0001'; end if;
  if public.is_super_admin(auth.uid()) then
    insert into public.admin_focus (user_id, campaign_id) values (auth.uid(), _c)
    on conflict (user_id) do update set campaign_id = excluded.campaign_id, updated_at = now();
    return 'super';
  end if;
  select campaign_id into _mine from public.campaign_members where user_id = auth.uid();
  if _mine is null then
    insert into public.campaign_members (campaign_id, user_id, role) values (_c, auth.uid(), 'pending');
    return 'pending';
  end if;
  return case when _mine = _c then 'member' else 'elsewhere' end;
end $$;

create or replace function public.focus_campaign(_campaign uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the super admin can switch campaigns.' using errcode = '42501';
  end if;
  insert into public.admin_focus (user_id, campaign_id) values (auth.uid(), _campaign)
  on conflict (user_id) do update set campaign_id = excluded.campaign_id, updated_at = now();
end $$;

create or replace function public.create_campaign(_slug text, _name text, _candidate text, _seat text, _level text, _host text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the super admin can add campaigns.' using errcode = '42501';
  end if;
  insert into public.campaigns (slug, name, candidate, seat, level, host)
  values (lower(btrim(_slug)), btrim(_name), nullif(btrim(_candidate), ''), btrim(_seat),
          coalesce(nullif(_level, ''), 'mp'), nullif(lower(btrim(_host)), ''))
  returning id into _id;
  return _id;
end $$;

-- Invite by email into the caller's campaign (or any campaign, for the super admin).
create or replace function public.invite_member(_campaign uuid, _email text, _role public.campaign_role)
returns text language plpgsql security definer set search_path = public as $$
declare _uid uuid; _mine uuid;
begin
  if not public.can_admit(auth.uid(), _campaign) then
    raise exception 'Only the candidate or campaign manager can invite people.' using errcode = '42501';
  end if;
  if _role = 'pending' then raise exception 'Pick a role.' using errcode = 'P0001'; end if;
  if _role = 'candidate' and not public.is_super_admin(auth.uid())
     and not exists (select 1 from public.campaign_members where user_id = auth.uid() and role = 'candidate') then
    raise exception 'Only the candidate can add another candidate.' using errcode = '42501';
  end if;
  if coalesce(btrim(_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email does not look right.' using errcode = 'P0001';
  end if;
  select id into _uid from auth.users where lower(email) = lower(btrim(_email));
  if _uid is not null then
    select campaign_id into _mine from public.campaign_members where user_id = _uid;
    if _mine is not null and _mine <> _campaign then
      raise exception 'That person already works on another campaign.' using errcode = 'P0001';
    end if;
    insert into public.campaign_members (campaign_id, user_id, role) values (_campaign, _uid, _role)
    on conflict (user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into public.campaign_invites (campaign_id, email, role, invited_by)
  values (_campaign, lower(btrim(_email)), _role, auth.uid())
  on conflict (email) do update set campaign_id = excluded.campaign_id, role = excluded.role, invited_by = excluded.invited_by;
  return 'invited';
end $$;

-- Change a teammate's role, or remove them ('pending' = no access).
drop function public.set_member_role(uuid, public.app_role);
create or replace function public.set_member_role(_user_id uuid, _role public.campaign_role)
returns void language plpgsql security definer set search_path = public as $$
declare _c uuid; _cur public.campaign_role;
begin
  select campaign_id, role into _c, _cur from public.campaign_members where user_id = _user_id;
  if _c is null then raise exception 'That person is not on a campaign.' using errcode = 'P0001'; end if;
  if not public.can_admit(auth.uid(), _c) then
    raise exception 'Only the candidate or campaign manager can change roles.' using errcode = '42501';
  end if;
  if (_role = 'candidate' or _cur = 'candidate') and not public.is_super_admin(auth.uid())
     and not exists (select 1 from public.campaign_members where user_id = auth.uid() and role = 'candidate') then
    raise exception 'Only the candidate can change who is a candidate.' using errcode = '42501';
  end if;
  if _cur = 'candidate' and _role <> 'candidate'
     and (select count(*) from public.campaign_members where campaign_id = _c and role = 'candidate') <= 1 then
    raise exception 'That is the only candidate. Make someone else candidate first.' using errcode = 'P0001';
  end if;
  update public.campaign_members set role = _role where user_id = _user_id;
end $$;

create or replace function public.remove_member(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _c uuid; _cur public.campaign_role;
begin
  select campaign_id, role into _c, _cur from public.campaign_members where user_id = _user_id;
  if _c is null then return; end if;
  if not public.can_admit(auth.uid(), _c) then
    raise exception 'Only the candidate or campaign manager can remove people.' using errcode = '42501';
  end if;
  if _cur = 'candidate' and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the super admin can remove a candidate.' using errcode = '42501';
  end if;
  delete from public.campaign_members where user_id = _user_id;
end $$;

-- Nothing here is for signed-out callers.
do $$
declare f text;
begin
  foreach f in array array['is_super_admin(uuid)','my_campaign()','my_campaign_role()','can_admit(uuid,uuid)',
    'channel_campaign()','stamp_campaign()','request_campaign_access(text)','focus_campaign(uuid)',
    'create_campaign(text,text,text,text,text,text)','invite_member(uuid,text,public.campaign_role)',
    'set_member_role(uuid,public.campaign_role)','remove_member(uuid)','is_team_member(uuid)','is_staff(uuid)',
    'set_ballot(jsonb)','assign_station_agent(uuid,text,text)','file_stream_result(text,uuid,integer,integer[],integer,text)',
    'import_people_chunk(uuid,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  revoke execute on function public.stamp_campaign() from authenticated;
end $$;

-- ===== Existing accounts =====
-- Super admin works in Sakaja to start; everyone else with a role joins Sakaja.
insert into public.admin_focus (user_id, campaign_id)
select user_id, 'ca000000-0000-4000-8000-000000000002' from public.user_roles r
  join auth.users u on u.id = r.user_id
 where r.role = 'admin' and lower(u.email) = 'justin@glab.africa'
on conflict do nothing;

insert into public.campaign_members (campaign_id, user_id, role)
select 'ca000000-0000-4000-8000-000000000002', r.user_id,
       case r.role when 'admin' then 'manager' when 'manager' then 'manager'
                   when 'organiser' then 'organiser' when 'agent' then 'agent' else 'pending' end::public.campaign_role
  from public.user_roles r join auth.users u on u.id = r.user_id
 where lower(u.email) <> 'justin@glab.africa'
on conflict (user_id) do nothing;

delete from public.user_roles r using auth.users u
 where u.id = r.user_id and lower(u.email) <> 'justin@glab.africa';

-- ===== Mathira starts with its six wards =====
insert into public.wards (campaign_id, slug, name, constituency, registered_voters, target_votes, supporters) values
  ('ca000000-0000-4000-8000-000000000003', 'karatina-town', 'Karatina Town', 'Mathira', 17400, 9570, 0),
  ('ca000000-0000-4000-8000-000000000003', 'konyu', 'Konyu', 'Mathira', 16200, 8910, 0),
  ('ca000000-0000-4000-8000-000000000003', 'ruguru', 'Ruguru', 'Mathira', 21300, 11715, 0),
  ('ca000000-0000-4000-8000-000000000003', 'iriaini', 'Iriaini', 'Mathira', 17100, 9405, 0),
  ('ca000000-0000-4000-8000-000000000003', 'magutu', 'Magutu', 'Mathira', 18900, 10395, 0),
  ('ca000000-0000-4000-8000-000000000003', 'kirimukuyu', 'Kirimukuyu', 'Mathira', 19600, 10780, 0);
