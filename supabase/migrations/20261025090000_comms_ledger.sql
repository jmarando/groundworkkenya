-- Schema 35: what sending costs goes on the ledger.
--
-- 1. messages.on_ledger: whether a sent message's charge has been posted to Finance. Every message
--    already on file predates this and is marked posted, so nothing old is billed afresh.
-- 2. comms_to_ledger (service role, run by the hourly sweep): for each campaign and each Nairobi
--    day before today, the charges the SMS provider reported for messages that went out become one
--    pending "comms" expense, and those messages are marked posted. A provider that reports no
--    charge (Twilio through the gateway) posts nothing rather than a guess.
-- 3. The schema version.

alter table public.messages add column if not exists on_ledger boolean not null default false;
update public.messages set on_ledger = true where not on_ledger;
create index if not exists messages_unposted_idx on public.messages (campaign_id, sent_at)
  where not on_ledger and direction = 'out' and cost_kes > 0;

create or replace function public.comms_to_ledger()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _today date := (now() at time zone 'Africa/Nairobi')::date;
  _day   record;
  _n     integer := 0;
begin
  for _day in
    select m.campaign_id,
           (coalesce(m.sent_at, m.created_at) at time zone 'Africa/Nairobi')::date as day,
           sum(m.cost_kes) as amount,
           count(*) as messages,
           array_agg(m.id) as ids
      from public.messages m
     where not m.on_ledger and m.direction = 'out' and m.cost_kes > 0
       and m.status in ('sent', 'delivered', 'read')
       and (coalesce(m.sent_at, m.created_at) at time zone 'Africa/Nairobi')::date < _today
     group by 1, 2
  loop
    insert into public.expenses (campaign_id, description, category, vendor, amount_kes, status, reference, incurred_at)
    values (_day.campaign_id,
            format('SMS sent on %s: %s messages', to_char(_day.day, 'FMDD Mon YYYY'), _day.messages),
            'comms', 'SMS provider', round(_day.amount, 2), 'pending',
            'COMMS-' || to_char(_day.day, 'YYYYMMDD'),
            (_day.day::timestamp + interval '12 hours') at time zone 'Africa/Nairobi');
    update public.messages set on_ledger = true where id = any(_day.ids);
    _n := _n + 1;
  end loop;
  return _n;
end;
$$;
revoke all on function public.comms_to_ledger() from public, anon, authenticated;
grant execute on function public.comms_to_ledger() to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 35 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
