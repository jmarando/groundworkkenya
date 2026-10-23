-- Schema 31: the field plan, and stipends from the plan to the ledger.
--
-- 1. walk_lists.due_on and .shift: the day (and morning, afternoon or the whole day) a list is
--    meant to be walked. Written only by schedule_walk_list, which can also give the list.
-- 2. my_walk_lists and open_walk_lists carry the day and shift, so the field app puts today first.
-- 3. field_plan and field_plan_wards: what the office plans over a fortnight, and each ward's doors
--    planned and knocked against its target. Counts only; the office (candidate, manager,
--    organiser) reads them.
-- 4. Stipends from the plan: stipends_from_field makes one pending stipend per person per day they
--    knocked doors on a walk list; approve_stipends approves; record_stipend_paid marks one paid
--    with its M-Pesa receipt and posts it to Finance once. begin_stipend_payment and
--    finish_stipend_payment carry an M-Pesa payout (B2C) between them, so a stipend can never be
--    sent twice. Money is the candidate's and managers'.
-- 5. A field agent reads their own stipends only, not their colleagues' pay and phone numbers.
-- 6. The schema version.

-- 1. The day a list is walked.
alter table public.walk_lists
  add column if not exists due_on date,
  add column if not exists shift  text check (shift is null or shift in ('morning', 'afternoon', 'day'));
create index if not exists walk_lists_due_idx on public.walk_lists (campaign_id, due_on) where due_on is not null;

create or replace function public.schedule_walk_list(_id uuid, _due_on date, _shift text, _to uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.walk_lists;
begin
  perform public.walk_list_staff_only();
  select * into l from public.walk_lists where id = _id and campaign_id = public.my_campaign() for update;
  if not found then
    raise exception 'That list isn''t on file.' using errcode = 'P0001';
  end if;
  if l.status = 'done' then
    raise exception 'That list is done.' using errcode = 'P0001';
  end if;
  if _shift is not null and _shift not in ('morning', 'afternoon', 'day') then
    raise exception 'A shift is morning, afternoon or the whole day.' using errcode = '22023';
  end if;
  if _due_on is not null and (_due_on < current_date - 1 or _due_on > current_date + 120) then
    raise exception 'Plan from today to four months ahead.' using errcode = '22023';
  end if;
  update public.walk_lists
     set due_on = _due_on, shift = case when _due_on is null then null else coalesce(_shift, 'day') end
   where id = _id;
  if _to is not null and _to is distinct from l.given_to then
    perform public.give_walk_list(_id, _to);
  end if;
end;
$$;
revoke all on function public.schedule_walk_list(uuid, date, text, uuid) from public, anon;
grant execute on function public.schedule_walk_list(uuid, date, text, uuid) to authenticated;

-- 2. The day and shift in the lists' reads (a new column changes a function's type, so each goes
-- first and comes back with its grants).
drop function if exists public.my_walk_lists();
create function public.my_walk_lists()
returns table (
  id            uuid,
  name          text,
  centre_id     uuid,
  centre_name   text,
  ward_id       uuid,
  doors         integer,
  done          integer,
  given_at      timestamptz,
  first_sent_at timestamptz,
  due_on        date,
  shift         text
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.name, l.centre_id, s.name, l.ward_id, c.doors, c.done, l.given_at, l.first_sent_at,
         l.due_on, l.shift
    from public.walk_lists l
    join public.walk_list_counts(array(
           select x.id from public.walk_lists x where x.given_to = auth.uid() and x.status = 'out'
         )) c on c.list_id = l.id
    left join public.polling_stations s on s.id = l.centre_id
   order by l.due_on nulls last, l.given_at desc nulls last, l.id
$$;
revoke all on function public.my_walk_lists() from public, anon;
grant execute on function public.my_walk_lists() to authenticated;

drop function if exists public.open_walk_lists(uuid);
create function public.open_walk_lists(_ward_id uuid)
returns table (
  id              uuid,
  name            text,
  status          text,
  centre_id       uuid,
  ward_id         uuid,
  given_to        uuid,
  given_to_name   text,
  doors           integer,
  done            integer,
  not_home        integer,
  first_sent_at   timestamptz,
  given_at        timestamptz,
  due_on          date,
  shift           text
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.name, l.status, l.centre_id, l.ward_id, l.given_to, p.full_name,
         c.doors, c.done, c.not_home, l.first_sent_at, l.given_at, l.due_on, l.shift
    from public.walk_lists l
    join public.walk_list_counts(array(
           select x.id from public.walk_lists x
            where x.status in ('draft', 'out') and (_ward_id is null or x.ward_id = _ward_id)
         )) c on c.list_id = l.id
    left join public.profiles p on p.user_id = l.given_to
   order by l.created_at desc, l.id
$$;
revoke all on function public.open_walk_lists(uuid) from public, anon;
grant execute on function public.open_walk_lists(uuid) to authenticated;

-- 3. The fortnight: every open list (scheduled in the window or not yet scheduled) and the lists
-- done in the window, with who has them and how far they've got.
create or replace function public.field_plan(_from date, _to date)
returns table (
  id            uuid,
  name          text,
  status        text,
  ward_id       uuid,
  ward_name     text,
  centre_name   text,
  given_to      uuid,
  given_to_name text,
  due_on        date,
  shift         text,
  doors         integer,
  done          integer,
  done_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.walk_list_staff_only();
  if _to < _from or _to - _from > 62 then
    raise exception 'Plan up to two months at a time.' using errcode = '22023';
  end if;
  return query
  select l.id, l.name, l.status, l.ward_id, w.name, s.name, l.given_to, p.full_name, l.due_on, l.shift,
         c.doors, c.done, l.done_at
    from public.walk_lists l
    join public.walk_list_counts(array(
           select x.id from public.walk_lists x
            where x.campaign_id = public.my_campaign()
              and ((x.status in ('draft', 'out') and (x.due_on is null or x.due_on between _from - 14 and _to))
                or (x.status = 'done' and (x.due_on between _from and _to
                                           or x.done_at::date between _from and _to)))
         )) c on c.list_id = l.id
    left join public.wards w on w.id = l.ward_id
    left join public.polling_stations s on s.id = l.centre_id
    left join public.profiles p on p.user_id = l.given_to
   order by l.due_on nulls first, l.shift nulls last, l.name;
end;
$$;
revoke all on function public.field_plan(date, date) from public, anon;
grant execute on function public.field_plan(date, date) to authenticated;

-- Each ward over the window: its target, the doors on lists planned for the window, the doors
-- knocked, the conversations had and the supporters met (support 4 or 5). Counts only.
create or replace function public.field_plan_wards(_from date, _to date)
returns table (
  ward_id      uuid,
  slug         text,
  name         text,
  target_votes integer,
  doors_planned integer,
  doors_knocked integer,
  spoke        integer,
  supporters   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.walk_list_staff_only();
  if _to < _from or _to - _from > 62 then
    raise exception 'Plan up to two months at a time.' using errcode = '22023';
  end if;
  return query
  select w.id, w.slug, w.name, coalesce(w.target_votes, 0)::integer,
         coalesce((select count(*) from public.walk_list_doors d join public.walk_lists l on l.id = d.walk_list_id
                    where l.campaign_id = w.campaign_id and l.ward_id = w.id
                      and l.due_on between _from and _to), 0)::integer,
         coalesce((select count(*) from public.house_visits v
                    where v.campaign_id = w.campaign_id and v.ward_id = w.id
                      and v.visited_at >= _from and v.visited_at < _to + 1), 0)::integer,
         coalesce((select count(*) from public.house_visits v
                    where v.campaign_id = w.campaign_id and v.ward_id = w.id and v.outcome = 'spoke'
                      and v.visited_at >= _from and v.visited_at < _to + 1), 0)::integer,
         coalesce((select count(*) from public.house_visits v
                    where v.campaign_id = w.campaign_id and v.ward_id = w.id and v.support >= 4
                      and v.visited_at >= _from and v.visited_at < _to + 1), 0)::integer
    from public.wards w
   where w.campaign_id = public.my_campaign()
   order by w.name;
end;
$$;
revoke all on function public.field_plan_wards(date, date) from public, anon;
grant execute on function public.field_plan_wards(date, date) to authenticated;

-- 4. Stipends from the plan.
alter table public.agent_stipends
  add column if not exists user_id        uuid references auth.users(id) on delete set null,
  add column if not exists work_date      date,
  add column if not exists doors          integer,
  add column if not exists approved_by    uuid references auth.users(id) on delete set null,
  add column if not exists approved_at    timestamptz,
  add column if not exists paid_by        uuid references auth.users(id) on delete set null,
  add column if not exists expense_id     uuid references public.expenses(id) on delete set null,
  -- An M-Pesa payout in flight: the id we sent, and the last error if it failed.
  add column if not exists mpesa_request  text unique,
  add column if not exists payment_error  text;
create unique index if not exists agent_stipends_one_a_day
  on public.agent_stipends (campaign_id, user_id, work_date) where user_id is not null and work_date is not null;

create or replace function public.stipend_money_only()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager') then
    raise exception 'Only the candidate and managers handle stipends.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.stipend_money_only() from public, anon, authenticated;

-- One pending stipend per person per day they knocked doors on a walk list, in the window. A day
-- already on file is left as it is, so running it twice changes nothing.
create or replace function public.stipends_from_field(_from date, _to date, _rate numeric)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.my_campaign();
  _added integer;
begin
  perform public.stipend_money_only();
  if _rate is null or _rate <= 0 or _rate > 20000 then
    raise exception 'A day''s rate is up to KES 20,000.' using errcode = '22023';
  end if;
  if _to < _from or _to - _from > 62 then
    raise exception 'Up to two months at a time.' using errcode = '22023';
  end if;
  with days as (
    select v.actor as user_id, (v.visited_at at time zone 'Africa/Nairobi')::date as work_date,
           count(*)::integer as doors, mode() within group (order by v.ward_id) as ward_id
      from public.house_visits v
     where v.campaign_id = _campaign and v.walk_list_id is not null and v.actor is not null
       and (v.visited_at at time zone 'Africa/Nairobi')::date between _from and _to
     group by 1, 2
  ), ins as (
    insert into public.agent_stipends
      (campaign_id, user_id, work_date, doors, agent_name, phone, role, ward_id, rate_kes, days, amount_kes, status, method)
    select _campaign, d.user_id, d.work_date, d.doors,
           coalesce(nullif(p.full_name, ''), p.email, 'Agent'), coalesce(p.phone, ''), 'agent', d.ward_id,
           _rate, 1, _rate, 'pending', 'mpesa'
      from days d
      join public.campaign_members m on m.user_id = d.user_id and m.campaign_id = _campaign
      left join public.profiles p on p.user_id = d.user_id
    on conflict (campaign_id, user_id, work_date) where user_id is not null and work_date is not null do nothing
    returning 1
  )
  select count(*) into _added from ins;
  return _added;
end;
$$;
revoke all on function public.stipends_from_field(date, date, numeric) from public, anon;
grant execute on function public.stipends_from_field(date, date, numeric) to authenticated;

create or replace function public.approve_stipends(_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _n integer;
begin
  perform public.stipend_money_only();
  update public.agent_stipends
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = any(_ids) and campaign_id = public.my_campaign() and status = 'pending';
  get diagnostics _n = row_count;
  return _n;
end;
$$;
revoke all on function public.approve_stipends(uuid[]) from public, anon;
grant execute on function public.approve_stipends(uuid[]) to authenticated;

-- The one place a stipend becomes paid: its receipt, and its expense in Finance, once.
create or replace function public.stipend_paid(_id uuid, _receipt text, _by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.agent_stipends;
  _expense uuid;
begin
  select * into s from public.agent_stipends where id = _id for update;
  if not found then
    raise exception 'That stipend isn''t on file.' using errcode = 'P0001';
  end if;
  if s.status = 'paid' then
    return;
  end if;
  if s.status not in ('approved', 'sending') then
    raise exception 'Only an approved stipend can be paid.' using errcode = 'P0001';
  end if;
  if s.expense_id is null then
    insert into public.expenses (campaign_id, description, category, vendor, amount_kes, status, statutory, reference, incurred_at)
    values (s.campaign_id,
            'Stipend: ' || s.agent_name || coalesce(', ' || to_char(s.work_date, 'DD Mon YYYY'), ''),
            'stipends', 'M-Pesa', s.amount_kes, 'paid', true, _receipt, now())
    returning id into _expense;
  end if;
  update public.agent_stipends
     set status = 'paid', reference = _receipt, paid_at = now(), paid_by = _by,
         expense_id = coalesce(expense_id, _expense), payment_error = null
   where id = _id;
end;
$$;
revoke all on function public.stipend_paid(uuid, text, uuid) from public, anon, authenticated;

-- Paid by hand (M-Pesa from a phone, cash): the receipt is what proves it.
create or replace function public.record_stipend_paid(_id uuid, _receipt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stipend_money_only();
  if coalesce(btrim(_receipt), '') !~ '^[A-Za-z0-9-]{6,40}$' then
    raise exception 'Give the M-Pesa receipt (letters and numbers).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.agent_stipends where id = _id and campaign_id = public.my_campaign()) then
    raise exception 'That stipend isn''t on file.' using errcode = 'P0001';
  end if;
  -- In flight with no word from M-Pesa: wait. After a timeout (the reason is set) the office
  -- checks the M-Pesa statement and records the receipt it finds.
  if exists (select 1 from public.agent_stipends where id = _id and status = 'sending' and payment_error is null) then
    raise exception 'An M-Pesa payout for it is in flight; wait for its answer.' using errcode = 'P0001';
  end if;
  perform public.stipend_paid(_id, upper(btrim(_receipt)), auth.uid());
end;
$$;
revoke all on function public.record_stipend_paid(uuid, text) from public, anon;
grant execute on function public.record_stipend_paid(uuid, text) to authenticated;

-- An M-Pesa payout starts: approved becomes sending, with the id the request carries. Only one
-- request per stipend is ever in flight, so a double click or a retry can't pay twice.
create or replace function public.begin_stipend_payment(_id uuid)
returns table (request_id text, phone text, amount_kes numeric, agent_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.agent_stipends;
  _req text := 'GW-' || replace(gen_random_uuid()::text, '-', '');
begin
  perform public.stipend_money_only();
  select * into s from public.agent_stipends
   where id = _id and campaign_id = public.my_campaign() for update;
  if not found then
    raise exception 'That stipend isn''t on file.' using errcode = 'P0001';
  end if;
  if s.status <> 'approved' then
    raise exception 'Only an approved stipend can be paid.' using errcode = 'P0001';
  end if;
  if coalesce(s.phone, '') !~ '^(\+?254|0)(7|1)\d{8}$' then
    raise exception 'The agent''s phone isn''t an M-Pesa number on file.' using errcode = 'P0001';
  end if;
  update public.agent_stipends
     set status = 'sending', mpesa_request = _req, paid_by = auth.uid(), payment_error = null
   where id = _id;
  return query select _req, s.phone, s.amount_kes, s.agent_name;
end;
$$;
revoke all on function public.begin_stipend_payment(uuid) from public, anon;
grant execute on function public.begin_stipend_payment(uuid) to authenticated;

-- M-Pesa's answer, from the callback (service role only): paid with its receipt, or back to
-- approved with the reason, ready to try again.
create or replace function public.finish_stipend_payment(_request text, _ok boolean, _receipt text, _error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.agent_stipends;
begin
  select * into s from public.agent_stipends where mpesa_request = _request for update;
  if not found or s.status <> 'sending' then
    return;
  end if;
  if _ok and coalesce(_receipt, '') <> '' then
    perform public.stipend_paid(s.id, _receipt, s.paid_by);
  else
    update public.agent_stipends
       set status = 'approved', mpesa_request = null, payment_error = left(coalesce(_error, 'M-Pesa declined it.'), 200)
     where id = s.id;
  end if;
end;
$$;
revoke all on function public.finish_stipend_payment(text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.finish_stipend_payment(text, boolean, text, text) to service_role;

-- M-Pesa timed out: the money may or may not have gone. The stipend stays in flight with the
-- reason, so nothing pays it again until the office has checked the statement.
create or replace function public.stipend_payment_unclear(_request text, _note text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.agent_stipends
     set payment_error = left(coalesce(_note, 'M-Pesa timed out. Check the statement before paying again.'), 200)
   where mpesa_request = _request and status = 'sending';
$$;
revoke all on function public.stipend_payment_unclear(text, text) from public, anon, authenticated;
grant execute on function public.stipend_payment_unclear(text, text) to service_role;

-- After checking the statement and finding no payment: back to approved, to pay again.
create or replace function public.release_stipend_payment(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.stipend_money_only();
  update public.agent_stipends
     set status = 'approved', mpesa_request = null
   where id = _id and campaign_id = public.my_campaign() and status = 'sending' and payment_error is not null;
  if not found then
    raise exception 'Only a payout M-Pesa didn''t answer can be released.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.release_stipend_payment(uuid) from public, anon;
grant execute on function public.release_stipend_payment(uuid) to authenticated;

-- 5. Who reads stipends: the office, and an agent their own.
drop policy if exists "stipends readable by team" on public.agent_stipends;
drop policy if exists "stipends read by the office or their agent" on public.agent_stipends;
create policy "stipends read by the office or their agent" on public.agent_stipends for select to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser') or user_id = auth.uid());

-- 6. The schema version.
create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 31 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
