-- Schema 37: the keys that let a campaign's replies go out on Facebook and Instagram.
--
-- social_account_tokens holds each connected account's Page access token. Nobody signed in reads
-- it; the server reads it to send a reply. set_social_token is Groundwork's (the super admin's) to
-- call when it connects a campaign's Page, so a campaign can never point its replies at another's.

create table if not exists public.social_account_tokens (
  account_id  uuid primary key references public.social_accounts(id) on delete cascade,
  campaign_id uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  page_token  text not null check (length(page_token) between 20 and 1000),
  set_by      uuid references auth.users(id) on delete set null,
  set_at      timestamptz not null default now()
);
alter table public.social_account_tokens enable row level security;
revoke all on public.social_account_tokens from anon, authenticated;
grant all on public.social_account_tokens to service_role;
drop policy if exists "own campaign only" on public.social_account_tokens;
create policy "own campaign only" on public.social_account_tokens as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());

create or replace function public.set_social_token(_account uuid, _token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _campaign uuid;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Groundwork connects a campaign''s Page.' using errcode = '42501';
  end if;
  select campaign_id into _campaign from public.social_accounts where id = _account;
  if _campaign is null then
    raise exception 'That account is not on file.' using errcode = 'P0001';
  end if;
  if _token is null or btrim(_token) = '' then
    delete from public.social_account_tokens where account_id = _account;
    return;
  end if;
  insert into public.social_account_tokens (account_id, campaign_id, page_token, set_by)
  values (_account, _campaign, btrim(_token), auth.uid())
  on conflict (account_id) do update
     set page_token = excluded.page_token, set_by = excluded.set_by, set_at = now();
end;
$$;
revoke all on function public.set_social_token(uuid, text) from public, anon;
grant execute on function public.set_social_token(uuid, text) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 37 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
