-- Githunguri: Charles Thiong'o, Kiambu County Assembly Speaker, as a rival in the race, a Listening
-- keyword, and a section and a watch item in the 21 October brief. Sources linked in the brief.
begin;
insert into public.race_rivals (campaign_id, name, party, office, is_us, tone, sort, search_as)
select 'ca000000-0000-4000-8000-000000000004', 'Charles Thiong''o', null,
  'Kiambu Assembly Speaker since 2022; lost the 2022 UDA ticket to Wamuchomba',
  false, 'c', 3, 'Charles Thiong''o'
where not exists (select 1 from public.race_rivals where campaign_id = 'ca000000-0000-4000-8000-000000000004' and name = 'Charles Thiong''o');

insert into public.listening_topics (campaign_id, label, query, kind, active)
select 'ca000000-0000-4000-8000-000000000004', 'Charles Thiong''o', '"Charles Thiong''o" OR "Speaker Thiong''o" Githunguri OR Kiambu', 'rival', true
where not exists (select 1 from public.listening_topics where campaign_id = 'ca000000-0000-4000-8000-000000000004' and label = 'Charles Thiong''o');

update public.campaign_briefs
   set the_read = the_read || jsonb_build_array(jsonb_build_object(
         'title', 'Thiong''o: the Speaker who topped the only poll',
         'stance', 'threat',
         'body', 'Charles Thiong''o, a lawyer, has been Speaker of the Kiambu County Assembly since September 2022. He sought the 2022 UDA ticket for Githunguri and lost it to Wamuchomba, so this is a rematch, and he has had four years of a county platform since. Politrack''s February poll (method unpublished) had him first at 30%, ahead of Kago and the MP. He has been meeting Githunguri''s elders about the seat''s future, which is how a run starts here. His party for 2027 is not on record: he was UDA in 2022 and has not been reported joining DCP.' || E'\n' ||
                 'He is the rival who can claim both the county''s record and a grievance against the MP. Don''t attack the Speaker; out-deliver him on the farm gate, and watch which ticket he takes: on DCP he becomes the front-runner, on UDA he splits the vote the MP needs to keep.',
         'sources', jsonb_build_array(
           jsonb_build_object('label', 'Daily Express: Githunguri MP opinion poll 2026', 'url', 'https://dailyexpress.co.ke/githunguri-mp-opinion-poll-2026/', 'date', '2026-02-15'),
           jsonb_build_object('label', 'The Star: lawyer Charles Thiong''o elected Kiambu Assembly Speaker', 'url', 'https://www.the-star.co.ke/counties/central/2022-09-21-lawyer-charles-thiongo-elected-kiambu-assembly-speaker', 'date', '2022-09-21'),
           jsonb_build_object('label', 'Kiambu Observer: elders open talks on Githunguri''s political future', 'url', 'https://kiambuobserver.co.ke/kiama-kia-ma-elders-open-talks-on-githunguri-political-future/', 'date', null)))),
       watch = watch || jsonb_build_array(jsonb_build_object(
         'title', 'Which ticket Thiong''o takes',
         'body', 'DCP makes him the favourite; UDA splits the vote against Kago. Listening now follows him as a rival; a declaration or a DCP meeting in the county is the signal.',
         'sources', '[]'::jsonb))
 where campaign_id = 'ca000000-0000-4000-8000-000000000004'
   and starts_on = '2026-10-21'
   and not (the_read::text like '%Speaker who topped%');
commit;
