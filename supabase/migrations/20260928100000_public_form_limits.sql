-- Limits on what the public can send in without an account.
--
-- The poll page (/p/<code>) and the demo request form are open to anyone.
-- Neither may be turned into a way to fill the database or run up a bill.

-- ----------------------------------------------------------- rate limits --

-- Fixed-window counters, keyed by what is being limited: for the poll page,
-- a hash of the visitor's connection, never the address itself. Rows older
-- than a day are cleared as new ones arrive.
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

-- Only the server's service role reads or writes these.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Count one hit against _key. True while the key is within _limit hits per
-- _window_seconds; false once it is over.
create or replace function public.rate_limit_hit(_key text, _limit integer, _window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  _hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(_key, 200), now(), 1)
  on conflict (key) do update
     set window_start = case when r.window_start <= now() - make_interval(secs => _window_seconds)
                             then now() else r.window_start end,
         hits         = case when r.window_start <= now() - make_interval(secs => _window_seconds)
                             then 1 else r.hits + 1 end
  returning hits into _hits;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return _hits <= _limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ------------------------------------------------------------ demo leads --

-- The homepage form writes here straight from the browser, so the table
-- itself has to refuse abuse: sensible lengths, and no more than twenty
-- requests in ten minutes from everyone together. Existing rows are not
-- re-checked.
alter table public.demo_leads drop constraint if exists demo_leads_sizes;
alter table public.demo_leads add constraint demo_leads_sizes check (
  char_length(name) between 1 and 120
  and char_length(phone) between 7 and 32
  and char_length(coalesce(email, '')) <= 254
  and char_length(coalesce(seat, '')) <= 60
  and char_length(coalesce(county, '')) <= 60
) not valid;

create index if not exists demo_leads_created_idx on public.demo_leads (created_at desc);

create or replace function public.demo_leads_throttle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One request at a time, so a burst cannot all read the same count.
  perform pg_advisory_xact_lock(hashtext('groundwork.demo_leads'));
  if (select count(*) from public.demo_leads where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Too many requests just now. Please try again in a few minutes.'
      using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.demo_leads_throttle() from public, anon, authenticated;

drop trigger if exists demo_leads_throttle on public.demo_leads;
create trigger demo_leads_throttle
  before insert on public.demo_leads
  for each row execute function public.demo_leads_throttle();

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 10 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
