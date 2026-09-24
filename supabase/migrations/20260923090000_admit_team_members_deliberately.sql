-- Admit team members deliberately.
--
-- handle_new_user() gives every new auth user a 'viewer' row, and
-- is_team_member() used to return true for anyone holding ANY row in
-- user_roles. Signup is open (email/password and Google), so any stranger who
-- created an account was treated as staff by row level security and could
-- read and write public.people -- names, phone numbers, notes -- along with
-- constituents' messages, conversations, poll responses and incidents.
--
-- From here on 'viewer' means "signed up, awaiting approval" and carries no
-- data access. An admin admits people by giving them a real role. Anyone who
-- was auto-granted 'viewer' in the past loses access with this migration.

create or replace function public.is_team_member(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.user_roles
     where user_id = _user_id
       and role in ('admin', 'manager', 'organiser', 'agent')
  )
$$;

comment on function public.is_team_member(uuid) is
  'True for admitted team members. Excludes ''viewer'', which marks a signup awaiting approval.';

revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;

-- Never leave a project with nobody able to let people in: if no admin exists,
-- the oldest account becomes one. In practice that is whoever created the
-- project, which is also who handle_new_user() made admin at signup.
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
  from auth.users u
 where not exists (select 1 from public.user_roles where role = 'admin')
 order by u.created_at asc
 limit 1
on conflict do nothing;

-- One role per person. Someone admitted while still holding the 'viewer'
-- marker would otherwise show up as both.
delete from public.user_roles v
 where v.role = 'viewer'
   and exists (
     select 1 from public.user_roles t
      where t.user_id = v.user_id and t.role <> 'viewer'
   );

-- Changing a role is a delete and an insert, and it has to be one step: done
-- as two separate requests, an admin demoting themselves loses the admin role
-- between the two and the insert is refused, leaving them with no role at all.
create or replace function public.set_member_role(_user_id uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an admin can change roles.' using errcode = '42501';
  end if;

  if _role <> 'admin'
     and public.has_role(_user_id, 'admin')
     and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'That is the only admin. Make someone else an admin first.'
      using errcode = 'P0001';
  end if;

  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role);
end;
$$;

revoke all on function public.set_member_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;

-- Lets the app report which schema the database is on, so a deploy can be
-- checked without reading any campaign data. Bumped by later migrations.
create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 1 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
