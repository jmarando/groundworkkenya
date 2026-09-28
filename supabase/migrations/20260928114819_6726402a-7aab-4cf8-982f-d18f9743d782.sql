do $$
declare t text;
begin
  foreach t in array array['wards','people','person_events','person_imports','polls','poll_invites','poll_responses',
    'conversations','broadcasts','messages','contributions','expenses','polling_stations','incidents','agent_stipends',
    'stream_results','form_photos','ballot_candidates','listening_topics','listening_mentions','listening_alerts',
    'listening_alert_events','social_accounts'] loop
    execute format('alter table public.%I alter column campaign_id set default public.my_campaign()', t);
  end loop;
end $$;