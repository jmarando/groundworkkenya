create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 27 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;