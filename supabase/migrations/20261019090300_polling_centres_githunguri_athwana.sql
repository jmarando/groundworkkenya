-- The polling centres of IEBC's 2022 register for kiambu/githunguri and meru/tigania-west/athwana, from
-- data/stations, with the positions OpenStreetMap's schools gave (© OpenStreetMap contributors,
-- ODbL), and each ward's registered voters. Safe to run again. No schema change.
-- Written by scripts/stations/build-sql.ts: change the CSV files and run it again, not this file.

-- A station with no IEBC code holding a code the register needs would be lost: stop instead.
do $$
begin
  if exists (select 1 from public.polling_stations s
               join public.campaigns c on c.id = s.campaign_id
              where c.map_area in ('kiambu/githunguri', 'meru/tigania-west/athwana') and s.iebc_code is null and s.code ~ '^PS-[0-9]{4}$') then
    raise exception 'A station with no IEBC code holds a PS- code the register needs: rename it first.';
  end if;
end $$;

-- kiambu/githunguri: each ward's box and registered voters (its centres added up), then its centres.
update public.wards w
   set west = v.west, south = v.south, east = v.east, north = v.north,
       registered_voters = v.registered
  from (values
    ('githiga', 36.67499, -1.10857, 36.76734, -1.0414, 20616),
    ('githunguri', 36.74054, -1.09441, 36.82897, -1.03429, 27596),
    ('ikinu', 36.76146, -1.12327, 36.85804, -1.08352, 17450),
    ('komothai', 36.77326, -1.08632, 36.89804, -0.9757, 20054),
    ('ngewa', 36.79897, -1.1109, 36.88592, -1.0296, 18876)
  ) as v(slug, west, south, east, north, registered)
  join public.campaigns c on c.map_area = 'kiambu/githunguri'
 where w.campaign_id = c.id and w.slug = v.slug;

insert into public.polling_stations
  (campaign_id, code, iebc_code, name, ward_id, registered_voters, streams, lat, lng, placed_by,
   placed_at)
select c.id, v.code, v.iebc_code, v.name, w.id, v.registered, v.streams,
       v.lat::double precision, v.lng::double precision, v.placed_by,
       case when v.lat is null then null else now() end
  from (values
    ('0221160577001', 'PS-0001', 'GITHUNGURI TOWNSHIP PRIMARY SCHOOL', 'githunguri', 10, 6341, -1.056075, 36.78053, 'osm'),
    ('0221160577002', 'PS-0002', 'KAHUNIRA PRIMARY SCHOOL', 'githunguri', 3, 2084, -1.052754, 36.76019, 'osm'),
    ('0221160577003', 'PS-0003', 'GITHUNGURI PRIMARY SCHOOL', 'githunguri', 4, 2129, -1.065339, 36.777016, 'osm'),
    ('0221160577004', 'PS-0004', 'MIIRI PRIMARY SCHOOL', 'githunguri', 4, 2106, null, null, null),
    ('0221160577005', 'PS-0005', 'RIAMUTE PRIMARY SCHOOL', 'githunguri', 2, 974, null, null, null),
    ('0221160577006', 'PS-0006', 'GATHANJI PRIMARY SCHOOL', 'githunguri', 2, 1134, -1.081407, 36.771034, 'osm'),
    ('0221160577007', 'PS-0007', 'KIAIRIA PRIMARY SCHOOL', 'githunguri', 3, 1899, -1.08538, 36.81334, 'osm'),
    ('0221160577008', 'PS-0008', 'A.K.MAGUGU PRIMARY SCHOOL', 'githunguri', 3, 2093, -1.086214, 36.792478, 'osm'),
    ('0221160577009', 'PS-0009', 'CIIKO PRIMARY SCHOOL', 'githunguri', 7, 4799, -1.057798, 36.774757, 'osm'),
    ('0221160577010', 'PS-0010', 'NGOCHI NURSERY SCHOOL', 'githunguri', 3, 1422, null, null, null),
    ('0221160577011', 'PS-0011', 'GITWE GIRLS SECONDARY SCHOOL', 'githunguri', 2, 1067, -1.065329, 36.740959, 'osm'),
    ('0221160577012', 'PS-0012', 'KINDIGA PRIMARY SCHOOL', 'githunguri', 1, 531, -1.0447, 36.80453, 'osm'),
    ('0221160577013', 'PS-0013', 'ST. JOSEPHS HIGH SCHOOL GITHUNGURI', 'githunguri', 2, 1017, -1.0479, 36.78428, 'osm-close'),
    ('0221160578014', 'PS-0014', 'GATINA PRIMARY SCHOOL', 'githiga', 2, 944, null, null, null),
    ('0221160578015', 'PS-0015', 'GATHANGARI PRIMARY SCHOOL', 'githiga', 2, 1310, -1.065068, 36.70753, 'osm'),
    ('0221160578016', 'PS-0016', 'KANYORE PRIMARY SCHOOL', 'githiga', 5, 3256, -1.06151, 36.72049, 'osm'),
    ('0221160578017', 'PS-0017', 'MATHANJA PRIMARY SCHOOL', 'githiga', 2, 710, -1.0517, 36.70734, 'osm'),
    ('0221160578018', 'PS-0018', 'GITHIGA PRIMARY SCHOOL', 'githiga', 5, 3274, -1.083473, 36.729699, 'osm'),
    ('0221160578019', 'PS-0019', 'MATUGUTA PRIMARY SCHOOL', 'githiga', 4, 2544, -1.07611, 36.744351, 'osm'),
    ('0221160578020', 'PS-0020', 'GATITU PRIMARY SCHOOL', 'githiga', 3, 1549, -1.102225, 36.748403, 'osm'),
    ('0221160578021', 'PS-0021', 'NJENGA PRIMARY SCHOOL', 'githiga', 4, 2219, -1.079304, 36.723812, 'osm'),
    ('0221160578022', 'PS-0022', 'GITIHA YOUTH POLYTECHNIC WORKSHOP', 'githiga', 3, 1818, null, null, null),
    ('0221160578023', 'PS-0023', 'GITHIGA HIGH SCHOOL', 'githiga', 3, 1599, -1.103476, 36.735244, 'osm'),
    ('0221160578024', 'PS-0024', 'GATAKA PRIMARY SCHOOL', 'githiga', 1, 360, -1.075068, 36.675505, 'osm'),
    ('0221160578025', 'PS-0025', 'GATHAITHI SECONDARY SCHOOL', 'githiga', 2, 1033, -1.09449, 36.76367, 'osm'),
    ('0221160579026', 'PS-0026', 'KAMONDO PRIMARY SCHOOL', 'ikinu', 4, 2128, -1.104414, 36.777456, 'osm'),
    ('0221160579027', 'PS-0027', 'IKINU PRIMARY SCHOOL', 'ikinu', 6, 3782, -1.098521, 36.798158, 'osm'),
    ('0221160579028', 'PS-0028', 'NGEMWA PRIMARY SCHOOL', 'ikinu', 4, 2104, -1.118117, 36.813966, 'osm'),
    ('0221160579029', 'PS-0029', 'GATHAITHI PRIMARY SCHOOL', 'ikinu', 3, 1544, -1.095, 36.76666, 'osm'),
    ('0221160579030', 'PS-0030', 'KIAIBABU PRIMARY SCHOOL', 'ikinu', 3, 1898, -1.104641, 36.787044, 'osm'),
    ('0221160579031', 'PS-0031', 'KARIA PRIMARY SCHOOL', 'ikinu', 5, 3089, -1.09648, 36.818284, 'osm'),
    ('0221160579032', 'PS-0032', 'RIOKI POLYTECHNIC', 'ikinu', 2, 927, null, null, null),
    ('0221160579033', 'PS-0033', 'WILLIAM NG IRU SECONDARY SCHOOL', 'ikinu', 3, 1978, null, null, null),
    ('0221160580034', 'PS-0034', 'NDIRITI PRIMARY SCHOOL', 'ngewa', 3, 1556, null, null, null),
    ('0221160580035', 'PS-0035', 'GIATHIEKO PRIMARY SCHOOL', 'ngewa', 2, 1105, -1.077925, 36.820102, 'osm'),
    ('0221160580036', 'PS-0036', 'MITAHATO PRIMARY SCHOOL', 'ngewa', 3, 1908, -1.088428, 36.83688, 'osm'),
    ('0221160580037', 'PS-0037', 'KANJAI PRIMARY SCHOOL', 'ngewa', 3, 2071, -1.06254, 36.80658, 'osm'),
    ('0221160580038', 'PS-0038', 'MUKUBU PRIMARY SCHOOL', 'ngewa', 2, 789, null, null, null),
    ('0221160580039', 'PS-0039', 'GIAGITHU COFFEE FACTORY', 'ngewa', 2, 798, null, null, null),
    ('0221160580040', 'PS-0040', 'NGEWA PRIMARY SCHOOL', 'ngewa', 6, 3988, null, null, null),
    ('0221160580041', 'PS-0041', 'MIGUTA PRIMARY SCHOOL', 'ngewa', 3, 1477, null, null, null),
    ('0221160580042', 'PS-0042', 'KIAMBURURU PRIMARY SCHOOL', 'ngewa', 3, 1692, null, null, null),
    ('0221160580043', 'PS-0043', 'NJUNU PRIMARY SCHOOL', 'ngewa', 2, 1186, null, null, null),
    ('0221160580044', 'PS-0044', 'NYAGA PRIMARY SCHOOL', 'ngewa', 4, 2306, null, null, null),
    ('0221160581045', 'PS-0045', 'KIGUMO PRIMARY SCHOOL', 'komothai', 4, 2235, null, null, null),
    ('0221160581046', 'PS-0046', 'GITOMBO PRIMARY SCHOOL', 'komothai', 2, 899, null, null, null),
    ('0221160581047', 'PS-0047', 'KIAWAIRIA PRIMARY SCHOOL', 'komothai', 2, 1390, null, null, null),
    ('0221160581048', 'PS-0048', 'GATHUGU PRIMARY SCHOOL', 'komothai', 2, 1166, null, null, null),
    ('0221160581049', 'PS-0049', 'GITHIORO PRIMARY SCHOOL', 'komothai', 2, 852, null, null, null),
    ('0221160581050', 'PS-0050', 'GITHIMA PRIMARY SCHOOL', 'komothai', 2, 1253, null, null, null),
    ('0221160581051', 'PS-0051', 'GATHIRUINI PRIMARY SCHOOL', 'komothai', 2, 703, null, null, null),
    ('0221160581052', 'PS-0052', 'KOMOTHAI PRIMARY SCHOOL', 'komothai', 2, 1129, null, null, null),
    ('0221160581053', 'PS-0053', 'KIAWAIGURU PRIMARY SCHOOL', 'komothai', 2, 992, null, null, null),
    ('0221160581054', 'PS-0054', 'THUITA SOCIAL HALL', 'komothai', 2, 923, null, null, null),
    ('0221160581055', 'PS-0055', 'THUITA PRIMARY SCHOOL', 'komothai', 1, 457, null, null, null),
    ('0221160581056', 'PS-0056', 'KAGEMA PRIMARY SCHOOL', 'komothai', 3, 1769, null, null, null),
    ('0221160581057', 'PS-0057', 'KOROKORO NURSERY SCHOOL', 'komothai', 2, 1088, -1.06849, 36.88617, 'osm'),
    ('0221160581058', 'PS-0058', 'KIBICHOI PRIMARY SCHOOL', 'komothai', 3, 1444, null, null, null),
    ('0221160581059', 'PS-0059', 'KIHURIRIO PRIMARY SCHOOL', 'komothai', 2, 1158, null, null, null),
    ('0221160581060', 'PS-0060', 'NGINDURI PRIMARY SCHOOL', 'komothai', 1, 689, null, null, null),
    ('0221160581061', 'PS-0061', 'KOMOTHAI GIRLS SECONDARY SCHOOL', 'komothai', 2, 847, -1.040421, 36.83147, 'osm'),
    ('0221160581062', 'PS-0062', 'KIEREINI SECONDARY SCHOOL', 'komothai', 2, 785, null, null, null),
    ('0221160581063', 'PS-0063', 'BARIKONGO COFFEE FACTORY', 'komothai', 1, 275, null, null, null)
  ) as v(iebc_code, code, name, ward, streams, registered, lat, lng, placed_by)
  join public.campaigns c on c.map_area = 'kiambu/githunguri'
  join public.wards w on w.campaign_id = c.id and w.slug = v.ward
on conflict (campaign_id, iebc_code) where iebc_code is not null do nothing;

-- meru/tigania-west/athwana: each ward's box and registered voters (its centres added up), then its centres.
update public.wards w
   set west = v.west, south = v.south, east = v.east, north = v.north,
       registered_voters = v.registered
  from (values
    ('athwana', 37.58195, 0.19626, 37.78219, 0.48731, 9123)
  ) as v(slug, west, south, east, north, registered)
  join public.campaigns c on c.map_area = 'meru/tigania-west/athwana'
 where w.campaign_id = c.id and w.slug = v.slug;

insert into public.polling_stations
  (campaign_id, code, iebc_code, name, ward_id, registered_voters, streams, lat, lng, placed_by,
   placed_at)
select c.id, v.code, v.iebc_code, v.name, w.id, v.registered, v.streams,
       v.lat::double precision, v.lng::double precision, v.placed_by,
       case when v.lat is null then null else now() end
  from (values
    ('0120540266001', 'PS-0001', 'LIMORO PRIMARY SCHOOL', 'athwana', 2, 1144, null, null, null),
    ('0120540266002', 'PS-0002', 'MAITHA PRIMARY SCHOOL', 'athwana', 2, 816, null, null, null),
    ('0120540266003', 'PS-0003', 'MWANIKA PRIMARY SCHOOL', 'athwana', 2, 1216, null, null, null),
    ('0120540266004', 'PS-0004', 'KIBIRU PRIMARY SCHOOL', 'athwana', 2, 798, null, null, null),
    ('0120540266005', 'PS-0005', 'MWERONKORO PRIMARY SCHOOL', 'athwana', 1, 481, null, null, null),
    ('0120540266006', 'PS-0006', 'K.K NKENGECHIA PRIMARY SCHOOL', 'athwana', 1, 446, null, null, null),
    ('0120540266007', 'PS-0007', 'TWARAMA KENYA ASSEMBLY OF GOD NURSERY SCHOOL', 'athwana', 2, 729, null, null, null),
    ('0120540266008', 'PS-0008', 'LACIATHURIU PRIMARY SCHOOL', 'athwana', 1, 519, null, null, null),
    ('0120540266009', 'PS-0009', 'ATHWANA SECONDARY SCHOOL', 'athwana', 2, 972, null, null, null),
    ('0120540266010', 'PS-0010', 'KAMANORO PRIMARY SCHOOL', 'athwana', 1, 644, null, null, null),
    ('0120540266011', 'PS-0011', 'NKILUTHU PRIMARY SCHOOL', 'athwana', 1, 686, null, null, null),
    ('0120540266082', 'PS-0012', '1. KADEBENE LIVESTOCK MARKET', 'athwana', 1, 113, null, null, null),
    ('0120540266083', 'PS-0013', 'MULUTA DISPENSARY', 'athwana', 1, 398, null, null, null),
    ('0120540266084', 'PS-0014', 'KIARE PRIMARY SCHOOL', 'athwana', 1, 161, null, null, null)
  ) as v(iebc_code, code, name, ward, streams, registered, lat, lng, placed_by)
  join public.campaigns c on c.map_area = 'meru/tigania-west/athwana'
  join public.wards w on w.campaign_id = c.id and w.slug = v.ward
on conflict (campaign_id, iebc_code) where iebc_code is not null do nothing;

-- Every campaign with one of these map areas has all of its centres.
do $$
declare
  short text;
begin
  select string_agg(format('%s has %s centres, not %s', c.slug, k.n, e.want), '; ') into short
    from (values ('kiambu/githunguri', 63), ('meru/tigania-west/athwana', 14)) as e(map_area, want)
    join public.campaigns c on c.map_area = e.map_area
    cross join lateral (select count(*) as n from public.polling_stations s
                         where s.campaign_id = c.id and s.iebc_code is not null) k
   where k.n <> e.want;
  if short is not null then
    raise exception 'The centres did not all load: %', short;
  end if;
end $$;
