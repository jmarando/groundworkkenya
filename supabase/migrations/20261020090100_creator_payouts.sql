-- Schema 30: creators' payouts from Daraja Pulse go to Finance
-- (docs/superpowers/specs/2026-10-20-daraja-pulse-link-design.md).
--
-- record_creator_payouts takes the payouts Pulse reported and posts each one, once, as a pending
-- "creators" expense against the spending limit (reference PULSE-<payout id>). The candidate and
-- managers only; the campaign is the caller's own.

create or replace function public.record_creator_payouts(_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.my_campaign();
  _row jsonb;
  _ref text;
  _amount numeric;
  _added integer := 0;
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager') then
    raise exception 'Only the candidate and managers can add payouts to Finance.' using errcode = '42501';
  end if;
  if _campaign is null then
    raise exception 'No campaign.' using errcode = '42501';
  end if;
  if jsonb_typeof(_rows) is distinct from 'array' or jsonb_array_length(_rows) > 500 then
    raise exception 'Up to 500 payouts at a time.' using errcode = '22023';
  end if;
  for _row in select * from jsonb_array_elements(_rows) loop
    _ref := 'PULSE-' || coalesce(_row->>'id', '');
    _amount := (_row->>'gross_kes')::numeric;
    if (_row->>'id') !~ '^[0-9A-Za-z-]{1,64}$' or _amount is null or _amount <= 0 then
      raise exception 'A payout needs an id and an amount.' using errcode = '22023';
    end if;
    if exists (select 1 from public.expenses e where e.campaign_id = _campaign and e.reference = _ref) then
      continue;
    end if;
    insert into public.expenses (campaign_id, description, category, vendor, amount_kes, status, statutory, reference, incurred_at)
    values (_campaign,
            'Creator payout: ' || left(coalesce(nullif(_row->>'creator', ''), 'a creator'), 80),
            'creators', 'Daraja Pulse', _amount, 'pending', true, _ref,
            coalesce((_row->>'paid_at')::timestamptz, now()));
    _added := _added + 1;
  end loop;
  return _added;
end;
$$;

revoke all on function public.record_creator_payouts(jsonb) from public, anon;
grant execute on function public.record_creator_payouts(jsonb) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 30 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
