-- Sakaja's diary for the week of Monday 5 October 2026: a believable week of
-- ward visits, markets, meetings, media, rallies and watch items, so the
-- diary and Home's "Where to be" read like a campaign that is actually moving.
-- The 08:00 Kayole entry already existed; everything below is new.

insert into public.diary_entries (campaign_id, day, starts_at, title, kind, note, ward_id) values
  -- Monday 5 Oct (today): the Kayole water stage entry already exists.
  ('ca000000-0000-4000-8000-000000000002', '2026-10-05', '11:30', 'Komarock estate walk', 'visit',
   'Door to door with the Komarock team. Drainage and the estate roads come up at every third door.', '76d28cbf-406b-4295-8d83-44d7a4e6b56a'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-05', '16:00', 'Boda sacco leaders, Kilimani', 'meeting',
   'Riders from Kilimani and Kileleshwa saccos. Bike financing, fuel costs and harassment at the stages.', '993480b8-1d36-4791-83c8-aad0c093d84c'),

  -- Tuesday 6 Oct
  ('ca000000-0000-4000-8000-000000000002', '2026-10-06', '09:00', 'Milele FM morning show', 'media',
   'Phone-in on county markets and mama mboga stall fees. Keep to three points: fees, storage, night lighting.', null),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-06', '14:00', 'Kawangware market walk', 'market',
   'With the traders'' chair. Cold storage and the dark car park are their two asks; agents log contacts.', '173988d6-ce51-4953-a47b-473bfd7d530e'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-06', '18:30', 'Weekly numbers review', 'meeting',
   'Doors, inbox replies, stipend gaps and the listening board. Managers bring the week''s three problems.', null),

  -- Wednesday 7 Oct
  ('ca000000-0000-4000-8000-000000000002', '2026-10-07', '10:00', 'Dandora waste edge visit', 'visit',
   'Recycling groups at the dumpsite boundary. Rubbish collection is the promise people test us on here.', '556d5e27-fbbb-4359-adc7-9115aa14e84e'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-07', '15:00', 'Embakasi ward organisers', 'meeting',
   'Ward organisers and chief agents. Confirm polling station coverage before the weekend push.', '67c2d221-ef0a-457c-a6e9-c6695636a89f'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-07', '20:00', 'Rival caravan in Kawangware', 'watch',
   'Their convoy is expected mid-afternoon. Keep two agents on the ground and log the turnout.', '173988d6-ce51-4953-a47b-473bfd7d530e'),

  -- Thursday 8 Oct
  ('ca000000-0000-4000-8000-000000000002', '2026-10-08', '09:30', 'Kwa Reuben market', 'market',
   'Trader dues and the market shades project. Ask about the county levies by name.', '17b3fd53-43a1-463a-9b96-5fe107bf2d20'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-08', '13:00', 'Pipeline water walk', 'visit',
   'Sewer and water complaints along the main road. Walk from the stage to the school with the MCA.', 'acc8dad3-ebfa-4cd4-acc8-37d815c9ca1c'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-08', '17:00', 'Evening TV interview', 'media',
   'Recorded piece on youth jobs and the digital side hustles. One stat, one story, one promise.', null),

  -- Friday 9 Oct
  ('ca000000-0000-4000-8000-000000000002', '2026-10-09', '11:00', 'Imara Daima rally', 'rally',
   'Joint rally with the parliamentary aspirant. Expect two thousand plus; sound, stage and water sorted.', '2711ee4f-ef38-4fa8-b4cf-a7772a5300a1'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-09', '16:00', 'Finance check-in', 'meeting',
   'Stipend run for the week and the rally budget. Only the candidate and manager in the room.', null),

  -- Saturday 10 Oct
  ('ca000000-0000-4000-8000-000000000002', '2026-10-10', '10:00', 'Uthiru roads walk', 'visit',
   'Murram sections washed out by the rains. Walk with the ward team and the residents'' committee.', '97bfb2d5-a178-41d0-955d-25fdc51f4ead'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-10', '14:00', 'Gatina grounds meet-and-greet', 'rally',
   'Open-air meet and greet at the sports grounds. Keep it to twenty minutes and take questions.', '4e01ec33-88ea-4529-a73d-0674ab8575d3'),

  -- Sunday 11 Oct
  ('ca000000-0000-4000-8000-000000000002', '2026-10-11', '09:00', 'Sunday service, Kawangware', 'church',
   'Preaching invitation. A greeting, thanks, and the water promise. Give before the sermon, not after.', '173988d6-ce51-4953-a47b-473bfd7d530e'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-11', '12:30', 'Kileleshwa church service', 'church',
   'Second service. The bishop will mention us from the altar; no politics from the pulpit.', '15e9c246-5b7f-46cd-bdb4-749788adeb0e'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-11', '16:00', 'Funeral, Mutu-ini', 'funeral',
   'Family of a ward organiser''s mother. Condolence message and a small harambee pledge, home by six.', '426c83b0-7dc1-413a-823d-5f003d1d66c1'),
  ('ca000000-0000-4000-8000-000000000002', '2026-10-11', '19:30', 'Monday plan with the managers', 'meeting',
   'Set next week''s route: Embakasi South Saturday, Langata Sunday. Confirm the buses by Friday.', null);