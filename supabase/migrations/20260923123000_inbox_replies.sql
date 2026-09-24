-- Inbox replies by SMS go through the outbox as their own kind.
--
-- An automatic 'reply' always gets through — confirming someone's STOP is the
-- one message they must still receive. A person answering from the Inbox is
-- different: it is fine without marketing consent (they wrote to us first),
-- but once someone has said STOP, nobody on the campaign texts them again.

create or replace function public.outbox_block_reason(
  _channel          text,
  _kind             text,
  _opted_out        boolean,
  _consent_sms      boolean,
  _consent_whatsapp boolean
)
returns text
language sql
immutable
as $$
  select case
    -- A request to confirm consent is the one unsolicited message allowed,
    -- and never to someone who has already said STOP.
    when _kind = 'consent_check' then
      case when coalesce(_opted_out, false) then 'Opted out: consent requests are not sent.' end
    -- A person answering from the Inbox: no consent needed to answer
    -- someone who wrote in, but STOP means STOP.
    when _kind = 'inbox_reply' then
      case when _opted_out is null then 'No person on record for this message.'
           when _opted_out then 'Opted out: they replied STOP.'
      end
    -- An automatic answer to someone who just messaged in, including
    -- confirming their opt-out, is transactional.
    when _kind in ('reply', 'poll_thanks') then null
    -- A reward is owed for an answer already given; opting out afterwards
    -- does not cancel it.
    when _channel in ('airtime', 'mpesa') then null
    -- The person record is gone (deleted, or erased on request): send nothing.
    when _opted_out is null then 'No person on record for this message.'
    when _opted_out then 'Opted out before this message was sent.'
    when _channel = 'sms' and not coalesce(_consent_sms, false) then 'No SMS consent on record.'
    when _channel = 'wa' and not coalesce(_consent_whatsapp, false) then 'No WhatsApp consent on record.'
  end
$$;

revoke all on function public.outbox_block_reason(text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.outbox_block_reason(text, text, boolean, boolean, boolean) to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 4 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
