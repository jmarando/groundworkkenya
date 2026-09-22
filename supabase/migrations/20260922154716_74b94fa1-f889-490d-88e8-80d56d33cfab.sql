
grant insert, update on public.listening_jobs to authenticated;
create policy "jobs managed by staff" on public.listening_jobs for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
