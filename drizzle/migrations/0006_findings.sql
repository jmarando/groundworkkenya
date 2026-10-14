-- The findings engine's counts. Schema version 25.
--
-- Counts per ward and per week for the findings (insights, part 2): issues
-- raised at the door, in messages and in the news; issues and rival mentions
-- week by week; stipend spend and consenting supporters by ward. Each runs as
-- the person asking (security invoker), so the "own campaign only" policies
-- keep every count inside their campaign, and returns nothing to a field
-- agent. Counts only: never a name, a phone number or a person.

-- Issues raised in each ward in the last _days days, by where they were
-- raised, each source read as Home's top of mind reads it: a conversation at
-- the door (the issue is the event's detail), a conversation in messages (the
-- ward is the person's), and a news or social mention tagged with the ward by
-- name (rivals' own posts aside).
create or replace function public.ward_issues(_days integer default 30)
returns table (ward_id uuid, source text, issue text, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  select x.ward_id, x.source, x.issue, count(*)::integer
    from (
      select p.ward_id, 'door'::text as source, e.detail as issue
        from public.person_events e
        join public.people p on p.id = e.person_id
       where e.kind = 'door_spoke'
         and e.detail is not null
         and e.created_at > now() - make_interval(days => _days)
      union all
      select p.ward_id, 'messages', c.issue
        from public.conversations c
        join public.people p on p.id = c.person_id
       where c.issue is not null
         and c.last_message_at > now() - make_interval(days => _days)
      union all
      select w.id, 'news', m.issue
        from public.listening_mentions m
        join public.wards w on w.campaign_id = m.campaign_id
                            and lower(btrim(w.name)) = lower(btrim(m.ward))
       where m.rival_id is null
         and m.issue is not null
         and m.found_at > now() - make_interval(days => _days)
    ) x
   where x.ward_id is not null
     and (select public.my_campaign_role()) is distinct from 'agent'
   group by x.ward_id, x.source, x.issue
$$;

-- Issues raised across the campaign, week by week: week 0 is the last 7 days,
-- week 1 the 7 before, back _weeks weeks. The same three sources.
create or replace function public.issue_weeks(_weeks integer default 5)
returns table (week integer, source text, issue text, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  select floor(extract(epoch from now() - x.at) / 604800)::integer, x.source, x.issue, count(*)::integer
    from (
      select 'door'::text as source, e.detail as issue, e.created_at as at
        from public.person_events e
       where e.kind = 'door_spoke'
         and e.detail is not null
         and e.created_at > now() - make_interval(days => 7 * _weeks)
      union all
      select 'messages', c.issue, c.last_message_at
        from public.conversations c
       where c.issue is not null
         and c.last_message_at > now() - make_interval(days => 7 * _weeks)
      union all
      select 'news', m.issue, m.found_at
        from public.listening_mentions m
       where m.rival_id is null
         and m.issue is not null
         and m.found_at > now() - make_interval(days => 7 * _weeks)
    ) x
   where (select public.my_campaign_role()) is distinct from 'agent'
   group by 1, 2, 3
$$;

-- News and social mentions week by week: a row per rival, for the mentions
-- found by the team's keyword for them (a listening topic of kind 'rival'
-- labelled with their name or the name they're searched by), and a row with
-- no rival for every mention. Rivals' own posts aren't news about them.
create or replace function public.rival_mention_weeks(_weeks integer default 5)
returns table (week integer, rival_id uuid, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  with news as (
    select floor(extract(epoch from now() - m.found_at) / 604800)::integer as week,
           m.campaign_id, t.kind as topic_kind, t.label as topic_label
      from public.listening_mentions m
      left join public.listening_topics t on t.id = m.topic_id
     where m.rival_id is null
       and m.found_at > now() - make_interval(days => 7 * _weeks)
       and (select public.my_campaign_role()) is distinct from 'agent'
  )
  select n.week, r.id, count(*)::integer
    from news n
    join public.race_rivals r
      on r.campaign_id = n.campaign_id
     and not r.is_us
     and n.topic_kind = 'rival'
     and lower(btrim(n.topic_label)) in (lower(btrim(r.name)), lower(btrim(coalesce(r.search_as, r.name))))
   group by n.week, r.id
   union all
  select n.week, null::uuid, count(*)::integer
    from news n
   group by n.week
$$;

-- Stipends by ward over the last _days days: owed, approved or paid, dated
-- by payment, else by when they were entered.
create or replace function public.ward_spend(_days integer default 30)
returns table (ward_id uuid, kes numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select s.ward_id, sum(s.amount_kes)
    from public.agent_stipends s
   where s.ward_id is not null
     and s.status in ('pending', 'approved', 'paid')
     and coalesce(s.paid_at, s.created_at) > now() - make_interval(days => _days)
     and (select public.my_campaign_role()) is distinct from 'agent'
   group by s.ward_id
$$;

-- Supporters by ward as the Overview counts them: real people (not samples),
-- not opted out, who agreed to SMS.
create or replace function public.ward_supporters()
returns table (ward_id uuid, supporters integer)
language sql
stable
security invoker
set search_path = public
as $$
  select p.ward_id, count(*)::integer
    from public.people p
   where p.ward_id is not null
     and not p.opted_out
     and p.consent_sms
     and not ('sample' = any(p.tags))
     and (select public.my_campaign_role()) is distinct from 'agent'
    group by p.ward_id
$$;

revoke all on function public.ward_issues(integer) from public, anon;
grant execute on function public.ward_issues(integer) to authenticated;
revoke all on function public.issue_weeks(integer) from public, anon;
grant execute on function public.issue_weeks(integer) to authenticated;
revoke all on function public.rival_mention_weeks(integer) from public, anon;
grant execute on function public.rival_mention_weeks(integer) to authenticated;
revoke all on function public.ward_spend(integer) from public, anon;
grant execute on function public.ward_spend(integer) to authenticated;
revoke all on function public.ward_supporters() from public, anon;
grant execute on function public.ward_supporters() to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 25 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;