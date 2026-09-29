-- Campaign websites, part 1. Schema version 14.
--
-- Each campaign has one site: a draft its team edits and the published copy
-- the public sees at groundwork.ke/s/<slug>. The content is one JSON document,
-- cleaned by the server before it is saved and again before it is shown.
--
-- The team reads its site. Only the candidate or campaign manager changes it,
-- and only through the functions below: so every publish is kept as a
-- version, and someone editing an older copy cannot overwrite a newer one.
-- The public page reads `published` with the service role; drafts never
-- leave the console.

create table public.campaign_sites (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null unique default public.my_campaign()
               references public.campaigns(id) on delete cascade,
  draft        jsonb not null default '{}'::jsonb,
  draft_rev    integer not null default 0,
  published    jsonb,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.site_versions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign()
               references public.campaigns(id) on delete cascade,
  content      jsonb not null,
  published_at timestamptz not null default clock_timestamp(),
  published_by uuid references auth.users(id) on delete set null
);
create index site_versions_campaign_idx on public.site_versions (campaign_id, published_at desc);

alter table public.campaign_sites enable row level security;
alter table public.site_versions enable row level security;

revoke all on public.campaign_sites, public.site_versions from anon, authenticated;
grant select on public.campaign_sites, public.site_versions to authenticated;
grant all on public.campaign_sites, public.site_versions to service_role;

create policy "own campaign only" on public.campaign_sites as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "site readable by team" on public.campaign_sites for select to authenticated
  using (public.is_team_member(auth.uid()));

create policy "own campaign only" on public.site_versions as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "versions readable by team" on public.site_versions for select to authenticated
  using (public.is_team_member(auth.uid()));

-- The campaign the caller may change the site of, or an error.
create or replace function public.site_editor()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.my_campaign();
begin
  if _campaign is null or not public.is_staff(auth.uid()) then
    raise exception 'Only the candidate or campaign manager can change the website.'
      using errcode = '42501';
  end if;
  return _campaign;
end $$;

-- Save the draft if nobody has saved since _rev; returns the new revision.
create or replace function public.save_site_draft(_draft jsonb, _rev integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.site_editor();
  _new integer;
begin
  if jsonb_typeof(_draft) is distinct from 'object' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;
  if octet_length(_draft::text) > 262144 then
    raise exception 'The website is too big to save.' using errcode = '22023';
  end if;
  insert into public.campaign_sites as s (campaign_id, draft, draft_rev, updated_at, updated_by)
  values (_campaign, _draft, 1, now(), auth.uid())
  on conflict (campaign_id) do update
     set draft      = excluded.draft,
         draft_rev  = s.draft_rev + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where s.draft_rev = _rev
  returning s.draft_rev into _new;
  if _new is null then
    raise exception 'Someone else changed the website while you were editing. Reload to see their changes.'
      using errcode = '40001';
  end if;
  return _new;
end $$;

-- Publish the draft as it stands, keep it as a version, keep the newest 20.
create or replace function public.publish_site()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.site_editor();
  _at timestamptz := clock_timestamp();
  _content jsonb;
begin
  update public.campaign_sites
     set published = draft, published_at = _at, published_by = auth.uid()
   where campaign_id = _campaign and draft <> '{}'::jsonb
  returning published into _content;
  if _content is null then
    raise exception 'Write something on the website before publishing it.';
  end if;
  insert into public.site_versions (campaign_id, content, published_at, published_by)
  values (_campaign, _content, _at, auth.uid());
  delete from public.site_versions
   where campaign_id = _campaign
     and id not in (select id from public.site_versions
                     where campaign_id = _campaign
                     order by published_at desc
                     limit 20);
  return _at;
end $$;

-- Take the site offline. The draft and the history stay.
create or replace function public.unpublish_site()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.site_editor();
begin
  update public.campaign_sites set published = null where campaign_id = _campaign;
end $$;

-- Put a published version back in the draft; returns the new revision.
create or replace function public.restore_site_version(_version uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.site_editor();
  _content jsonb;
  _new integer;
begin
  select content into _content
    from public.site_versions
   where id = _version and campaign_id = _campaign;
  if _content is null then
    raise exception 'That version is not available.';
  end if;
  update public.campaign_sites
     set draft = _content, draft_rev = draft_rev + 1, updated_at = now(), updated_by = auth.uid()
   where campaign_id = _campaign
  returning draft_rev into _new;
  return _new;
end $$;

revoke all on function public.site_editor() from public, anon, authenticated;
revoke all on function public.save_site_draft(jsonb, integer), public.publish_site(),
  public.unpublish_site(), public.restore_site_version(uuid) from public, anon;
grant execute on function public.save_site_draft(jsonb, integer), public.publish_site(),
  public.unpublish_site(), public.restore_site_version(uuid) to authenticated, service_role;

-- Photos for the sites: public to read, like the pages they appear on. The
-- server adds them with the service role, after checking the caller is the
-- campaign's candidate or manager, into a folder named for the campaign
-- (uploadSitePhoto in src/lib/site.functions.ts). No browser writes to the
-- bucket, so storage.objects needs no policies of ours.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 2097152, array['image/jpeg'])
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Every campaign texts from the same number. A reply belongs to the campaign
-- that texted that number last, and STOP applies to every campaign: finding
-- both by phone needs these.
create index if not exists messages_phone_out_idx
  on public.messages (phone, created_at desc) where direction = 'out';
create index if not exists people_phone_idx on public.people (phone);

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 14 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
