-- Close the gaps between campaigns.
--
-- The multi-campaign migration made is_staff() and is_team_member() mean
-- "candidate or manager (team member) in any campaign", and scoped every
-- campaign table with an own-campaign policy. A few tables were left out, and
-- their policies still trusted those functions, so one campaign's team could
-- read or change what belongs to another campaign, or to Groundwork itself:
--
--   segments                 every campaign shared, and could edit, one list of voter groups
--   profiles                 every team read every user's name and email
--   demo_leads               every campaign's candidate and manager read Groundwork's sales leads
--   whatsapp_webhook_events  every campaign's candidate and manager read the raw WhatsApp inbox
--   listening_jobs           any campaign's staff could pause the listening sweep for all
--
-- Segments become a campaign table like the others (existing ones stay with
-- Sakaja, where every record made before campaigns lives). The rest become the
-- platform owner's: Groundwork's leads, the raw webhook log, the sweep's lease.

-- ---------------------------------------------------------------- segments --

alter table public.segments add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;
update public.segments set campaign_id = 'ca000000-0000-4000-8000-000000000002' where campaign_id is null;
alter table public.segments alter column campaign_id set not null;
alter table public.segments alter column campaign_id set default public.my_campaign();
create index if not exists segments_campaign_id_idx on public.segments (campaign_id);

alter table public.segments drop constraint if exists segments_slug_key;
alter table public.segments drop constraint if exists segments_campaign_slug_key;
alter table public.segments add constraint segments_campaign_slug_key unique (campaign_id, slug);

drop trigger if exists stamp_campaign on public.segments;
create trigger stamp_campaign before insert on public.segments
  for each row execute function public.stamp_campaign();

drop policy if exists "own campaign only" on public.segments;
create policy "own campaign only" on public.segments as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());

-- ---------------------------------------------------------------- profiles --

-- Your own, your campaign's admitted team, or everyone for the super admin.
drop policy if exists "profiles readable by team" on public.profiles;
drop policy if exists "profiles readable in campaign" on public.profiles;
drop policy if exists "profiles readable by teammates" on public.profiles;
create policy "profiles readable by teammates" on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or exists (
      select 1
        from public.campaign_members me
        join public.campaign_members them on them.campaign_id = me.campaign_id
       where me.user_id = auth.uid()
         and me.role <> 'pending'
         and them.user_id = profiles.user_id));

-- -------------------------------------------------------------- demo leads --

drop policy if exists "Staff can read demo leads" on public.demo_leads;
drop policy if exists "Admins and managers can update demo leads" on public.demo_leads;
drop policy if exists "Admins and managers can delete demo leads" on public.demo_leads;
drop policy if exists "Groundwork reads demo leads" on public.demo_leads;
drop policy if exists "Groundwork updates demo leads" on public.demo_leads;
drop policy if exists "Groundwork deletes demo leads" on public.demo_leads;
create policy "Groundwork reads demo leads" on public.demo_leads for select to authenticated
  using (public.is_super_admin(auth.uid()));
create policy "Groundwork updates demo leads" on public.demo_leads for update to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
create policy "Groundwork deletes demo leads" on public.demo_leads for delete to authenticated
  using (public.is_super_admin(auth.uid()));

-- ------------------------------------------------- whatsapp webhook events --

drop policy if exists "Staff read WhatsApp events" on public.whatsapp_webhook_events;
drop policy if exists "Groundwork reads WhatsApp events" on public.whatsapp_webhook_events;
create policy "Groundwork reads WhatsApp events" on public.whatsapp_webhook_events for select to authenticated
  using (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------- listening jobs --

-- Anyone on a team may see whether the sweep ran; only the owner changes it.
drop policy if exists "jobs managed by staff" on public.listening_jobs;
drop policy if exists "jobs managed by Groundwork" on public.listening_jobs;
create policy "jobs managed by Groundwork" on public.listening_jobs for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 13 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
