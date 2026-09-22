-- wards
with w(name, constituency) as (values
('Kitisuru','Westlands'),('Parklands/Highridge','Westlands'),('Karura','Westlands'),('Kangemi','Westlands'),('Mountain View','Westlands'),
('Kilimani','Dagoretti North'),('Kawangware','Dagoretti North'),('Gatina','Dagoretti North'),('Kileleshwa','Dagoretti North'),('Kabiro','Dagoretti North'),
('Mutu-ini','Dagoretti South'),('Ngando','Dagoretti South'),('Riruta','Dagoretti South'),('Uthiru/Ruthimitu','Dagoretti South'),('Waithaka','Dagoretti South'),
('Karen','Langata'),('Nairobi West','Langata'),('Mugumo-ini','Langata'),('South C','Langata'),('Nyayo Highrise','Langata'),
('Laini Saba','Kibra'),('Lindi','Kibra'),('Makina','Kibra'),('Woodley/Kenyatta Golf Course','Kibra'),('Sarangombe','Kibra'),
('Githurai','Roysambu'),('Kahawa West','Roysambu'),('Zimmerman','Roysambu'),('Roysambu','Roysambu'),('Kahawa','Roysambu'),
('Clay City','Kasarani'),('Mwiki','Kasarani'),('Kasarani','Kasarani'),('Njiru','Kasarani'),('Ruai','Kasarani'),
('Baba Dogo','Ruaraka'),('Utalii','Ruaraka'),('Mathare North','Ruaraka'),('Lucky Summer','Ruaraka'),('Korogocho','Ruaraka'),
('Imara Daima','Embakasi South'),('Kwa Njenga','Embakasi South'),('Kwa Reuben','Embakasi South'),('Pipeline','Embakasi South'),('Kware','Embakasi South'),
('Kariobangi North','Embakasi North'),('Dandora Area I','Embakasi North'),('Dandora Area II','Embakasi North'),('Dandora Area III','Embakasi North'),('Dandora Area IV','Embakasi North'),
('Kayole North','Embakasi Central'),('Kayole Central','Embakasi Central'),('Kayole South','Embakasi Central'),('Komarock','Embakasi Central'),('Matopeni/Spring Valley','Embakasi Central'),
('Upper Savannah','Embakasi East'),('Lower Savannah','Embakasi East'),('Embakasi','Embakasi East'),('Utawala','Embakasi East'),('Mihango','Embakasi East'),
('Umoja I','Embakasi West'),('Umoja II','Embakasi West'),('Mowlem','Embakasi West'),('Kariobangi South','Embakasi West'),
('Maringo/Hamza','Makadara'),('Viwandani','Makadara'),('Harambee','Makadara'),('Makongeni','Makadara'),
('Pumwani','Kamukunji'),('Eastleigh North','Kamukunji'),('Eastleigh South','Kamukunji'),('Airbase','Kamukunji'),('California','Kamukunji'),
('Nairobi Central','Starehe'),('Ngara','Starehe'),('Pangani','Starehe'),('Ziwani/Kariokor','Starehe'),('Landimawe','Starehe'),('Nairobi South','Starehe'),
('Hospital','Mathare'),('Mabatini','Mathare'),('Huruma','Mathare'),('Ngei','Mathare'),('Mlango Kubwa','Mathare'),('Kiamaiko','Mathare')
), n as (select name, constituency, row_number() over () as i from w)
insert into public.wards (slug, name, constituency, registered_voters, target_votes, supporters, map_x, map_y)
select lower(regexp_replace(name,'[^a-zA-Z0-9]+','-','g')),
       name, constituency,
       18000 + ((i * 7919) % 26000),
       9000 + ((i * 5417) % 14000),
       3000 + ((i * 3671) % 11000),
       round((8 + ((i * 37) % 84))::numeric, 2),
       round((8 + ((i * 53) % 84))::numeric, 2)
from n;

-- segments
insert into public.segments (slug, name, description, colour) values
('boda','Boda riders','Motorcycle taxi operators and stage committees','#D9481C'),
('market','Market traders','Stall holders and market association members','#1F6F4A'),
('youth','Youth 18-34','First and second time voters','#C99A2E'),
('women','Women''s groups','Chamas, table banking and welfare groups','#7A4FB5'),
('matatu','Matatu sector','Saccos, drivers, conductors','#2B6CB0'),
('faith','Faith leaders','Church, mosque and temple leadership','#3D7A6B'),
('landlords','Landlords & caretakers','Property owners in high-density wards','#8B5E3C'),
('students','Students','Campus and TVET networks','#B0324B');

-- people (1200 sample records)
insert into public.people (phone, full_name, ward_id, segment, source, support_score, consent_sms, consent_whatsapp, consent_call, opted_out, language, tags, last_contacted_at)
select
  '+2547' || lpad(((10000000 + g * 7307) % 100000000)::text, 8, '0'),
  (array['Achieng','Wanjiku','Otieno','Kamau','Mwangi','Atieno','Njeri','Odhiambo','Chebet','Kiptoo','Wafula','Njoroge','Auma','Mutiso','Nyambura','Omondi'])[1 + (g % 16)]
    || ' ' ||
  (array['Onyango','Kariuki','Mbugua','Were','Cherono','Muthoni','Barasa','Kilonzo','Anyango','Gitau','Rotich','Wekesa'])[1 + ((g * 5) % 12)],
  (select id from public.wards order by slug offset (g % 85) limit 1),
  (array['boda','market','youth','women','matatu','faith','landlords','students'])[1 + (g % 8)],
  (array['ussd','sms_optin','canvass','web_poll','event','referral'])[1 + ((g * 3) % 6)],
  (g * 17) % 101,
  (g % 10) <> 0,
  (g % 3) = 0,
  (g % 7) = 0,
  (g % 97) = 0,
  case when (g % 4) = 0 then 'sw' else 'en' end,
  case when (g % 11) = 0 then array['volunteer'] when (g % 13) = 0 then array['agent-candidate'] else '{}'::text[] end,
  now() - ((g % 60) || ' days')::interval
from generate_series(1, 1200) g;

-- polls
insert into public.polls (code, question, kind, options, channels, audience, status, reward, sample_target, opens_at, closes_at) values
('WATER1','Which issue should we push hardest this month?', 'single_choice',
 '[{"key":"1","label":"Water supply"},{"key":"2","label":"Garbage collection"},{"key":"3","label":"Street lighting"},{"key":"4","label":"Market fees"}]'::jsonb,
 '{sms,ussd,web}', '{"segments":["market","boda","women"]}'::jsonb, 'closed', 'Airtime KES 20', 2000,
 now() - interval '21 days', now() - interval '14 days'),
('BODA27','Boda riders: what would help your daily earnings most?', 'single_choice',
 '[{"key":"1","label":"Cheaper licences"},{"key":"2","label":"Safe stages"},{"key":"3","label":"Fuel costs"},{"key":"4","label":"Police harassment"}]'::jsonb,
 '{sms,ussd}', '{"segments":["boda","matatu"]}'::jsonb, 'live', 'Airtime KES 20', 1500,
 now() - interval '3 days', now() + interval '4 days'),
('TURNOUT','Will you vote in the 2027 county election?', 'single_choice',
 '[{"key":"1","label":"Definitely"},{"key":"2","label":"Probably"},{"key":"3","label":"Unsure"},{"key":"4","label":"No"}]'::jsonb,
 '{sms,web}', '{"segments":["youth","students"]}'::jsonb, 'draft', null, 3000, null, null);

-- poll responses for the two open/closed polls
insert into public.poll_responses (poll_id, person_id, ward_id, channel, option_key, weight, created_at)
select p.id, pe.id, pe.ward_id,
       (array['sms','ussd','web'])[1 + (row_number() over () % 3)],
       (1 + ((row_number() over ()) % 4))::text,
       1,
       p.opens_at + ((row_number() over () % 120) || ' minutes')::interval
from public.polls p
join lateral (
  select id, ward_id from public.people
  where opted_out = false
  order by md5(id::text || p.code)
  limit case when p.code = 'WATER1' then 420 else 260 end
) pe on true
where p.code in ('WATER1','BODA27');

-- money
insert into public.contributions (donor_name, donor_type, amount_kes, method, reference, received_at, disclosed) values
('Nairobi Traders Welfare','organisation', 2500000,'bank','TRF-88213', now() - interval '40 days', true),
('J. Mwangi','individual', 500000,'mpesa','QJK4TR9A1', now() - interval '31 days', true),
('Riverside Holdings Ltd','company', 7500000,'bank','TRF-88910', now() - interval '25 days', true),
('A. Otieno','individual', 120000,'mpesa','QJL9PP2B7', now() - interval '18 days', false),
('Diaspora Friends Chapter','organisation', 1850000,'bank','TRF-89240', now() - interval '11 days', false),
('S. Kilonzo','individual', 65000,'mpesa','QJM2WW8C3', now() - interval '4 days', false);

insert into public.expenses (description, category, vendor, amount_kes, status, statutory, reference, incurred_at) values
('Bulk SMS credit — April','comms','Africa''s Talking', 1450000,'paid', true,'INV-4412', now() - interval '12 days'),
('Ward agent stipends — March','field','Payroll', 8600000,'paid', true,'PR-0312', now() - interval '28 days'),
('Billboard sites — Thika Road','advertising','Magnate Media', 4200000,'paid', true,'INV-2210', now() - interval '20 days'),
('Branded t-shirts (20,000)','merchandise','Upendo Prints', 3100000,'approved', true,'PO-7781', now() - interval '9 days'),
('County hall rally logistics','events','Sokoni Events', 2750000,'pending', true,'PO-7810', now() - interval '3 days'),
('Legal & compliance retainer','operations','Kinyua & Co Advocates', 900000,'paid', true,'INV-0091', now() - interval '15 days');

-- polling stations (one per ward, three streams)
insert into public.polling_stations (code, name, ward_id, registered_voters, streams, agent_name, agent_phone, status)
select 'PS-' || lpad((row_number() over (order by w.slug))::text, 4, '0'),
       w.name || ' Primary School',
       w.id,
       (w.registered_voters / 6)::int,
       3,
       case when (row_number() over (order by w.slug)) % 5 = 0 then null else 'Agent ' || w.name end,
       case when (row_number() over (order by w.slug)) % 5 = 0 then null else '+25470' || lpad(((row_number() over (order by w.slug)) * 131)::text, 7, '0') end,
       case when (row_number() over (order by w.slug)) % 5 = 0 then 'unstaffed' else 'confirmed' end
from public.wards w;

-- incidents
insert into public.incidents (title, detail, severity, status, ward_id, reported_by, occurred_at)
select t.title, t.detail, t.severity, t.status,
       (select id from public.wards order by slug offset t.off limit 1), t.who, now() - (t.mins || ' minutes')::interval
from (values
  ('Agent blocked at gate','Presiding officer refusing entry pending accreditation check','critical','open', 41,'Agent Pipeline', 18),
  ('Ballot delivery delayed','Materials 90 minutes late, queue building','warning','open', 12,'Agent Ngando', 52),
  ('Power outage at tallying point','Generator requested','warning','ack', 74,'Ward coordinator', 95),
  ('Unverified result sheet circulating','Image on WhatsApp does not match Form 34A','critical','open', 29,'Legal desk', 140),
  ('Peaceful high turnout','Queue clearing steadily','info','closed', 3,'Agent Karura', 210)
) as t(title, detail, severity, status, off, who, mins);

-- recent messages
insert into public.messages (person_id, poll_id, phone, channel, direction, body, status, cost_kes, sent_at, created_at)
select pe.id,
       (select id from public.polls where code='BODA27'),
       pe.phone,
       'sms',
       case when g % 4 = 0 then 'in' else 'out' end,
       case when g % 4 = 0 then (1 + (g % 4))::text
            else 'Groundwork: Boda riders — what would help your earnings most? Reply 1 Licences 2 Stages 3 Fuel 4 Harassment. Reply STOP to opt out.' end,
       case when g % 23 = 0 then 'failed' else 'delivered' end,
       case when g % 4 = 0 then 0 else 0.8 end,
       now() - ((g * 7) || ' minutes')::interval,
       now() - ((g * 7) || ' minutes')::interval
from (select id, phone, row_number() over () as g from public.people where opted_out = false order by md5(id::text) limit 300) pe;

-- conversations from inbound messages
insert into public.conversations (person_id, channel, subject, snippet, status, tags, unread, last_message_at)
select pe.id, 'sms',
       (array['Water rationing in Pipeline','Stage harassment','Garbage not collected','Bursary application','Job request','Market fee increase'])[1 + (pe.g % 6)],
       (array['Tumekaa siku tatu bila maji.','Askari wanatupiga faini kila siku.','Taka hazijachukuliwa tangu Jumatatu.','Naomba msaada wa bursary kwa mwanangu.','Kuna kazi yoyote?','Ada ya soko imepanda sana.'])[1 + (pe.g % 6)],
       case when pe.g % 5 = 0 then 'closed' else 'open' end,
       case when pe.g % 3 = 0 then array['service-request'] else array['feedback'] end,
       pe.g % 4 <> 0,
       now() - ((pe.g * 41) || ' minutes')::interval
from (select id, row_number() over () as g from public.people order by md5(id::text || 'c') limit 48) pe;