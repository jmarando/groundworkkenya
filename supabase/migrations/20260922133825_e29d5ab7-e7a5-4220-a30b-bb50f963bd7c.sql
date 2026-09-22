-- ============ roles ============
create type public.app_role as enum ('admin','manager','organiser','agent','viewer');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by team" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','manager'))
$$;

create policy "roles readable by team" on public.user_roles for select to authenticated using (true);
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
  select new.id, case when (select count(*) from auth.users) <= 1 then 'admin'::public.app_role else 'viewer'::public.app_role end
  on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ geography ============
create table public.wards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  constituency text not null,
  registered_voters integer not null default 0,
  target_votes integer not null default 0,
  supporters integer not null default 0,
  map_x numeric,
  map_y numeric,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.wards to authenticated;
grant all on public.wards to service_role;
alter table public.wards enable row level security;
create policy "wards readable" on public.wards for select to authenticated using (true);
create policy "wards managed by staff" on public.wards for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  colour text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.segments to authenticated;
grant all on public.segments to service_role;
alter table public.segments enable row level security;
create policy "segments readable" on public.segments for select to authenticated using (true);
create policy "segments managed by staff" on public.segments for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ============ people ============
create table public.people (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  full_name text,
  ward_id uuid references public.wards(id) on delete set null,
  segment text,
  source text not null default 'manual',
  support_score integer not null default 0,
  consent_sms boolean not null default false,
  consent_whatsapp boolean not null default false,
  consent_call boolean not null default false,
  opted_out boolean not null default false,
  language text not null default 'en',
  tags text[] not null default '{}',
  last_contacted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_ward_idx on public.people(ward_id);
create index people_segment_idx on public.people(segment);
grant select, insert, update, delete on public.people to authenticated;
grant all on public.people to service_role;
alter table public.people enable row level security;
create policy "people readable" on public.people for select to authenticated using (true);
create policy "people writable by team" on public.people for insert to authenticated with check (true);
create policy "people updatable by team" on public.people for update to authenticated using (true) with check (true);
create policy "people deletable by staff" on public.people for delete to authenticated using (public.is_staff(auth.uid()));
create trigger people_touch before update on public.people for each row execute function public.touch_updated_at();

create table public.person_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null,
  channel text,
  detail text,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index person_events_person_idx on public.person_events(person_id, created_at desc);
grant select, insert, update, delete on public.person_events to authenticated;
grant all on public.person_events to service_role;
alter table public.person_events enable row level security;
create policy "events readable" on public.person_events for select to authenticated using (true);
create policy "events writable" on public.person_events for insert to authenticated with check (true);
create policy "events removable by staff" on public.person_events for delete to authenticated using (public.is_staff(auth.uid()));

-- ============ polling ============
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  question text not null,
  kind text not null default 'single_choice',
  options jsonb not null default '[]'::jsonb,
  channels text[] not null default '{sms}',
  audience jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  reward text,
  sample_target integer not null default 0,
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.polls to authenticated;
grant all on public.polls to service_role;
alter table public.polls enable row level security;
create policy "polls readable" on public.polls for select to authenticated using (true);
create policy "polls managed by staff" on public.polls for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger polls_touch before update on public.polls for each row execute function public.touch_updated_at();

create table public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  ward_id uuid references public.wards(id) on delete set null,
  channel text not null default 'sms',
  option_key text,
  free_text text,
  weight numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (poll_id, person_id)
);
create index poll_responses_poll_idx on public.poll_responses(poll_id);
grant select, insert, update, delete on public.poll_responses to authenticated;
grant all on public.poll_responses to service_role;
alter table public.poll_responses enable row level security;
create policy "responses readable" on public.poll_responses for select to authenticated using (true);
create policy "responses writable" on public.poll_responses for insert to authenticated with check (true);
create policy "responses removable by staff" on public.poll_responses for delete to authenticated using (public.is_staff(auth.uid()));

-- ============ comms ============
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  poll_id uuid references public.polls(id) on delete set null,
  phone text,
  channel text not null default 'sms',
  direction text not null default 'out',
  body text not null,
  status text not null default 'queued',
  provider_ref text,
  error text,
  cost_kes numeric not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_created_idx on public.messages(created_at desc);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "messages readable" on public.messages for select to authenticated using (true);
create policy "messages writable" on public.messages for insert to authenticated with check (true);
create policy "messages updatable" on public.messages for update to authenticated using (true) with check (true);
create policy "messages removable by staff" on public.messages for delete to authenticated using (public.is_staff(auth.uid()));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  channel text not null default 'sms',
  subject text,
  snippet text,
  status text not null default 'open',
  assigned_to uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  unread boolean not null default true,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "convos readable" on public.conversations for select to authenticated using (true);
create policy "convos writable" on public.conversations for insert to authenticated with check (true);
create policy "convos updatable" on public.conversations for update to authenticated using (true) with check (true);
create policy "convos removable by staff" on public.conversations for delete to authenticated using (public.is_staff(auth.uid()));

-- ============ money ============
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null,
  donor_type text not null default 'individual',
  amount_kes numeric not null,
  method text not null default 'mpesa',
  reference text,
  received_at timestamptz not null default now(),
  disclosed boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.contributions to authenticated;
grant all on public.contributions to service_role;
alter table public.contributions enable row level security;
create policy "contributions readable" on public.contributions for select to authenticated using (true);
create policy "contributions managed by staff" on public.contributions for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text not null default 'operations',
  vendor text,
  amount_kes numeric not null,
  status text not null default 'pending',
  statutory boolean not null default true,
  reference text,
  incurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;
create policy "expenses readable" on public.expenses for select to authenticated using (true);
create policy "expenses managed by staff" on public.expenses for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ============ election day ============
create table public.polling_stations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  ward_id uuid references public.wards(id) on delete set null,
  registered_voters integer not null default 0,
  streams integer not null default 1,
  agent_name text,
  agent_phone text,
  status text not null default 'unstaffed',
  turnout_reported integer,
  results jsonb,
  reported_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.polling_stations to authenticated;
grant all on public.polling_stations to service_role;
alter table public.polling_stations enable row level security;
create policy "stations readable" on public.polling_stations for select to authenticated using (true);
create policy "stations updatable by team" on public.polling_stations for update to authenticated using (true) with check (true);
create policy "stations managed by staff" on public.polling_stations for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  severity text not null default 'info',
  status text not null default 'open',
  ward_id uuid references public.wards(id) on delete set null,
  station_id uuid references public.polling_stations(id) on delete set null,
  reported_by text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.incidents to authenticated;
grant all on public.incidents to service_role;
alter table public.incidents enable row level security;
create policy "incidents readable" on public.incidents for select to authenticated using (true);
create policy "incidents writable" on public.incidents for insert to authenticated with check (true);
create policy "incidents updatable" on public.incidents for update to authenticated using (true) with check (true);
create policy "incidents removable by staff" on public.incidents for delete to authenticated using (public.is_staff(auth.uid()));