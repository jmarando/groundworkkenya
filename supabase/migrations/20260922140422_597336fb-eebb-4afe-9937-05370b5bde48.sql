create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
  select new.id,
    case
      when lower(new.email) = 'justin@glab.africa' then 'admin'::public.app_role
      when (select count(*) from auth.users) <= 1 then 'admin'::public.app_role
      else 'viewer'::public.app_role
    end
  on conflict do nothing;
  return new;
end; $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role from auth.users u
where lower(u.email) = 'justin@glab.africa'
on conflict do nothing;