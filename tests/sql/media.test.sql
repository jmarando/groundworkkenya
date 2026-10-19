-- Paid media, step 1: an ad buy posts to Finance, stays inside its campaign, and is
-- booked only by the candidate or a manager. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: the schema is at version 29 or later, and the new seats carry their gazetted limits
do $$ begin
  assert public.groundwork_schema_version() >= 29, 'schema 29';
  assert (select spending_limit_kes from public.campaigns where slug = 'githunguri') = 20560428, 'Githunguri''s limit';
  assert (select spending_limit_kes from public.campaigns where slug = 'mathira') is null, 'Mathira''s is not on file';
end $$;

-- test: booking a buy posts a pending "ads" expense of the same amount, and the amount is then fixed
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.media_buys (platform, name, starts_on, ends_on, amount_kes, paid_for_by)
  values ('meta', 'Bursary reminder, Embakasi', current_date, current_date + 7, 25000, 'Paid for by the campaign');
do $$
declare b record; e record;
begin
  select * into b from public.media_buys;
  assert b.campaign_id = 'ca000000-0000-4000-8000-000000000002', 'the buy is Sakaja''s';
  assert b.expense_id is not null, 'it points at its expense';
  select * into e from public.expenses where id = b.expense_id;
  assert e.amount_kes = 25000 and e.category = 'ads' and e.status = 'pending', 'a pending ads expense';
  assert e.campaign_id = b.campaign_id, 'in the same campaign';
  assert e.reference like 'AD-%', 'with an AD- reference';
  assert pg_temp.state_of($q$update public.media_buys set amount_kes = 1$q$) = 'P0001', 'the amount is fixed';
  assert pg_temp.state_of($q$update public.media_buys set reach = 12000, impressions = 40000, results_on = current_date$q$) is null,
    'results can be added';
end $$;
rollback;

-- test: an agent can't book or read buys, and another campaign sees none
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.media_buys (platform, name, starts_on, ends_on, amount_kes, paid_for_by)
  values ('radio', 'Kameme breakfast', current_date, current_date + 3, 60000, 'Paid for by the campaign');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.media_buys) = 0, 'Sakaja''s agent reads no buys';
  assert pg_temp.state_of($q$insert into public.media_buys (platform, name, starts_on, ends_on, amount_kes, paid_for_by)
    values ('meta', 'x', current_date, current_date, 1, 'Paid for by x')$q$) = '42501', 'or books one';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.media_buys) = 0, 'Mathira''s candidate reads none of Sakaja''s';
end $$;
rollback;

-- test: a buy needs a disclosure, real dates and a known platform
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$insert into public.media_buys (platform, name, starts_on, ends_on, amount_kes, paid_for_by)
    values ('meta', 'x', current_date, current_date, 100, '')$q$) = '23514', 'no disclosure';
  assert pg_temp.state_of($q$insert into public.media_buys (platform, name, starts_on, ends_on, amount_kes, paid_for_by)
    values ('meta', 'x', current_date, current_date - 1, 100, 'Paid for by x')$q$) = '23514', 'ends before it starts';
  assert pg_temp.state_of($q$insert into public.media_buys (platform, name, starts_on, ends_on, amount_kes, paid_for_by)
    values ('myspace', 'x', current_date, current_date, 100, 'Paid for by x')$q$) = '23514', 'an unknown platform';
end $$;
rollback;
