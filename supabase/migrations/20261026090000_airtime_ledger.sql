-- Schema 36: poll thank-you airtime on the ledger under its own name.
--
-- comms_to_ledger now posts each campaign's charges per Nairobi day and per channel: SMS as
-- "SMS sent on …" and airtime rewards as "Poll thank-you airtime on …", both pending "comms"
-- expenses with a reference per day and channel. Nothing else changes.

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
           m.channel,
           (coalesce(m.sent_at, m.created_at) at time zone 'Africa/Nairobi')::date as day,
           sum(m.cost_kes) as amount,
           count(*) as messages,
           array_agg(m.id) as ids
      from public.messages m
     where not m.on_ledger and m.direction = 'out' and m.cost_kes > 0
       and m.channel in ('sms', 'airtime')
       and m.status in ('sent', 'delivered', 'read')
       and (coalesce(m.sent_at, m.created_at) at time zone 'Africa/Nairobi')::date < _today
     group by 1, 2, 3
  loop
    insert into public.expenses (campaign_id, description, category, vendor, amount_kes, status, reference, incurred_at)
    values (_day.campaign_id,
            case _day.channel
              when 'airtime' then format('Poll thank-you airtime on %s: %s people',
                                         to_char(_day.day, 'FMDD Mon YYYY'), _day.messages)
              else format('SMS sent on %s: %s messages', to_char(_day.day, 'FMDD Mon YYYY'), _day.messages)
            end,
            'comms',
            case _day.channel when 'airtime' then 'Airtime provider' else 'SMS provider' end,
            round(_day.amount, 2), 'pending',
            case _day.channel when 'airtime' then 'AIRTIME-' else 'COMMS-' end || to_char(_day.day, 'YYYYMMDD'),
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
as $$ select 36 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
