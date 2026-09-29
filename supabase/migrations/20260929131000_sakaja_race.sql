-- Sakaja's race, from published sources. Schema version 17.
--
-- The candidates Citizen named on 25 September 2026 and the four published
-- polls of the Nairobi governor race, each with the link it was read at.
-- Added only to Sakaja's workspace, and only while it has no race data, so
-- running this again, or after the team has edited the race, changes nothing.
-- Social handles are added with the social sweep, once confirmed on each page.

do $$
declare
  _c constant uuid := 'ca000000-0000-4000-8000-000000000002';
  _sakaja  uuid;
  _babu    uuid;
  _kagure  uuid;
  _gakuya  uuid;
  _karauri uuid;
begin
  if not exists (select 1 from public.campaigns where id = _c)
     or exists (select 1 from public.race_rivals where campaign_id = _c)
     or exists (select 1 from public.race_polls where campaign_id = _c) then
    return;
  end if;

  insert into public.race_rivals (campaign_id, name, party, office, is_us, tone, sort)
  values (_c, 'Johnson Sakaja', 'UDA', 'Governor of Nairobi', true, 'us', 0) returning id into _sakaja;
  insert into public.race_rivals (campaign_id, name, party, office, is_us, tone, sort)
  values (_c, 'Babu Owino', 'The Mwananchi Party', 'Embakasi East MP', false, 'a', 1) returning id into _babu;
  insert into public.race_rivals (campaign_id, name, party, office, is_us, tone, sort)
  values (_c, 'Agnes Kagure', 'Kenya Patriots Party', null, false, 'b', 2) returning id into _kagure;
  insert into public.race_rivals (campaign_id, name, party, office, is_us, tone, sort)
  values (_c, 'James Gakuya', 'DCP', 'Embakasi North MP', false, 'c', 3) returning id into _gakuya;
  insert into public.race_rivals (campaign_id, name, party, office, is_us, tone, sort)
  values (_c, 'Ronald Karauri', null, 'Kasarani MP', false, 'd', 4) returning id into _karauri;

  insert into public.race_polls
    (campaign_id, pollster, fieldwork_from, fieldwork_to, published_on, sample_size, margin,
     source_url, shares, undecided, approval, disapproval)
  values
    (_c, 'ISS Africa', null, null, '2025-09-17', 1063, null,
     'https://www.kenyans.co.ke/news/116303-babu-owino-leads-sakajas-popularity-plummets-ahead-nairobi-2027-governor-race-new-poll',
     jsonb_build_array(
       jsonb_build_object('name', 'Babu Owino', 'share', 28.1, 'rival_id', _babu),
       jsonb_build_object('name', 'Irungu Nyakera', 'share', 19.2),
       jsonb_build_object('name', 'Johnson Sakaja', 'share', 16.4, 'rival_id', _sakaja),
       jsonb_build_object('name', 'James Gakuya', 'share', 11.2, 'rival_id', _gakuya)),
     null, null, null),
    (_c, 'Centre for African Progress', '2026-04-14', '2026-04-19', '2026-04-21', 6000, 1.94,
     'https://citizen.digital/article/nairobi-governor-race-babu-owino-leads-agnes-kagure-follows-as-sakaja-trails-in-new-poll-n381233',
     jsonb_build_array(
       jsonb_build_object('name', 'Babu Owino', 'share', 37, 'rival_id', _babu),
       jsonb_build_object('name', 'Agnes Kagure', 'share', 34, 'rival_id', _kagure),
       jsonb_build_object('name', 'Johnson Sakaja', 'share', 10, 'rival_id', _sakaja),
       jsonb_build_object('name', 'James Gakuya', 'share', 7, 'rival_id', _gakuya),
       jsonb_build_object('name', 'Irungu Nyakera', 'share', 1),
       jsonb_build_object('name', 'Ronald Karauri', 'share', 1, 'rival_id', _karauri)),
     9, 10, 80),
    (_c, 'Mizani Africa', null, null, '2026-07-01', null, null,
     'https://streamlinefeed.co.ke/news/babu-owino-and-agnes-kagure-overtake-sakaja-in-latest-nairobi-gubernatorial-poll',
     jsonb_build_array(
       jsonb_build_object('name', 'Babu Owino', 'share', 27.1, 'rival_id', _babu),
       jsonb_build_object('name', 'Agnes Kagure', 'share', 23.7, 'rival_id', _kagure),
       jsonb_build_object('name', 'Johnson Sakaja', 'share', 19.9, 'rival_id', _sakaja),
       jsonb_build_object('name', 'James Gakuya', 'share', 11.2, 'rival_id', _gakuya),
       jsonb_build_object('name', 'Dennis Waweru', 'share', 1.5),
       jsonb_build_object('name', 'George Aladwa', 'share', 1.4)),
     13.3, null, null),
    (_c, 'Mizani Africa', '2026-08-21', '2026-08-28', '2026-09-10', 1820, 2.3,
     'https://nairobinews.co.ke/babu-owino-takes-early-lead-in-nairobi-2027-governor-race-as-new-poll-puts-him-ahead-of-sakaja/',
     jsonb_build_array(
       jsonb_build_object('name', 'Babu Owino', 'share', 28.4, 'rival_id', _babu),
       jsonb_build_object('name', 'Agnes Kagure', 'share', 27.2, 'rival_id', _kagure),
       jsonb_build_object('name', 'Johnson Sakaja', 'share', 17.0, 'rival_id', _sakaja),
       jsonb_build_object('name', 'James Gakuya', 'share', 15.0, 'rival_id', _gakuya)),
     8.1, null, null);
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 17 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
