-- Schema 29: paid media, step 1, and each campaign's own spending limit.
--
-- 1. campaigns.spending_limit_kes: the limit IEBC gazetted for the seat (Gazette Notice 12251,
--    7 August 2026), with where it came from. Null means not on file: Finance says so rather
--    than measuring a campaign against another seat's limit.
-- 2. media_buys: an ad bought on a platform (or radio, TV, print, outdoor), with its dates, the
--    ward it aims at, the "Paid for by" line and, once known, what it delivered. Booking one
--    posts its amount to Finance as an "ads" expense, pending approval like any other; the
--    amount can't change afterwards, so the ledger and the buy always agree.
-- 3. The schema version.

-- 1. The limit.
alter table public.campaigns
  add column if not exists spending_limit_kes numeric check (spending_limit_kes is null or spending_limit_kes > 0),
  add column if not exists spending_limit_source text;

update public.campaigns c set spending_limit_kes = v.l, spending_limit_source = v.s
  from (values
    ('githunguri', 20560428::numeric, 'IEBC, Kenya Gazette Notice 12251, 7 August 2026: Member of the National Assembly, Githunguri'),
    ('roysambu', 6699179::numeric, 'IEBC, Kenya Gazette Notice 12251, 7 August 2026: Member of County Assembly, Roysambu'),
    ('athwana', 4224052::numeric, 'IEBC, Kenya Gazette Notice 12251, 7 August 2026: Member of County Assembly, Athwana'),
    ('sakaja', 433800000::numeric, 'Governor of Nairobi, as the campaign set it')
  ) as v(slug, l, s)
 where c.slug = v.slug and c.spending_limit_kes is null;

-- 2. Ad buys.
create table if not exists public.media_buys (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign()
               references public.campaigns(id) on delete cascade,
  platform     text not null check (platform in
                 ('meta', 'google', 'youtube', 'tiktok', 'x', 'radio', 'tv', 'print', 'outdoor', 'other')),
  name         text not null check (char_length(name) between 1 and 120),
  ward_id      uuid references public.wards(id) on delete set null,
  starts_on    date not null,
  ends_on      date not null,
  amount_kes   numeric not null check (amount_kes > 0),
  -- The disclosure the ad carries, e.g. "Paid for by the Friends of Gathoni Wamuchomba".
  paid_for_by  text not null check (char_length(paid_for_by) between 3 and 160),
  -- The platform's own id for the campaign or order, so later imports find it again.
  external_id  text,
  impressions  bigint check (impressions is null or impressions >= 0),
  reach        bigint check (reach is null or reach >= 0),
  clicks       bigint check (clicks is null or clicks >= 0),
  results_on   date,
  expense_id   uuid references public.expenses(id) on delete set null,
  booked_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (campaign_id, platform, external_id)
);

create index if not exists media_buys_campaign_idx on public.media_buys (campaign_id, starts_on desc);

drop trigger if exists stamp_campaign on public.media_buys;
create trigger stamp_campaign before insert on public.media_buys
  for each row execute function public.stamp_campaign('wards', 'ward_id');

alter table public.media_buys enable row level security;
revoke all on public.media_buys from anon, authenticated;
grant select, insert, update, delete on public.media_buys to authenticated;
grant all on public.media_buys to service_role;

drop policy if exists "own campaign only" on public.media_buys;
create policy "own campaign only" on public.media_buys as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "the money people" on public.media_buys;
create policy "the money people" on public.media_buys for all to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager'))
  with check (public.my_campaign_role() in ('super', 'candidate', 'manager'));

-- Booking posts the amount to Finance; the amount and platform are then fixed.
create or replace function public.media_buy_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _label text := case new.platform
    when 'meta' then 'Meta (Facebook, Instagram)' when 'google' then 'Google' when 'youtube' then 'YouTube'
    when 'tiktok' then 'TikTok' when 'x' then 'X' when 'radio' then 'Radio' when 'tv' then 'TV'
    when 'print' then 'Print' when 'outdoor' then 'Outdoor' else 'Other media' end;
begin
  if tg_op = 'INSERT' then
    insert into public.expenses (campaign_id, description, category, vendor, amount_kes, status, statutory, reference, incurred_at)
    values (new.campaign_id, 'Ad buy: ' || new.name, 'ads', _label, new.amount_kes, 'pending', true,
            'AD-' || upper(substr(replace(new.id::text, '-', ''), 1, 8)), new.starts_on::timestamptz)
    returning id into new.expense_id;
    return new;
  end if;
  if new.amount_kes is distinct from old.amount_kes or new.platform is distinct from old.platform
     or new.campaign_id is distinct from old.campaign_id or new.expense_id is distinct from old.expense_id then
    raise exception 'An ad buy''s amount and platform are on the ledger; book a new one instead.'
      using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.media_buy_to_ledger() from public, anon, authenticated;

-- Named to run after stamp_campaign (triggers fire in name order), so the expense gets the
-- buy's settled campaign.
drop trigger if exists to_ledger on public.media_buys;
create trigger to_ledger before insert or update on public.media_buys
  for each row execute function public.media_buy_to_ledger();

-- 3. The schema version.
create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 29 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
