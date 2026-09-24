-- Expense approval by the authorised person.
--
-- Campaign finance law expects every expenditure to be approved before it is
-- paid, and approval without a supporting document is exactly what an audit
-- looks for. The Finance screen disables Approve until a document reference
-- is attached; that rule lives here as well, so it holds however the database
-- is reached. Who approved and when are kept on the row.

alter table public.expenses
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

create or replace function public.approve_expense(_expense_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _row public.expenses%rowtype;
begin
  -- Only a pending expense with its document attached can be approved.
  -- Runs as the caller: expenses are managed by admins and managers only.
  update public.expenses
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = _expense_id
     and status = 'pending'
     and coalesce(btrim(reference), '') <> ''
  returning * into _row;

  if found then
    return jsonb_build_object('id', _row.id, 'status', _row.status, 'approved_at', _row.approved_at);
  end if;

  -- Say why, without revealing anything the caller could not already read.
  select * into _row from public.expenses where id = _expense_id;
  if not found then
    raise exception 'Only an admin or manager can approve expenses.' using errcode = 'P0001';
  elsif _row.status <> 'pending' then
    raise exception 'That expense is already %.', _row.status using errcode = 'P0001';
  elsif coalesce(btrim(_row.reference), '') = '' then
    raise exception 'Attach the supporting document reference first.' using errcode = 'P0001';
  else
    raise exception 'Only an admin or manager can approve expenses.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.approve_expense(uuid) from public, anon;
grant execute on function public.approve_expense(uuid) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 5 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
