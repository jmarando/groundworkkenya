create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  attempts integer not null default 0
);
grant select on public.whatsapp_webhook_events to authenticated;
grant all on public.whatsapp_webhook_events to service_role;
alter table public.whatsapp_webhook_events enable row level security;
create policy "Staff read WhatsApp events" on public.whatsapp_webhook_events
  for select to authenticated using (public.is_staff(auth.uid()));
create index whatsapp_events_pending on public.whatsapp_webhook_events (received_at) where processed_at is null;
create index if not exists messages_external_id on public.messages (external_id) where external_id is not null;
alter table public.messages add column if not exists delivered_at timestamptz, add column if not exists read_at timestamptz;
insert into public.social_accounts (platform, handle, status, live)
select 'whatsapp', '+254 182 668723', 'live', true
where not exists (select 1 from public.social_accounts where platform = 'whatsapp');
update public.social_accounts set handle = '+254 182 668723', status = 'live', live = true where platform = 'whatsapp';