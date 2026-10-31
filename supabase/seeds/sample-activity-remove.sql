-- Removes the sample activity scripts/demo/sample-activity.ts wrote for Githunguri, Kuria East,
-- Roysambu and Athwana: every row it writes carries a mark this finds (the tag "sample", a SAMPLE- reference
-- or code, a "(sample)" diary note, incident, pollster, walk list or ad buy (with its expense), a sample-msg- message, the
-- "<ward> town centre/market road/feeder roads" canvass streets, or a door visit's client id
-- from md5('sample-visit:…')).
-- Nothing else is touched; the segments it added stay. Not a migration: run it by hand.

begin;

create temporary table sample_campaigns on commit drop as
  select id, slug from public.campaigns where slug in ('githunguri', 'kuria-east', 'roysambu', 'athwana');

delete from public.poll_responses r
 using public.polls p, sample_campaigns c
 where r.poll_id = p.id and p.campaign_id = c.id and p.code like 'SAMPLE-%';
delete from public.polls p using sample_campaigns c
 where p.campaign_id = c.id and p.code like 'SAMPLE-%';
delete from public.messages m using sample_campaigns c
 where m.campaign_id = c.id and m.external_id like 'sample-msg-%';
delete from public.conversations x using sample_campaigns c
 where x.campaign_id = c.id and 'sample' = any(x.tags);
delete from public.incidents x using sample_campaigns c
 where x.campaign_id = c.id and x.title like '%(sample)';
delete from public.canvass_streets x using sample_campaigns c, public.wards w
 where x.campaign_id = c.id and w.id = x.ward_id
   and x.name in (w.name || ' town centre', w.name || ' market road', w.name || ' feeder roads');
delete from public.race_polls x using sample_campaigns c
 where x.campaign_id = c.id and x.pollster like '%(sample)';
delete from public.walk_lists x using sample_campaigns c
 where x.campaign_id = c.id and x.name like '%(sample)';
-- Sakaja's sample walk lists (given to the test agent), with their doors.
delete from public.walk_lists x using public.campaigns c
 where x.campaign_id = c.id and c.slug = 'sakaja' and x.name like '%(sample)';
delete from public.media_buys x using sample_campaigns c
 where x.campaign_id = c.id and x.name like '%(sample)';
delete from public.expenses x using sample_campaigns c
 where x.campaign_id = c.id and x.category = 'ads' and x.description like 'Ad buy:%(sample)';
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
