alter table public.people add column if not exists email text;
create unique index if not exists people_campaign_email_uq on public.people (campaign_id, lower(email)) where email is not null;

create table public.campaign_channels (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('whatsapp','sms','email','facebook','instagram','x')),
  identifier text,
  display text,
  status text not null default 'not_started' check (status in ('not_started','pending','live')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, kind)
);
create unique index campaign_channels_ident_uq on public.campaign_channels (kind, lower(identifier)) where identifier is not null;
grant select, insert, update, delete on public.campaign_channels to authenticated;
grant all on public.campaign_channels to service_role;
alter table public.campaign_channels enable row level security;
create policy "channels readable in campaign" on public.campaign_channels for select to authenticated
  using (public.is_super_admin(auth.uid()) or campaign_id = public.my_campaign());
create policy "channels managed by admitters" on public.campaign_channels for all to authenticated
  using (public.can_admit(auth.uid(), campaign_id)) with check (public.can_admit(auth.uid(), campaign_id));
create trigger campaign_channels_touch before update on public.campaign_channels
  for each row execute function public.touch_updated_at();

create or replace function public.campaign_for_channel(_kind text, _identifier text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select campaign_id from public.campaign_channels
      where kind = _kind and lower(identifier) = lower(_identifier) limit 1),
    public.channel_campaign())
$$;
revoke execute on function public.campaign_for_channel(text, text) from public, anon, authenticated;
grant execute on function public.campaign_for_channel(text, text) to service_role;

insert into public.campaign_channels (campaign_id, kind, identifier, display, status)
select c.id, 'email', c.slug, c.name, 'pending' from public.campaigns c
on conflict do nothing;
insert into public.campaign_channels (campaign_id, kind, identifier, display, status, note) values
 ('ca000000-0000-4000-8000-000000000002','whatsapp','+254182668723','+254 182 668723','live','Connected via the WhatsApp connector.')
on conflict do nothing;