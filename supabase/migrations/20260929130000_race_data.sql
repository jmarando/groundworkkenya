-- Real race data. Schema version 16.
--
-- A campaign's rivals and the published polls of its race, so Home can show
-- where the race really stands instead of a sample. A poll keeps every named
-- candidate's share as published, tied to a rival by id where it is one, with
-- the link it was published at. The team reads the race; only the candidate
-- or campaign manager changes it.

-- True when a poll's shares are a list of { name, share[, rival_id] }.
create or replace function public.race_shares_ok(_shares jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- CASE, not AND: the array functions raise on anything that is not a list.
  select case
           when jsonb_typeof(_shares) is distinct from 'array' then false
           when jsonb_array_length(_shares) not between 1 and 20 then false
           else not exists (
             select 1
               from jsonb_array_elements(_shares) e
              where case
                      when jsonb_typeof(e) is distinct from 'object' then true
                      when jsonb_typeof(e->'name') is distinct from 'string' then true
                      when length(btrim(e->>'name')) not between 2 and 80 then true
                      when jsonb_typeof(e->'share') is distinct from 'number' then true
                      when (e->>'share')::numeric not between 0 and 100 then true
                      when e ? 'rival_id' and jsonb_typeof(e->'rival_id') is distinct from 'string' then true
                      else false
                    end
           )
         end
$$;

-- The shares added up; 0 for anything that is not a list.
create or replace function public.race_share_total(_shares jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(case when jsonb_typeof(e->'share') = 'number' then (e->>'share')::numeric end), 0)
    from jsonb_array_elements(case when jsonb_typeof(_shares) = 'array' then _shares else '[]'::jsonb end) e
$$;

revoke all on function public.race_shares_ok(jsonb), public.race_share_total(jsonb) from public, anon;
grant execute on function public.race_shares_ok(jsonb), public.race_share_total(jsonb) to authenticated, service_role;

create table public.race_rivals (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 80),
  party       text check (party is null or length(btrim(party)) between 1 and 80),
  office      text check (office is null or length(btrim(office)) between 1 and 80),
  is_us       boolean not null default false,
  tone        text not null default 'a' check (tone in ('us', 'a', 'b', 'c', 'd')),
  sort        integer not null default 0 check (sort between 0 and 99),
  facebook    text check (facebook is null or facebook ~ '^[A-Za-z0-9._-]{2,100}$'),
  x           text check (x is null or x ~ '^[A-Za-z0-9_]{1,15}$'),
  tiktok      text check (tiktok is null or tiktok ~ '^[A-Za-z0-9_.]{2,24}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint race_rivals_us_tone check ((tone = 'us') = is_us)
);
create unique index race_rivals_name_idx on public.race_rivals (campaign_id, lower(btrim(name)));
create unique index race_rivals_one_us_idx on public.race_rivals (campaign_id) where is_us;
create trigger race_rivals_touch before update on public.race_rivals
  for each row execute function public.touch_updated_at();

create table public.race_polls (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null default public.my_campaign()
                 references public.campaigns(id) on delete cascade,
  pollster       text not null check (length(btrim(pollster)) between 2 and 80),
  fieldwork_from date,
  fieldwork_to   date,
  published_on   date not null,
  sample_size    integer check (sample_size is null or sample_size between 50 and 1000000),
  margin         numeric(4,2) check (margin is null or (margin > 0 and margin <= 15)),
  source_url     text not null check (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 500),
  shares         jsonb not null check (public.race_shares_ok(shares)),
  undecided      numeric(4,1) check (undecided is null or undecided between 0 and 100),
  approval       numeric(4,1) check (approval is null or approval between 0 and 100),
  disapproval    numeric(4,1) check (disapproval is null or disapproval between 0 and 100),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  constraint race_polls_fieldwork check (fieldwork_from is null or fieldwork_to is null or fieldwork_from <= fieldwork_to),
  constraint race_polls_published check (coalesce(fieldwork_to, fieldwork_from, published_on) <= published_on),
  constraint race_polls_total check (public.race_share_total(shares) + coalesce(undecided, 0) <= 100.5)
);
create index race_polls_campaign_idx on public.race_polls (campaign_id, published_on desc);

alter table public.race_rivals enable row level security;
alter table public.race_polls enable row level security;

revoke all on public.race_rivals, public.race_polls from anon, authenticated;
grant select, insert, update, delete on public.race_rivals, public.race_polls to authenticated;
grant all on public.race_rivals, public.race_polls to service_role;

create policy "own campaign only" on public.race_rivals as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "rivals readable by team" on public.race_rivals for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "rivals written by staff" on public.race_rivals for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.race_polls as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "polls readable by team" on public.race_polls for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "polls written by staff" on public.race_polls for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 16 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
