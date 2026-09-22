create table public.agent_stipends (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  phone text,
  role text not null default 'agent',
  station_id uuid references public.polling_stations(id) on delete set null,
  ward_id uuid references public.wards(id) on delete set null,
  rate_kes numeric not null default 0,
  days integer not null default 1,
  amount_kes numeric not null default 0,
  status text not null default 'pending',
  method text not null default 'mpesa',
  reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.agent_stipends to authenticated;
grant all on public.agent_stipends to service_role;
alter table public.agent_stipends enable row level security;

create policy "stipends readable by team" on public.agent_stipends
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "stipends managed by staff" on public.agent_stipends
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create trigger stipends_touch before update on public.agent_stipends
  for each row execute function public.touch_updated_at();

-- one stipend line per staffed polling station agent
insert into public.agent_stipends (agent_name, phone, role, station_id, ward_id, rate_kes, days, amount_kes, status, reference, paid_at)
select
  ps.agent_name,
  ps.agent_phone,
  'agent',
  ps.id,
  ps.ward_id,
  1500,
  1,
  1500,
  case (row_number() over (order by ps.code)) % 3 when 0 then 'paid' when 1 then 'approved' else 'pending' end,
  case when (row_number() over (order by ps.code)) % 3 = 0 then 'MPESA-' || upper(substr(md5(ps.id::text), 1, 8)) else null end,
  case when (row_number() over (order by ps.code)) % 3 = 0 then now() - ((row_number() over (order by ps.code)) || ' hours')::interval else null end
from public.polling_stations ps
where ps.agent_name is not null;

-- ward coordinators, one per ward that has staffed stations
insert into public.agent_stipends (agent_name, phone, role, ward_id, rate_kes, days, amount_kes, status)
select 'Coordinator · ' || w.name, null, 'coordinator', w.id, 3000, 1, 3000, 'pending'
from public.wards w
where exists (select 1 from public.polling_stations ps where ps.ward_id = w.id and ps.agent_name is not null);

-- door logs so canvassing reflects real field activity
insert into public.person_events (person_id, kind, channel, detail, created_at)
select p.id,
  case (abs(hashtext(p.id::text)) % 10)
    when 0 then 'door_refused' when 1 then 'door_refused'
    when 2 then 'door_not_home' when 3 then 'door_not_home' when 4 then 'door_not_home'
    else 'door_spoke' end,
  'door',
  (array['Water','Rubbish collection','Street lighting','Bursaries','Jobs','Roads','Health centre','Security'])[1 + (abs(hashtext(p.id::text || 'i')) % 8)],
  p.last_contacted_at
from public.people p
where p.last_contacted_at is not null
  and p.last_contacted_at > now() - interval '45 days'
  and (abs(hashtext(p.id::text || 'd')) % 100) < 55;