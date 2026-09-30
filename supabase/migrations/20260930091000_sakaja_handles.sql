-- Sakaja's race: the candidates' public accounts. Schema version 19.
--
-- Each was confirmed on the candidate's own page on 30 September 2026 (see
-- docs/superpowers/plans/2026-09-30-listening-social.md, Task 7). Two X accounts
-- claim James Gakuya and neither is linked from an official page, so his X is
-- left for the team; no TikTok could be confirmed but Babu Owino's. Only empty
-- handles are filled, so a team's own edits stay.

update public.race_rivals r
   set x        = coalesce(r.x, v.x),
       facebook = coalesce(r.facebook, v.facebook),
       tiktok   = coalesce(r.tiktok, v.tiktok)
  from (values
    ('Johnson Sakaja', 'SakajaJohnson', 'sakaja', null::text),
    ('Babu Owino', 'HEBabuOwino', 'babuowinongili', 'he.babuowino'),
    ('Agnes Kagure', 'itsagneskagure', 'itsagneskagure', null),
    ('James Gakuya', null, 'hon.james.gakuya', null),
    ('Ronald Karauri', 'KarauriR', 'CaptainRonaldKarauri', null)
  ) as v(name, x, facebook, tiktok)
 where r.campaign_id = 'ca000000-0000-4000-8000-000000000002'
   and r.name = v.name;

-- News keeps coming from the web search: a keyword for each rival and for
-- Nairobi's issues. One is added only where the workspace has no keyword of
-- that name or starting with it, so "Water and sanitation" stands for "Water".
insert into public.listening_topics (campaign_id, label, query, kind)
select 'ca000000-0000-4000-8000-000000000002', v.label, v.query, v.kind
  from (values
    ('Babu Owino', 'Babu Owino Nairobi governor', 'rival'),
    ('Agnes Kagure', 'Agnes Kagure Nairobi governor', 'rival'),
    ('James Gakuya', 'James Gakuya Nairobi governor', 'rival'),
    ('Ronald Karauri', 'Ronald Karauri Nairobi governor', 'rival'),
    ('Floods', 'Nairobi floods', 'issue'),
    ('Garbage', 'Nairobi garbage collection', 'issue'),
    ('Drainage', 'Nairobi drainage', 'issue'),
    ('Water', 'Nairobi water shortage', 'issue'),
    ('Hawkers', 'Nairobi hawkers', 'issue'),
    ('Transport', 'Nairobi matatu transport', 'issue'),
    ('Revenue', 'Nairobi county revenue', 'issue')
  ) as v(label, query, kind)
 where exists (select 1 from public.campaigns where id = 'ca000000-0000-4000-8000-000000000002')
   and not exists (
     select 1 from public.listening_topics t
      where t.campaign_id = 'ca000000-0000-4000-8000-000000000002'
        and (lower(btrim(t.label)) = lower(v.label)
             or lower(btrim(t.label)) like lower(v.label) || ' %')
   );

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 19 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
