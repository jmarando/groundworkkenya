-- Shared test accounts, included by test files with \ir fixtures.sql.
--
-- The campaigns come from the multi-campaign migration: Kalonzo (president),
-- Sakaja (governor, owns the messaging channels and every record seeded before
-- campaigns existed) and Mathira (MP, six wards). Each account belongs to one
-- campaign, as in production.
--
--   a1  Sakaja candidate            e5  Mathira candidate
--   c3  Sakaja campaign manager     f6  Mathira field agent
--   b2  Sakaja field agent          99  super admin, looking at Sakaja
--   d4  signed up to Sakaja, not yet admitted

\set QUIET on
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'candidate.sakaja@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'agent.sakaja@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'manager.sakaja@example.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'stranger@example.test'),
  ('00000000-0000-0000-0000-0000000000e5', 'candidate.mathira@example.test'),
  ('00000000-0000-0000-0000-0000000000f6', 'agent.mathira@example.test'),
  ('00000000-0000-0000-0000-000000000099', 'owner@example.test');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'candidate'),
  ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'agent'),
  ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000c3', 'manager'),
  ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000d4', 'pending'),
  ('ca000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-0000000000e5', 'candidate'),
  ('ca000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-0000000000f6', 'agent');

insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-000000000099', 'admin');
insert into public.admin_focus (user_id, campaign_id)
values ('00000000-0000-0000-0000-000000000099', 'ca000000-0000-4000-8000-000000000002');

-- True when running _sql raises exactly _message.
create or replace function pg_temp.fails_with(_sql text, _message text)
returns boolean language plpgsql as $$
begin
  execute _sql;
  return false;
exception when others then
  if sqlerrm <> _message then
    raise notice 'expected "%", got "%"', _message, sqlerrm;
    return false;
  end if;
  return true;
end $$;
