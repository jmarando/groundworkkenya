-- Real mornings, part 2. Schema version 21.
--
-- Search interest from Google Trends, read through SerpApi once a day for each
-- campaign: its candidates and the week's top issues. Each candidate can be
-- searched as the name people use. SerpApi searches come out of a daily budget
-- of their own. The server writes search interest; the team reads it.

alter table public.race_rivals
  add column search_as text check (search_as is null or length(btrim(search_as)) between 2 and 60);

-- Sakaja's race: searched as the papers name them; Babu Owino by his full name.
update public.race_rivals r
   set search_as = v.search_as
  from (values
    ('Johnson Sakaja', 'Sakaja'),
    ('Agnes Kagure', 'Kagure'),
    ('James Gakuya', 'Gakuya'),
    ('Ronald Karauri', 'Karauri')
  ) as v(name, search_as)
 where r.campaign_id = 'ca000000-0000-4000-8000-000000000002'
   and r.name = v.name
   and r.search_as is null;

alter table public.social_credits drop constraint social_credits_budget_check;
alter table public.social_credits
  add constraint social_credits_budget_check check (budget in ('rivals', 'keywords', 'trends'));

create table public.search_interest (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('candidates', 'issues')),
  geo         text not null check (geo in ('KE-110', 'KE')),
  series      jsonb not null
              check (jsonb_typeof(series) = 'array' and octet_length(series::text) <= 40000),
  created_at  timestamptz not null default now(),
  constraint search_interest_day_key unique (campaign_id, day, kind)
);

alter table public.search_interest enable row level security;
revoke all on public.search_interest from anon, authenticated;
grant select on public.search_interest to authenticated;
grant all on public.search_interest to service_role;

create policy "own campaign only" on public.search_interest as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "search interest readable by team" on public.search_interest for select to authenticated
  using (public.is_team_member(auth.uid()));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 21 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
