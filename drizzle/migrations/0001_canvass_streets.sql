create table public.canvass_streets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  agent_name text check (agent_name is null or length(agent_name) <= 120),
  agent_phone text check (agent_phone is null or length(agent_phone) <= 20),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ward_id, name)
);
grant select, insert, update, delete on public.canvass_streets to authenticated;
grant all on public.canvass_streets to service_role;
alter table public.canvass_streets enable row level security;
create policy "own campaign only" on public.canvass_streets as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "streets readable by team" on public.canvass_streets for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "streets managed by staff" on public.canvass_streets for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger canvass_streets_touch before update on public.canvass_streets
  for each row execute function public.touch_updated_at();

alter table public.people add column street_id uuid references public.canvass_streets(id) on delete set null,
  add column door_no integer;
create index people_street_idx on public.people(street_id, door_no);

create or replace function public.street_walk(_street_id uuid)
returns table(id uuid, full_name text, phone_masked text, segment text, support_score integer,
  last_contacted_at timestamptz, last_outcome text, last_visit_at timestamptz, door_no integer)
language sql stable set search_path to 'public' as $$
  with last_visit as (
    select distinct on (e.person_id) e.person_id, e.kind, e.created_at
      from public.person_events e
     where e.kind in ('door_spoke','door_not_home','door_refused')
       and e.person_id in (select p.id from public.people p where p.street_id = _street_id)
     order by e.person_id, e.created_at desc)
  select p.id, p.full_name,
    case when p.phone ~ '^\+254[0-9]{9}$' then '+254 ' || substr(p.phone,5,3) || ' ••• ' || right(p.phone,3) else '—' end,
    p.segment, p.support_score, p.last_contacted_at,
    case lv.kind when 'door_spoke' then 'spoke' when 'door_not_home' then 'not_home' when 'door_refused' then 'refused' end,
    lv.created_at, p.door_no
  from public.people p left join last_visit lv on lv.person_id = p.id
  where p.street_id = _street_id
  order by p.door_no nulls last, p.full_name
  limit 500
$$;
grant execute on function public.street_walk(uuid) to authenticated;

-- Demo streets for Sakaja: four per ward, people spread along them.
insert into public.canvass_streets (campaign_id, ward_id, name, sort)
select w.campaign_id, w.id, s.name, s.sort
from public.wards w join public.campaigns c on c.id = w.campaign_id and c.slug = 'sakaja'
cross join (values ('Main Road',1),('Market Lane',2),('School Road',3),('Church Road',4)) s(name, sort);

with ranked as (
  select p.id, p.ward_id, row_number() over (partition by p.ward_id order by p.created_at, p.id) rn
  from public.people p join public.campaigns c on c.id = p.campaign_id and c.slug = 'sakaja'
  where p.ward_id is not null)
update public.people p set street_id = cs.id, door_no = ((r.rn - 1) / 4) * 2 + 1
from ranked r join public.canvass_streets cs on cs.ward_id = r.ward_id and cs.sort = ((r.rn - 1) % 4) + 1
where p.id = r.id;