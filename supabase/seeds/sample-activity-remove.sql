-- Removes the sample activity scripts/demo/sample-activity.ts wrote for Githunguri, Roysambu and
-- Athwana: every row it writes carries a mark this finds (the tag "sample", a SAMPLE- reference
-- or code, a "(sample)" diary note, or a door visit's client id from md5('sample-visit:…')).
-- Nothing else is touched; the segments it added stay. Not a migration: run it by hand.

begin;

create temporary table sample_campaigns on commit drop as
  select id, slug from public.campaigns where slug in ('githunguri', 'roysambu', 'athwana');

delete from public.poll_responses r
 using public.polls p, sample_campaigns c
 where r.poll_id = p.id and p.campaign_id = c.id and p.code like 'SAMPLE-%';
delete from public.polls p using sample_campaigns c
 where p.campaign_id = c.id and p.code like 'SAMPLE-%';
delete from public.conversations x using sample_campaigns c
 where x.campaign_id = c.id and 'sample' = any(x.tags);
delete from public.person_events e using public.people p, sample_campaigns c
 where e.person_id = p.id and p.campaign_id = c.id and 'sample' = any(p.tags);
delete from public.house_visits v using sample_campaigns c
 where v.campaign_id = c.id and v.client_id = md5('sample-visit:' || md5(c.slug || ':' || v.pc))::uuid;
delete from public.people p using sample_campaigns c
 where p.campaign_id = c.id and 'sample' = any(p.tags);
delete from public.diary_entries d using sample_campaigns c
 where d.campaign_id = c.id and d.note like '%(sample)';
delete from public.expenses x using sample_campaigns c
 where x.campaign_id = c.id and x.reference like 'SAMPLE-%';
delete from public.contributions x using sample_campaigns c
 where x.campaign_id = c.id and x.reference like 'SAMPLE-%';

commit;
