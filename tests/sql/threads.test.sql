-- Schema 44: a message to a person sits in their conversation in the campaign that sent it; two
-- campaigns can each hold a WhatsApp thread with the same person. Each test rolls back.

\ir fixtures.sql

-- test: schema 44 is in
do $$ begin assert public.groundwork_schema_version() >= 44; end $$;

-- test: a WhatsApp broadcast opens the person's conversation, and the next message joins it
begin;
insert into public.people (id, campaign_id, phone, full_name) values
  ('e4400000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', '+254700000441', 'Wanjiru');
insert into public.messages (campaign_id, person_id, phone, channel, direction, body, status, outbox_kind)
values ('ca000000-0000-4000-8000-000000000002', 'e4400000-0000-4000-8000-000000000001', '+254700000441', 'whatsapp', 'out', 'Rally on Saturday', 'sent', 'broadcast');
insert into public.messages (campaign_id, person_id, phone, channel, direction, body, status, outbox_kind)
values ('ca000000-0000-4000-8000-000000000002', 'e4400000-0000-4000-8000-000000000001', '+254700000441', 'whatsapp', 'out', 'See you there', 'sent', 'broadcast');
do $$ begin
  assert (select count(distinct conversation_id) from public.messages where person_id = 'e4400000-0000-4000-8000-000000000001') = 1;
  assert (select external_thread_id from public.conversations where person_id = 'e4400000-0000-4000-8000-000000000001') = 'whatsapp:254700000441';
  assert (select snippet from public.conversations where person_id = 'e4400000-0000-4000-8000-000000000001') = 'See you there';
end $$;
rollback;

-- test: two campaigns each keep their own WhatsApp thread with the same number
begin;
insert into public.people (id, campaign_id, phone) values
  ('e4400000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000002', '+254700000442'),
  ('e4400000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000003', '+254700000442');
insert into public.messages (campaign_id, person_id, phone, channel, direction, body, status) values
  ('ca000000-0000-4000-8000-000000000002', 'e4400000-0000-4000-8000-000000000002', '+254700000442', 'whatsapp', 'out', 'From Sakaja', 'sent'),
  ('ca000000-0000-4000-8000-000000000003', 'e4400000-0000-4000-8000-000000000003', '+254700000442', 'whatsapp', 'out', 'From Mathira', 'sent');
do $$ begin
  assert (select count(*) from public.conversations where external_thread_id = 'whatsapp:254700000442') = 2;
end $$;
rollback;

-- test: a sample contact gets no conversation
begin;
insert into public.people (id, campaign_id, phone, tags) values
  ('e4400000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000002', '+254700000443', '{sample}');
insert into public.messages (campaign_id, person_id, phone, channel, direction, body, status)
values ('ca000000-0000-4000-8000-000000000002', 'e4400000-0000-4000-8000-000000000004', '+254700000443', 'sms', 'out', 'x', 'sent');
do $$ begin
  assert (select conversation_id from public.messages where person_id = 'e4400000-0000-4000-8000-000000000004') is null;
end $$;
rollback;
