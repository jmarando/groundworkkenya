-- Schema 47: follower counts of the public accounts Listening names.
--
-- listening_accounts holds only public facts about public accounts (a handle, a name, how many
-- follow it), read from the platforms. It holds nothing about any campaign, so it is shared by all
-- of them: every signed-in user reads it and only the server writes it. Places, never people: a
-- count is not a profile, and nothing here records or guesses anyone's community.
--
-- The lookups that fill it come out of a daily 'profiles' budget alongside the other social ones.

create table if not exists public.listening_accounts (
  -- The same key the Voices screens use: platform, a colon, the account lower-cased ("x:@name").
  voice_key  text primary key check (position(':' in voice_key) > 1 and length(voice_key) <= 200),
  platform   text not null,
  name       text not null,
  url        text,
  followers  integer check (followers is null or followers >= 0),
  checked_at timestamptz,
  failed_at  timestamptz
);

alter table public.listening_accounts enable row level security;
revoke all on public.listening_accounts from anon;
revoke all on public.listening_accounts from authenticated;
grant select on public.listening_accounts to authenticated;
grant all on public.listening_accounts to service_role;
drop policy if exists "accounts are public facts" on public.listening_accounts;
create policy "accounts are public facts" on public.listening_accounts for select to authenticated
  using (true);

alter table public.social_credits drop constraint if exists social_credits_budget_check;
alter table public.social_credits
  add constraint social_credits_budget_check
  check (budget in ('rivals', 'keywords', 'trends', 'x', 'profiles'));

-- The latest prune_old_records (schema 46) plus: an account's count is kept 180 days from the last
-- look (a success or a failure).
create or replace function public.prune_old_records()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _webhooks integer;
  _alerts   integer;
  _mentions integer;
  _readings integer;
begin
  delete from public.whatsapp_webhook_events
   where processed_at is not null and processed_at < now() - interval '30 days';
  get diagnostics _webhooks = row_count;

  delete from public.listening_alert_events where created_at < now() - interval '90 days';
  get diagnostics _alerts = row_count;

  -- Three years of listening: the whole run-up to a general election, read back by the drafts.
  delete from public.listening_mentions where found_at < now() - interval '3 years';
  get diagnostics _mentions = row_count;

  delete from public.listening_readings where at < now() - interval '180 days';
  get diagnostics _readings = row_count;

  delete from public.listening_days where day < (now() - interval '3 years')::date;

  delete from public.listening_accounts
   where greatest(checked_at, failed_at) < now() - interval '180 days';

  return jsonb_build_object('webhooks', _webhooks, 'alert_events', _alerts, 'mentions', _mentions,
                            'readings', _readings);
end;
$$;

revoke all on function public.prune_old_records() from public, anon, authenticated;
grant execute on function public.prune_old_records() to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 47 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
