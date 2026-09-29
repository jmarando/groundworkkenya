-- Sample people, tagged. Schema version 15.
--
-- The first migrations seeded 1,200 invented people so the console had
-- something to show; multi-campaign then placed them in Sakaja's workspace,
-- where they look like real records. Home counts a campaign's own work as
-- real only when there are people who are not samples, so the seeded rows
-- carry the tag 'sample'.
--
-- They are found by the seed's own formula: phone and name must both match,
-- in Sakaja's workspace only. A row the team has since renamed, and anyone in
-- another campaign, is left alone. Running this twice changes nothing.

update public.people p
   set tags = array_append(p.tags, 'sample')
  from generate_series(1, 1200) g
 where p.campaign_id = 'ca000000-0000-4000-8000-000000000002'
   and p.phone = '+2547' || lpad(((10000000 + g * 7307) % 100000000)::text, 8, '0')
   and p.full_name =
         (array['Achieng','Wanjiku','Otieno','Kamau','Mwangi','Atieno','Njeri','Odhiambo',
                'Chebet','Kiptoo','Wafula','Njoroge','Auma','Mutiso','Nyambura','Omondi'])[1 + (g % 16)]
         || ' ' ||
         (array['Onyango','Kariuki','Mbugua','Were','Cherono','Muthoni','Barasa','Kilonzo',
                'Anyango','Gitau','Rotich','Wekesa'])[1 + ((g * 5) % 12)]
   and not ('sample' = any(p.tags));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 15 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
