drop policy if exists "contributions readable by team" on public.contributions;
drop policy if exists "expenses readable by team" on public.expenses;
create policy "contributions readable by principals" on public.contributions for select to authenticated using (public.is_staff(auth.uid()));
create policy "expenses readable by principals" on public.expenses for select to authenticated using (public.is_staff(auth.uid()));