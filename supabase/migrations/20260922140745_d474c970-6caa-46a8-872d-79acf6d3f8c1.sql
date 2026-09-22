
create or replace function public.is_team_member(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;

-- wards
drop policy if exists "wards readable" on public.wards;
create policy "wards readable by team" on public.wards for select to authenticated using (public.is_team_member(auth.uid()));

-- segments
drop policy if exists "segments readable" on public.segments;
create policy "segments readable by team" on public.segments for select to authenticated using (public.is_team_member(auth.uid()));

-- people
drop policy if exists "people readable" on public.people;
drop policy if exists "people updatable by team" on public.people;
drop policy if exists "people writable by team" on public.people;
create policy "people readable by team" on public.people for select to authenticated using (public.is_team_member(auth.uid()));
create policy "people updatable by team" on public.people for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "people writable by team" on public.people for insert to authenticated with check (public.is_team_member(auth.uid()));

-- person_events
drop policy if exists "events readable" on public.person_events;
drop policy if exists "events writable" on public.person_events;
create policy "events readable by team" on public.person_events for select to authenticated using (public.is_team_member(auth.uid()));
create policy "events writable by team" on public.person_events for insert to authenticated with check (public.is_team_member(auth.uid()));

-- polls
drop policy if exists "polls readable" on public.polls;
create policy "polls readable by team" on public.polls for select to authenticated using (public.is_team_member(auth.uid()));

-- poll_responses
drop policy if exists "responses readable" on public.poll_responses;
drop policy if exists "responses writable" on public.poll_responses;
create policy "responses readable by team" on public.poll_responses for select to authenticated using (public.is_team_member(auth.uid()));
create policy "responses writable by team" on public.poll_responses for insert to authenticated with check (public.is_team_member(auth.uid()));

-- messages
drop policy if exists "messages readable" on public.messages;
drop policy if exists "messages updatable" on public.messages;
drop policy if exists "messages writable" on public.messages;
create policy "messages readable by team" on public.messages for select to authenticated using (public.is_team_member(auth.uid()));
create policy "messages updatable by team" on public.messages for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "messages writable by team" on public.messages for insert to authenticated with check (public.is_team_member(auth.uid()));

-- conversations
drop policy if exists "convos readable" on public.conversations;
drop policy if exists "convos updatable" on public.conversations;
drop policy if exists "convos writable" on public.conversations;
create policy "convos readable by team" on public.conversations for select to authenticated using (public.is_team_member(auth.uid()));
create policy "convos updatable by team" on public.conversations for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "convos writable by team" on public.conversations for insert to authenticated with check (public.is_team_member(auth.uid()));

-- incidents
drop policy if exists "incidents readable" on public.incidents;
drop policy if exists "incidents updatable" on public.incidents;
drop policy if exists "incidents writable" on public.incidents;
create policy "incidents readable by team" on public.incidents for select to authenticated using (public.is_team_member(auth.uid()));
create policy "incidents updatable by team" on public.incidents for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "incidents writable by team" on public.incidents for insert to authenticated with check (public.is_team_member(auth.uid()));

-- polling_stations
drop policy if exists "stations readable" on public.polling_stations;
drop policy if exists "stations updatable by team" on public.polling_stations;
create policy "stations readable by team" on public.polling_stations for select to authenticated using (public.is_team_member(auth.uid()));
create policy "stations updatable by team" on public.polling_stations for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

-- contributions
drop policy if exists "contributions readable" on public.contributions;
create policy "contributions readable by team" on public.contributions for select to authenticated using (public.is_team_member(auth.uid()));

-- expenses
drop policy if exists "expenses readable" on public.expenses;
create policy "expenses readable by team" on public.expenses for select to authenticated using (public.is_team_member(auth.uid()));

-- profiles
drop policy if exists "profiles readable by team" on public.profiles;
create policy "profiles readable by team" on public.profiles for select to authenticated using (auth.uid() = user_id or public.is_team_member(auth.uid()));

-- user_roles
drop policy if exists "roles readable by team" on public.user_roles;
create policy "own roles readable" on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'::public.app_role));

-- demo_leads
drop policy if exists "Team can read demo leads" on public.demo_leads;
create policy "Staff can read demo leads" on public.demo_leads for select to authenticated using (public.is_staff(auth.uid()));
