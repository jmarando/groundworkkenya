-- The polling centres of IEBC's 2022 register for migori/kuria-east, from
-- data/stations, with the positions OpenStreetMap's schools gave (© OpenStreetMap contributors,
-- ODbL), and each ward's registered voters. Safe to run again. No schema change.
-- Written by scripts/stations/build-sql.ts: change the CSV files and run it again, not this file.

-- A station with no IEBC code holding a code the register needs would be lost: stop instead.
do $$
begin
  if exists (select 1 from public.polling_stations s
               join public.campaigns c on c.id = s.campaign_id
              where c.map_area in ('migori/kuria-east') and s.iebc_code is null and s.code ~ '^PS-[0-9]{4}$') then
    raise exception 'A station with no IEBC code holds a PS- code the register needs: rename it first.';
  end if;
end $$;

-- migori/kuria-east: each ward's box and registered voters (its centres added up), then its centres.
update public.wards w
   set west = v.west, south = v.south, east = v.east, north = v.north,
       registered_voters = v.registered
  from (values
    ('gokeharaka-getambwega', 34.5146, -1.30504, 34.60129, -1.21912, 7962),
    ('ntimaru-east', 34.67445, -1.35296, 34.71975, -1.26871, 5591),
    ('ntimaru-west', 34.6401, -1.38981, 34.73045, -1.30093, 8628),
    ('nyabasi-east', 34.62864, -1.33136, 34.69935, -1.20046, 8930),
    ('nyabasi-west', 34.58215, -1.33665, 34.6712, -1.16306, 10865)
  ) as v(slug, west, south, east, north, registered)
  join public.campaigns c on c.map_area = 'migori/kuria-east'
 where w.campaign_id = c.id and w.slug = v.slug;

insert into public.polling_stations
  (campaign_id, code, iebc_code, name, ward_id, registered_voters, streams, lat, lng, placed_by,
   placed_at)
select c.id, v.code, v.iebc_code, v.name, w.id, v.registered, v.streams,
       v.lat::double precision, v.lng::double precision, v.placed_by,
       case when v.lat is null then null else now() end
  from (values
    ('0442601296001', 'PS-0001', 'GOKEHARAKA PR. SCHOOL', 'gokeharaka-getambwega', 1, 556, null, null, null),
    ('0442601296002', 'PS-0002', 'IHORE PR. SCHOOL', 'gokeharaka-getambwega', 2, 751, null, null, null),
    ('0442601296003', 'PS-0003', 'NYAMARANYA PR. SCHOOL', 'gokeharaka-getambwega', 2, 867, null, null, null),
    ('0442601296004', 'PS-0004', 'NGUKU MAHANDO PR. SCHOOL', 'gokeharaka-getambwega', 2, 946, null, null, null),
    ('0442601296005', 'PS-0005', 'NYAMOTAMBE PR. SCHOOL', 'gokeharaka-getambwega', 1, 556, null, null, null),
    ('0442601296006', 'PS-0006', 'CHACHA MARWA PR. SCHOOL', 'gokeharaka-getambwega', 1, 432, null, null, null),
    ('0442601296007', 'PS-0007', 'MASANGORA PR. SCHOOL', 'gokeharaka-getambwega', 2, 1226, null, null, null),
    ('0442601296008', 'PS-0008', 'GETAMBWEGA PR. SCHOOL', 'gokeharaka-getambwega', 1, 378, null, null, null),
    ('0442601296009', 'PS-0009', 'SIMBORI PR,SCHOOL', 'gokeharaka-getambwega', 1, 304, null, null, null),
    ('0442601296010', 'PS-0010', 'BIKARABWA PR. SCHOOL', 'gokeharaka-getambwega', 1, 208, null, null, null),
    ('0442601296011', 'PS-0011', 'TUNG''AINI PR. SCHOOL', 'gokeharaka-getambwega', 1, 414, null, null, null),
    ('0442601296012', 'PS-0012', 'GURETA PR. SCHOOL', 'gokeharaka-getambwega', 1, 526, null, null, null),
    ('0442601296013', 'PS-0013', 'KUBINTO PR. SCHOOL', 'gokeharaka-getambwega', 1, 307, null, null, null),
    ('0442601296014', 'PS-0014', 'WISDOM PR. SCHOOL', 'gokeharaka-getambwega', 1, 375, null, null, null),
    ('0442601296069', 'PS-0015', 'KEWANDWI PRIMARY SCHOOL', 'gokeharaka-getambwega', 1, 116, null, null, null),
    ('0442601297015', 'PS-0016', 'NTIMARU PR. SCHOOL', 'ntimaru-west', 1, 636, null, null, null),
    ('0442601297016', 'PS-0017', 'MAKARARANGWE PR. SCHOOL', 'ntimaru-west', 2, 849, null, null, null),
    ('0442601297017', 'PS-0018', 'MATARE PR. SCHOOL', 'ntimaru-west', 1, 684, null, null, null),
    ('0442601297018', 'PS-0019', 'KWIBANCHA PR. SCHOOL', 'ntimaru-west', 1, 627, null, null, null),
    ('0442601297019', 'PS-0020', 'IGENA ITAMBE PR. SCHOOL', 'ntimaru-west', 1, 413, null, null, null),
    ('0442601297020', 'PS-0021', 'MOTARAKWA PR. SCHOOL', 'ntimaru-west', 2, 1358, null, null, null),
    ('0442601297021', 'PS-0022', 'BONGEBO PR. SCHOOL', 'ntimaru-west', 1, 663, null, null, null),
    ('0442601297022', 'PS-0023', 'KOHERO PR. SCHOOL', 'ntimaru-west', 1, 604, null, null, null),
    ('0442601297023', 'PS-0024', 'GWITEMBE PR. SCHOOL', 'ntimaru-west', 2, 1066, null, null, null),
    ('0442601297024', 'PS-0025', 'KWIHO PR. SCHOOL', 'ntimaru-west', 1, 582, null, null, null),
    ('0442601297025', 'PS-0026', 'MUTINITI PR. SCHOOL', 'ntimaru-west', 1, 252, null, null, null),
    ('0442601297026', 'PS-0027', 'SERONGA PR. SCHOOL', 'ntimaru-west', 1, 464, null, null, null),
    ('0442601297027', 'PS-0028', 'GIBOMWE NUR. SCHOOL', 'ntimaru-west', 1, 302, null, null, null),
    ('0442601297070', 'PS-0029', 'NYAMOTAMBE NURSERY SCHOOL', 'ntimaru-west', 1, 128, null, null, null),
    ('0442601298028', 'PS-0030', 'ITONGO PR. SCHOOL', 'ntimaru-east', 1, 658, null, null, null),
    ('0442601298029', 'PS-0031', 'WANGIRABOSE PR. SCHOOL', 'ntimaru-east', 2, 1192, null, null, null),
    ('0442601298030', 'PS-0032', 'TARAGAI PR. SCHOOL', 'ntimaru-east', 1, 694, null, null, null),
    ('0442601298031', 'PS-0033', 'SIABAI PR. SCHOOL', 'ntimaru-east', 2, 1161, null, null, null),
    ('0442601298032', 'PS-0034', 'NYANKONGO PR. SCHOOL', 'ntimaru-east', 1, 480, null, null, null),
    ('0442601298033', 'PS-0035', 'MINYERE PR. SCHOOL', 'ntimaru-east', 1, 674, null, null, null),
    ('0442601298034', 'PS-0036', 'MAKONGE PR. SCHOOL', 'ntimaru-east', 1, 586, null, null, null),
    ('0442601298071', 'PS-0037', 'GIRIRIANI CATHOLIC', 'ntimaru-east', 1, 61, null, null, null),
    ('0442601298072', 'PS-0038', 'GOSEBE MARANATHA', 'ntimaru-east', 1, 85, null, null, null),
    ('0442601299035', 'PS-0039', 'NYAMAGENGA PR. SCHOOL', 'nyabasi-east', 1, 641, null, null, null),
    ('0442601299036', 'PS-0040', 'KOROMANGUCHA PR. SCHOOL', 'nyabasi-east', 2, 795, null, null, null),
    ('0442601299037', 'PS-0041', 'KUGITIMO PR. SCHOOL', 'nyabasi-east', 2, 878, null, null, null),
    ('0442601299038', 'PS-0042', 'NYAKEHOMO PR. SCHOOL', 'nyabasi-east', 1, 499, null, null, null),
    ('0442601299039', 'PS-0043', 'KEGONGA PR. SCHOOL', 'nyabasi-east', 3, 1807, null, null, null),
    ('0442601299040', 'PS-0044', 'NYAMANCHE PR. SCHOOL', 'nyabasi-east', 1, 544, null, null, null),
    ('0442601299041', 'PS-0045', 'SAKURI PR. SCHOOL', 'nyabasi-east', 1, 502, null, null, null),
    ('0442601299042', 'PS-0046', 'NYAMAGONGWI PR. SCHOOL', 'nyabasi-east', 2, 891, null, null, null),
    ('0442601299043', 'PS-0047', 'NGURUNA PR. SCHOOL', 'nyabasi-east', 1, 450, null, null, null),
    ('0442601299044', 'PS-0048', 'BIASUMWI PR. SCHOOL', 'nyabasi-east', 1, 268, null, null, null),
    ('0442601299045', 'PS-0049', 'GIRIGIRI PR. SCHOOL', 'nyabasi-east', 1, 299, null, null, null),
    ('0442601299046', 'PS-0050', 'GETONGOROMA PR. SCHOOL', 'nyabasi-east', 2, 705, null, null, null),
    ('0442601299047', 'PS-0051', 'KWIGENA PR. SCHOOL', 'nyabasi-east', 1, 403, null, null, null),
    ('0442601299048', 'PS-0052', 'NYAMOTAMBE PRIMARY SCHOOL', 'nyabasi-east', 1, 175, null, null, null),
    ('0442601299073', 'PS-0053', 'KWIRIBA RESCUE CENTRE', 'nyabasi-east', 1, 73, null, null, null),
    ('0442601300049', 'PS-0054', 'GIBARORI PR. SCHOOL', 'nyabasi-west', 1, 599, null, null, null),
    ('0442601300050', 'PS-0055', 'KENDEGE NUR. SCHOOL', 'nyabasi-west', 1, 695, null, null, null),
    ('0442601300051', 'PS-0056', 'NYAITARA PR. SCHOOL', 'nyabasi-west', 1, 441, null, null, null),
    ('0442601300052', 'PS-0057', 'MAETA PR. SCHOOL', 'nyabasi-west', 1, 593, null, null, null),
    ('0442601300053', 'PS-0058', 'SANCHAWA PR. SCHOOL', 'nyabasi-west', 1, 264, null, null, null),
    ('0442601300054', 'PS-0059', 'NYABIKONGORI PR. SCHOOL', 'nyabasi-west', 2, 1152, null, null, null),
    ('0442601300055', 'PS-0060', 'KOMOTOBO PR. SCHOOL', 'nyabasi-west', 1, 221, null, null, null),
    ('0442601300056', 'PS-0061', 'KEMAKOBA PR. SCHOOL', 'nyabasi-west', 1, 673, null, null, null),
    ('0442601300057', 'PS-0062', 'MUSWETO PR. SCHOOL', 'nyabasi-west', 1, 397, null, null, null),
    ('0442601300058', 'PS-0063', 'NYAROHA PR. SCHOOL', 'nyabasi-west', 1, 621, null, null, null),
    ('0442601300059', 'PS-0064', 'TEBESI PR. SCHOOL', 'nyabasi-west', 1, 272, null, null, null),
    ('0442601300060', 'PS-0065', 'KIONYO PR. SCHOOL', 'nyabasi-west', 1, 476, null, null, null),
    ('0442601300061', 'PS-0066', 'KEBAROTI PR. SCHOOL', 'nyabasi-west', 1, 559, null, null, null),
    ('0442601300062', 'PS-0067', 'REMANYANKI PR. SCHOOL', 'nyabasi-west', 1, 534, null, null, null),
    ('0442601300063', 'PS-0068', 'NYABOSONGO CENTRE', 'nyabasi-west', 2, 925, null, null, null),
    ('0442601300064', 'PS-0069', 'KOMORAMA NUR. SCHOOL', 'nyabasi-west', 1, 535, null, null, null),
    ('0442601300065', 'PS-0070', 'KEBARISIA NUR.', 'nyabasi-west', 1, 600, null, null, null),
    ('0442601300066', 'PS-0071', 'CHINATO PR. SCHOOL', 'nyabasi-west', 1, 381, null, null, null),
    ('0442601300067', 'PS-0072', 'KEGONCHE PR. SCHOOL', 'nyabasi-west', 1, 382, null, null, null),
    ('0442601300068', 'PS-0073', 'KEBARE PRIMARY SCHOOL', 'nyabasi-west', 1, 291, null, null, null),
    ('0442601300074', 'PS-0074', 'MARANATHA BITOROGWE', 'nyabasi-west', 1, 112, null, null, null),
    ('0442601300075', 'PS-0075', 'NYAMUTIRO MARANATHA CHURCH', 'nyabasi-west', 1, 142, null, null, null)
  ) as v(iebc_code, code, name, ward, streams, registered, lat, lng, placed_by)
  join public.campaigns c on c.map_area = 'migori/kuria-east'
  join public.wards w on w.campaign_id = c.id and w.slug = v.ward
on conflict (campaign_id, iebc_code) where iebc_code is not null do nothing;

-- Every campaign with one of these map areas has all of its centres.
do $$
declare
  short text;
begin
  select string_agg(format('%s has %s centres, not %s', c.slug, k.n, e.want), '; ') into short
    from (values ('migori/kuria-east', 75)) as e(map_area, want)
    join public.campaigns c on c.map_area = e.map_area
    cross join lateral (select count(*) as n from public.polling_stations s
                         where s.campaign_id = c.id and s.iebc_code is not null) k
   where k.n <> e.want;
  if short is not null then
    raise exception 'The centres did not all load: %', short;
  end if;
end $$;
