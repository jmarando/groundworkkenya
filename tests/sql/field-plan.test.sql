-- The field plan (schema 31): a list's day and shift, the fortnight's reads, and stipends from the
-- days knocked through approval to paid, once. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- "Today" is Nairobi's, as in the app: a visit counts on its Nairobi date, so between midnight and
-- 03:00 in Nairobi a UTC current_date would ask about the wrong day.
set timezone = 'Africa/Nairobi';

create or replace function pg_temp.doors(_from integer, _to integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('pc', 'TEST0000+' || lpad(i::text, 2, '0'), 'lat', -1.28 - i * 0.00005, 'lng', 36.78,
    'outline', jsonb_build_array(jsonb_build_array(jsonb_build_array(36.78, -1.28), jsonb_build_array(36.78002, -1.28),
                                                   jsonb_build_array(36.78002, -1.28002), jsonb_build_array(36.78, -1.28))),
    'ward_id', null) order by i) from generate_series(_from, _to) i $$;

create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: schema 31 is in
do $$ begin assert public.groundwork_schema_version() >= 31; end $$;

-- test: the office schedules a list for a day and gives it; the agent sees the day; an agent can't schedule
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  lid uuid;
begin
  lid := (public.create_walk_list('Kileleshwa 1', null, kile, pg_temp.doors(1, 4), null) ->> 'id')::uuid;
  perform public.schedule_walk_list(lid, current_date + 2, 'morning', '00000000-0000-0000-0000-0000000000b2');
  assert (select due_on = current_date + 2 and shift = 'morning' and status = 'out'
                 and given_to = '00000000-0000-0000-0000-0000000000b2' from public.walk_lists where id = lid), 'scheduled and given';
  assert (select count(*) from public.field_plan(current_date, current_date + 13) where id = lid and doors = 4) = 1, 'on the plan';
  assert pg_temp.state_of(format('select public.schedule_walk_list(%L, %L, %L)', lid, current_date + 1, 'night')) = '22023', 'no night shift';
  assert pg_temp.state_of(format('select public.schedule_walk_list(%L, %L, null)', lid, current_date + 400)) = '22023', 'not a year out';
  perform public.schedule_walk_list(lid, null, null);
  assert (select due_on is null and shift is null from public.walk_lists where id = lid), 'unscheduled again';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.my_walk_lists()) = 1, 'the agent has the list';
  assert pg_temp.state_of(format('select public.schedule_walk_list(%L, %L, null)',
    (select id from public.my_walk_lists() limit 1), current_date)) = '42501', 'an agent can''t schedule';
  assert pg_temp.state_of($q$select * from public.field_plan(current_date, current_date + 13)$q$) = '42501', 'or read the plan';
end $$;
rollback;

-- test: days knocked become stipends once each; approve, then paid by hand posts to Finance once
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  kile uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa');
  lid uuid;
begin
  lid := (public.create_walk_list('Kileleshwa 2', null, kile, pg_temp.doors(1, 3), '00000000-0000-0000-0000-0000000000b2') ->> 'id')::uuid;
  update public.profiles set phone = '+254712345678', full_name = 'Agent Wanjiru' where user_id = '00000000-0000-0000-0000-0000000000b2';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
declare lid uuid := (select id from public.my_walk_lists() limit 1);
begin
  -- With a position (a test code's house is nowhere, so the visit isn't checked against it).
  perform public.record_door(gen_random_uuid(), null, null, 'not_home', null, '', '{}', '', now() - interval '5 minutes',
    jsonb_build_object('lat', -1.28, 'lng', 36.78), lid, 'TEST0000+01');
  perform public.record_door(gen_random_uuid(), null, null, 'spoke', 4, 'Water', '{}', '', now(),
    jsonb_build_object('lat', -1.28, 'lng', 36.78), lid, 'TEST0000+02');
  assert pg_temp.state_of($q$select public.stipends_from_field(current_date, current_date, 1500)$q$) = '42501', 'an agent can''t make stipends';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  n int;
  sid uuid;
  e int;
begin
  n := public.stipends_from_field(current_date - 1, current_date, 1500);
  assert n = 1, 'one person, one day';
  assert public.stipends_from_field(current_date - 1, current_date, 1500) = 0, 'never twice';
  select id into sid from public.agent_stipends where user_id = '00000000-0000-0000-0000-0000000000b2' and work_date is not null;
  assert (select status = 'pending' and doors = 2 and amount_kes = 1500 from public.agent_stipends where id = sid), 'pending, two doors';
  assert pg_temp.state_of(format('select public.record_stipend_paid(%L, %L)', sid, 'QKX12ABC9')) = 'P0001', 'not paid before approval';
  assert public.approve_stipends(array[sid]) = 1, 'approved';
  e := (select count(*) from public.expenses where category = 'stipends');
  perform public.record_stipend_paid(sid, 'qkx12abc9');
  perform public.record_stipend_paid(sid, 'QKX12ABC9');
  assert (select status = 'paid' and reference = 'QKX12ABC9' and expense_id is not null from public.agent_stipends where id = sid), 'paid with its receipt';
  assert (select count(*) from public.expenses where category = 'stipends') = e + 1, 'one expense, once';
  assert pg_temp.state_of(format('select public.record_stipend_paid(%L, %L)', sid, 'x')) = '22023', 'a receipt is letters and numbers';
end $$;
rollback;

-- test: an M-Pesa payout is in flight once; its answer pays it or puts it back with the reason
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  sid uuid;
  req text;
begin
  insert into public.agent_stipends (agent_name, phone, role, rate_kes, days, amount_kes, status)
    values ('Agent Otieno', '0712345678', 'agent', 1500, 1, 1500, 'approved') returning id into sid;
  select request_id into req from public.begin_stipend_payment(sid);
  assert req like 'GW-%', 'a request id';
  assert pg_temp.state_of(format('select * from public.begin_stipend_payment(%L)', sid)) = 'P0001', 'never two in flight';
  assert pg_temp.state_of(format('select public.record_stipend_paid(%L, %L)', sid, 'QKX12ABC9')) = 'P0001', 'not by hand while in flight';
  reset role;
  perform public.finish_stipend_payment(req, false, null, 'Insufficient float');
  assert (select status = 'approved' and payment_error = 'Insufficient float' and mpesa_request is null
            from public.agent_stipends where id = sid), 'back to approved with the reason';
end $$;
set local role authenticated;
do $$
declare
  sid uuid := (select id from public.agent_stipends where agent_name = 'Agent Otieno');
  req text;
begin
  select request_id into req from public.begin_stipend_payment(sid);
  reset role;
  perform public.finish_stipend_payment(req, true, 'RKT55XYZ1', null);
  perform public.finish_stipend_payment(req, true, 'RKT55XYZ1', null);
  assert (select status = 'paid' and reference = 'RKT55XYZ1' from public.agent_stipends where id = sid), 'paid by M-Pesa';
  assert (select count(*) from public.expenses where reference = 'RKT55XYZ1') = 1, 'once in Finance';
end $$;
rollback;

-- test: a timed-out payout stays in flight until the office checks; then by hand or released
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare
  sid uuid;
  req text;
begin
  insert into public.agent_stipends (agent_name, phone, role, rate_kes, days, amount_kes, status)
    values ('Agent Kamau', '+254711111111', 'agent', 1500, 1, 1500, 'approved') returning id into sid;
  select request_id into req from public.begin_stipend_payment(sid);
  assert pg_temp.state_of(format('select public.release_stipend_payment(%L)', sid)) = 'P0001', 'not released while waiting';
  reset role;
  perform public.stipend_payment_unclear(req, null);
  assert (select status = 'sending' and payment_error like 'M-Pesa timed out%' from public.agent_stipends where id = sid), 'still in flight, with the reason';
end $$;
set local role authenticated;
do $$
declare sid uuid := (select id from public.agent_stipends where agent_name = 'Agent Kamau');
begin
  perform public.release_stipend_payment(sid);
  assert (select status = 'approved' and mpesa_request is null from public.agent_stipends where id = sid), 'released to pay again';
end $$;
rollback;

-- test: an agent reads their own stipends only
begin;
insert into public.agent_stipends (campaign_id, user_id, agent_name, phone, role, rate_kes, days, amount_kes, status)
  values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Mine', '', 'agent', 1, 1, 1, 'pending'),
         ('ca000000-0000-4000-8000-000000000002', null, 'Someone else', '+254700000000', 'agent', 1, 1, 1, 'pending');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.agent_stipends where agent_name = 'Someone else') = 0, 'not a colleague''s';
  assert (select count(*) from public.agent_stipends where agent_name = 'Mine') = 1, 'their own';
end $$;
rollback;
