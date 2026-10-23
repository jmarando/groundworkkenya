-- Schema 44: every message to a person sits in their conversation, in the campaign that sent it.
--
-- 1. A WhatsApp or social thread is unique within a campaign, not across campaigns: every campaign
--    writes from the same WhatsApp number, so two campaigns can each hold a thread with the same
--    person (their replies are filed under the campaign that wrote last; whatsapp.server.ts).
-- 2. conversation_for(campaign, person, channel) finds or opens the person's WhatsApp or SMS
--    conversation in that campaign.
-- 3. An outgoing WhatsApp or SMS with a person but no conversation (a broadcast, a poll invitation,
--    an auto-reply) is put in it as it is recorded, so the Inbox shows what was sent and the
--    reply lands under it. Sample contacts are left alone.
-- 4. The last 30 days of such messages are put in their conversations.

-- 1. -----------------------------------------------------------------
drop index if exists public.conversations_thread_uniq;
create unique index if not exists conversations_thread_uniq
  on public.conversations (campaign_id, platform, external_thread_id)
  where external_thread_id is not null;

-- 2. -----------------------------------------------------------------
create or replace function public.conversation_for(_campaign uuid, _person uuid, _channel text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id     uuid;
  _phone  text;
  _name   text;
  _thread text;
begin
  if _campaign is null or _person is null or _channel not in ('whatsapp', 'sms') then
    return null;
  end if;
  select phone, full_name into _phone, _name
    from public.people where id = _person and campaign_id = _campaign;
  if _phone is null then
    return null;
  end if;
  if _channel = 'whatsapp' then
    _thread := 'whatsapp:' || regexp_replace(_phone, '\D', '', 'g');
    select id into _id from public.conversations
     where campaign_id = _campaign and platform = 'whatsapp' and external_thread_id = _thread;
  else
    select id into _id from public.conversations
     where campaign_id = _campaign and person_id = _person and channel = 'sms'
     order by (status = 'open') desc, last_message_at desc nulls last
     limit 1;
  end if;
  if _id is null then
    insert into public.conversations
      (campaign_id, person_id, channel, platform, external_thread_id, author_handle, author_name,
       subject, status, unread, last_message_at)
    values
      (_campaign, _person, _channel, _channel, _thread, _phone, _name,
       case _channel when 'whatsapp' then 'WhatsApp' else 'SMS' end, 'open', false, now())
    on conflict do nothing
    returning id into _id;
    if _id is null and _thread is not null then
      select id into _id from public.conversations
       where campaign_id = _campaign and platform = 'whatsapp' and external_thread_id = _thread;
    end if;
  end if;
  return _id;
end $$;

revoke all on function public.conversation_for(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.conversation_for(uuid, uuid, text) to service_role;

-- 3. -----------------------------------------------------------------
create or replace function public.message_into_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid;
  _sample   boolean;
begin
  if new.direction <> 'out' or new.conversation_id is not null or new.person_id is null
     or new.channel not in ('whatsapp', 'sms') then
    return new;
  end if;
  select campaign_id, 'sample' = any(tags) into _campaign, _sample
    from public.people where id = new.person_id;
  if _sample then
    return new;
  end if;
  new.conversation_id := public.conversation_for(coalesce(new.campaign_id, _campaign), new.person_id, new.channel);
  if new.conversation_id is not null then
    update public.conversations
       set last_message_at = greatest(coalesce(last_message_at, new.created_at), coalesce(new.created_at, now())),
           snippet = left(new.body, 280)
     where id = new.conversation_id;
  end if;
  return new;
end $$;

revoke all on function public.message_into_conversation() from public, anon, authenticated;

drop trigger if exists messages_into_conversation on public.messages;
create trigger messages_into_conversation
  before insert on public.messages
  for each row execute function public.message_into_conversation();

-- 4. -----------------------------------------------------------------
do $$
declare
  m record;
  c uuid;
begin
  for m in
    select msg.id, msg.campaign_id, msg.person_id, msg.channel, msg.body, msg.created_at
      from public.messages msg
      join public.people p on p.id = msg.person_id
     where msg.direction = 'out'
       and msg.conversation_id is null
       and msg.channel in ('whatsapp', 'sms')
       and msg.created_at > now() - interval '30 days'
       and not ('sample' = any(p.tags))
     order by msg.created_at
  loop
    c := public.conversation_for(m.campaign_id, m.person_id, m.channel);
    if c is not null then
      update public.messages set conversation_id = c where id = m.id;
      update public.conversations
         set last_message_at = greatest(coalesce(last_message_at, m.created_at), m.created_at),
             snippet = left(m.body, 280)
       where id = c;
    end if;
  end loop;
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 44 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
