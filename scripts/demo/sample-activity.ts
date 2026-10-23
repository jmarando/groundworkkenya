// Sample campaign activity for a demo workspace: supporters on real houses, door knocks, a
// week's diary, expenses, contributions, an inbox and one campaign poll. Every figure is
// invented; the places are real (the campaign's wards, and houses from its house file). Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/demo/sample-activity.ts <out.sql> <slug>...
// Every row it writes can be told apart: people and conversations carry the tag "sample",
// expenses and contributions a SAMPLE- reference, polls a SAMPLE- code, diary notes
// "(sample)", and door visits client ids from md5('sample-visit:…'). No sample person has agreed to
// SMS, WhatsApp or calls, so nothing the campaign sends can reach the numbers.
// supabase/seeds/sample-activity-remove.sql removes the lot.
import { readFileSync, writeFileSync } from "node:fs";

import { inPolygon, wardShapes, type WardShape } from "@/lib/geo";
import { decodeTile, HOUSE_ZOOM, toTileSpace } from "@/lib/house-tiles";
import { MAP_AREAS } from "@/lib/map-areas";
import { gunzip, openArchive } from "@/lib/pmtiles";

type Names = { first: string[]; last: string[] };
type Place = { title: string; kind: string; ward: string; note: string };
type Config = {
  id: string;
  slug: string;
  mapArea: string;
  /** People per ward, and houses knocked per ward. */
  people: number;
  doors: number;
  names: Names;
  segments: [string, string, string, string][];
  places: Place[];
  expenses: [string, string, string, number, string][];
  inbox: [string, string, string, string][];
  poll: { question: string; questionSw: string; options: [string, string][] };
};

const KIKUYU: Names = {
  first: [
    "Wanjiru",
    "Njeri",
    "Wambui",
    "Wairimu",
    "Nyambura",
    "Muthoni",
    "Wangari",
    "Wanjiku",
    "Kamau",
    "Mwangi",
    "Njoroge",
    "Kariuki",
    "Waweru",
    "Gitau",
    "Ndungu",
    "Kimani",
    "Maina",
    "Mugo",
  ],
  last: [
    "Kamau",
    "Mwangi",
    "Njoroge",
    "Kariuki",
    "Waweru",
    "Gitau",
    "Ndungu",
    "Kimani",
    "Mugo",
    "Maina",
    "Githinji",
    "Macharia",
    "Wainaina",
    "Kinyua",
    "Muriuki",
    "Ngugi",
  ],
};
const NAIROBI: Names = {
  first: [
    ...KIKUYU.first.slice(0, 10),
    "Achieng",
    "Otieno",
    "Atieno",
    "Wafula",
    "Mutiso",
    "Mwikali",
    "Chebet",
    "Kiptoo",
    "Auma",
    "Omondi",
  ],
  last: [
    ...KIKUYU.last.slice(0, 10),
    "Onyango",
    "Odhiambo",
    "Barasa",
    "Wekesa",
    "Kilonzo",
    "Musyoka",
    "Rotich",
    "Cherono",
    "Okoth",
  ],
};
const MERU: Names = {
  first: [
    "Kendi",
    "Kawira",
    "Gatwiri",
    "Nkatha",
    "Karimi",
    "Makena",
    "Kagendo",
    "Mwendwa",
    "Mwiti",
    "Murithi",
    "Mutwiri",
    "Kirimi",
    "Muthomi",
    "Gitonga",
    "Mugambi",
    "Kinoti",
    "Koome",
  ],
  last: [
    "Mwiti",
    "Murithi",
    "Mutwiri",
    "Kirimi",
    "Gitonga",
    "Mugambi",
    "Kinoti",
    "Mutuma",
    "Koome",
    "Kaimenyi",
    "Muriuki",
    "Mbaabu",
    "Kiogora",
    "Mworia",
  ],
};

// The groups the team's research names for each place (Kenya Electoral Strategy Research, 2026).
const GITHUNGURI_SEGMENTS: Config["segments"] = [
  ["dairy", "Dairy farmers", "Members of the dairy co-operative (Fresha)", "#1F6F4A"],
  ["tea-coffee", "Tea and coffee growers", "KTDA tea and coffee society members", "#3D7A6B"],
  ["women", "Women's groups", "Chamas, church guilds and welfare groups", "#7A4FB5"],
  ["youth", "Youth 18-34", "First and second time voters", "#C99A2E"],
  ["faith", "Church networks", "PCEA, Catholic and ACK congregations", "#2B6CB0"],
  ["boda", "Boda riders", "Motorcycle taxi operators and stage committees", "#D9481C"],
];
const ROYSAMBU_SEGMENTS: Config["segments"] = [
  ["students", "Students", "USIU-Africa, PAC University and Kenyatta University", "#B0324B"],
  ["tenants", "Young professionals", "Renters in apartments and gated courts", "#2B6CB0"],
  [
    "residents",
    "Residents' associations",
    "Resident welfare associations and court committees",
    "#3D7A6B",
  ],
  ["traders", "Businesses", "Traders along TRM, Lumumba and Mirema drives", "#1F6F4A"],
  ["boda", "Boda riders", "Motorcycle taxi operators and stage committees", "#D9481C"],
  ["women", "Women's groups", "Chamas and church groups", "#7A4FB5"],
];
const ATHWANA_SEGMENTS: Config["segments"] = [
  ["miraa", "Miraa growers", "Growers, traders and transporters", "#1F6F4A"],
  ["herders", "Livestock keepers", "Agropastoral herders and the livestock market", "#8B5E3C"],
  ["women", "Women's self-help groups", "Self-help groups and church fellowships", "#7A4FB5"],
  ["youth", "Youth 18-34", "First and second time voters", "#C99A2E"],
  ["elders", "Elders", "Njuri Ncheke and clan elders", "#3D7A6B"],
  ["traders", "Market traders", "Stall holders and market traders", "#2B6CB0"],
];

const CONFIGS: Config[] = [
  {
    id: "ca000000-0000-4000-8000-000000000004",
    slug: "githunguri",
    mapArea: "kiambu/githunguri",
    people: 80,
    doors: 125,
    names: KIKUYU,
    segments: GITHUNGURI_SEGMENTS,
    places: [
      {
        title: "Githunguri town market walkabout",
        kind: "market",
        ward: "githunguri",
        note: "Market day: the traders' lines before the crowds",
      },
      {
        title: "Milk collection centre, Komothai",
        kind: "visit",
        ward: "komothai",
        note: "Farmers at the morning delivery: milk prices",
      },
      {
        title: "Women's group meeting, Ngewa",
        kind: "meeting",
        ward: "ngewa",
        note: "Bursaries and safety",
      },
      {
        title: "Sunday service, Githiga",
        kind: "church",
        ward: "githiga",
        note: "Greet the congregation after the service",
      },
      {
        title: "Youth fellowship, Ikinu",
        kind: "church",
        ward: "ikinu",
        note: "Young men: jobs and the boda stage",
      },
      {
        title: "Kameme FM breakfast show",
        kind: "media",
        ward: "githunguri",
        note: "Dairy prices and the bursary fund",
      },
      {
        title: "Tea buying centre, Githiga",
        kind: "visit",
        ward: "githiga",
        note: "Second payment questions",
      },
    ],
    expenses: [
      ["Fuel for Saturday's Komothai meeting", "transport", "Total Githunguri", 18_500, "pending"],
      ["Hall hire, Ngewa women's group", "events", "Ngewa Social Hall", 12_000, "pending"],
      [
        "Printing: bursary posters (2,000)",
        "merchandise",
        "Githunguri Printers",
        46_000,
        "approved",
      ],
      ["Bulk SMS credit", "comms", "Africa's Talking", 30_000, "paid"],
      ["Sound system, market walkabout", "events", "Kiambu Sound Hire", 15_000, "paid"],
    ],
    inbox: [
      ["Milk prices", "Bei ya maziwa imeshuka tena, tusaidieni.", "milk", "negative"],
      ["Bursary application", "Naomba msaada wa bursary kwa mwanangu.", "bursaries", "neutral"],
      ["Road to Gathugu", "Barabara ya Gathugu haipitiki baada ya mvua.", "roads", "negative"],
      ["Thank you for the visit", "Asante kwa kututembelea Ikinu jana.", "general", "positive"],
      ["Jobs for youth", "Vijana wa Ngewa wanahitaji kazi.", "jobs", "neutral"],
      ["Water at Kiairia", "Maji hayajatoka Kiairia kwa wiki moja.", "water", "negative"],
    ],
    poll: {
      question: "What should the MP fix first in Githunguri?",
      questionSw: "Mbunge ashughulikie nini kwanza Githunguri?",
      options: [
        ["milk", "Milk prices"],
        ["roads", "Roads"],
        ["water", "Water"],
        ["jobs", "Jobs for youth"],
        ["bursaries", "Bursaries"],
      ],
    },
  },
  {
    id: "ca000000-0000-4000-8000-000000000005",
    slug: "roysambu",
    mapArea: "nairobi/roysambu/roysambu",
    people: 220,
    doors: 330,
    names: NAIROBI,
    segments: ROYSAMBU_SEGMENTS,
    places: [
      {
        title: "Thika Road service lane walk",
        kind: "visit",
        ward: "roysambu",
        note: "Flooded lanes with residents",
      },
      {
        title: "Garden Estate residents' association",
        kind: "meeting",
        ward: "roysambu",
        note: "Water rationing list",
      },
      {
        title: "Marurui market walkabout",
        kind: "market",
        ward: "roysambu",
        note: "Traders and the parking fee",
      },
      {
        title: "Women's group, church centre",
        kind: "meeting",
        ward: "roysambu",
        note: "Bring two neighbours each",
      },
      {
        title: "Youth football, Marurui",
        kind: "rally",
        ward: "roysambu",
        note: "Be seen at the final",
      },
      {
        title: "Sunday service, Garden Estate",
        kind: "church",
        ward: "roysambu",
        note: "Greet the congregation",
      },
      {
        title: "Ghetto Radio drive show",
        kind: "media",
        ward: "roysambu",
        note: "Drains and the ward fund",
      },
    ],
    expenses: [
      ["Tea and hall, women's group meeting", "events", "Garden Estate Hall", 8_500, "pending"],
      ["Drains list flyers (1,000)", "merchandise", "TRM Printers", 9_000, "pending"],
      ["Bulk SMS credit", "comms", "Africa's Talking", 12_000, "paid"],
      ["Transport, centre captains", "transport", "Petty cash", 6_000, "approved"],
    ],
    inbox: [
      [
        "Flooding in our lane",
        "Every rain the lane becomes a river, tusaidie.",
        "drainage",
        "negative",
      ],
      ["Water in Garden Estate", "Maji yanakuja Jumanne na Ijumaa tu.", "water", "negative"],
      ["Garbage", "Taka hazijachukuliwa tangu Jumatatu.", "garbage", "negative"],
      ["Street lights", "Bypass iko giza usiku, ni hatari.", "lighting", "negative"],
      ["Bursary form", "Fomu ya bursary inapatikana wapi?", "bursaries", "neutral"],
    ],
    poll: {
      question: "What should the MCA fix first in Roysambu ward?",
      questionSw: "Diwani ashughulikie nini kwanza Roysambu?",
      options: [
        ["drainage", "Drains and flooding"],
        ["water", "Water"],
        ["garbage", "Garbage"],
        ["lighting", "Street lights"],
        ["jobs", "Jobs for youth"],
      ],
    },
  },
  {
    id: "ca000000-0000-4000-8000-000000000006",
    slug: "athwana",
    mapArea: "meru/tigania-west/athwana",
    people: 110,
    doors: 170,
    names: MERU,
    segments: ATHWANA_SEGMENTS,
    places: [
      {
        title: "Kadebene livestock market",
        kind: "market",
        ward: "athwana",
        note: "Herders before the trading starts",
      },
      {
        title: "Kibiru borehole with residents",
        kind: "visit",
        ward: "athwana",
        note: "Photos for the update",
      },
      {
        title: "Miraa buying centre, Limoro",
        kind: "visit",
        ward: "athwana",
        note: "Farm-gate prices",
      },
      {
        title: "Women's group, Mwanika",
        kind: "meeting",
        ward: "athwana",
        note: "Bring two neighbours each",
      },
      {
        title: "Youth fellowship, Maitha",
        kind: "church",
        ward: "athwana",
        note: "Young men: jobs",
      },
      {
        title: "Chief's baraza on cattle theft",
        kind: "meeting",
        ward: "athwana",
        note: "Back the chief's plan",
      },
      {
        title: "Muuga FM morning show",
        kind: "media",
        ward: "athwana",
        note: "Miraa prices and the ward fund",
      },
    ],
    expenses: [
      ["Transport, women's group meeting", "transport", "Petty cash", 6_000, "pending"],
      ["Tea for the baraza", "events", "Athwana Hotel", 4_500, "pending"],
      ["Bulk SMS credit", "comms", "Africa's Talking", 5_000, "paid"],
    ],
    inbox: [
      ["Miraa prices", "Bei ya miraa imeshuka tena.", "jobs", "negative"],
      ["Kibiru borehole", "Borehole ya Kibiru imeharibika wiki mbili.", "water", "negative"],
      ["Road to Kiare", "Barabara ya Kiare imeharibiwa na mvua.", "roads", "negative"],
      ["Cattle theft", "Ng'ombe wameibiwa tena karibu na Isiolo.", "security", "negative"],
    ],
    poll: {
      question: "What should the MCA fix first in Athwana?",
      questionSw: "Diwani ashughulikie nini kwanza Athwana?",
      options: [
        ["prices", "Miraa and farm prices"],
        ["water", "Water"],
        ["roads", "Roads"],
        ["security", "Cattle theft"],
        ["bursaries", "Bursaries"],
      ],
    },
  },
];

// A small seeded generator, so the same command writes the same file.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const ISSUES = ["Water", "Roads", "Jobs", "Bursaries", "Security", "Health", "Rubbish", "Lighting"];

async function houses(mapArea: string, shapes: WardShape[]) {
  const area = MAP_AREAS.find((a) => a.key === mapArea)!;
  const file = new Uint8Array(readFileSync(`public${area.houses}`));
  const archive = await openArchive(async (o, l) => file.subarray(o, o + l), gunzip);
  const [west, south, east, north] = area.bounds;
  const [x0, y0] = toTileSpace([west, north]).map(Math.floor) as [number, number];
  const [x1, y1] = toTileSpace([east, south]).map(Math.floor) as [number, number];
  const byWard = new Map(shapes.map((s) => [s.slug, [] as { pc: string; at: [number, number] }[]]));
  const seen = new Set<string>();
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const bytes = await archive.getTile(HOUSE_ZOOM, x, y);
      if (!bytes) continue;
      for (const h of decodeTile(x, y, bytes)) {
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        const w = shapes.find((s) => s.polygons.some((p) => inPolygon(h.centre, p)));
        if (w) byWard.get(w.slug)!.push({ pc: h.id, at: h.centre });
      }
    }
  return byWard;
}

async function campaignSql(c: Config): Promise<string> {
  const r = rng([...c.slug].reduce((t, ch) => t * 31 + ch.charCodeAt(0), 7));
  const area = MAP_AREAS.find((a) => a.key === c.mapArea)!;
  const shapes = wardShapes(JSON.parse(readFileSync(`public${area.wards}`, "utf8")));
  const byWard = await houses(c.mapArea, shapes);
  const ward = (slug: string) =>
    `(select id from public.wards where campaign_id = ${q(c.id)} and slug = ${q(slug)})`;
  const out: string[] = [`-- ${c.slug}`];

  out.push(
    `insert into public.segments (campaign_id, slug, name, description, colour)
select ${q(c.id)}, v.slug, v.name, v.description, v.colour from (values
${c.segments.map((s) => `  (${s.map(q).join(", ")})`).join(",\n")}
) as v(slug, name, description, colour)
where not exists (select 1 from public.segments s where s.campaign_id = ${q(c.id)} and s.slug = v.slug);`,
  );

  // The houses, compactly: the database works out everything else about each one from
  // md5(campaign slug, plus code), so the file stays small and the same input gives the same rows.
  const rows: string[] = [];
  let n = 0;
  let knocked = 0;
  for (const s of shapes) {
    const pool = [...byWard.get(s.slug)!];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    pool.slice(0, c.doors).forEach((h, i) => {
      rows.push(`${h.pc},${h.at[1].toFixed(5)},${h.at[0].toFixed(5)},${s.slug},${i}`);
      if (i < c.people) n++;
      if (i < Math.round(c.doors * 0.8)) knocked++;
    });
  }
  const arr = (xs: readonly string[]) => `array[${xs.map(q).join(", ")}]`;
  out.push(`drop table if exists pg_temp.sample_houses, pg_temp.sample_doors;
create temporary table sample_houses as
with raw as (
  select string_to_array(x, ',') f from unnest(string_to_array(${q(rows.join(";"))}, ';')) x
)
select f[1] as pc, f[2]::double precision as lat, f[3]::double precision as lng, f[4] as ward,
       f[5]::int as i, md5(${q(c.slug)} || ':' || f[1]) as h
  from raw;

-- Byte k of a house's hash, 0 to 255.
create or replace function pg_temp.byte(h text, k int) returns int language sql immutable as
  $$ select ('x' || substr(h, 1 + 2 * k, 2))::bit(8)::int $$;

create temporary table sample_doors as
select s.*, w.id as ward_id,
       case when pg_temp.byte(h, 0) < 158 then 'spoke' when pg_temp.byte(h, 0) < 230 then 'not_home' else 'refused' end as outcome,
       pg_temp.byte(h, 1) % 24 as day, 480 + (pg_temp.byte(h, 2) * 2) as minute
  from sample_houses s
  join public.wards w on w.campaign_id = ${q(c.id)} and w.slug = s.ward;

insert into public.people
  (id, campaign_id, phone, full_name, ward_id, segment, source, support_score, language,
   building_id, lat, lng, placed_at, tags, consent_sms, consent_whatsapp, consent_call)
select md5('sample:' || d.h)::uuid, ${q(c.id)}, '+2547' || lpad((('x' || substr(d.h, 9, 8))::bit(32)::bigint % 100000000)::text, 8, '0'),
       (${arr(c.names.first)})[1 + pg_temp.byte(d.h, 5) % ${c.names.first.length}] || ' ' ||
       (${arr(c.names.last)})[1 + pg_temp.byte(d.h, 6) % ${c.names.last.length}],
       d.ward_id, (${arr(c.segments.map((x) => x[0]))})[1 + pg_temp.byte(d.h, 7) % ${c.segments.length}],
       (array['door', 'door', 'door', 'ussd', 'web_poll', 'manual'])[1 + pg_temp.byte(d.h, 8) % 6],
       case when d.outcome = 'spoke' then 20 + pg_temp.byte(d.h, 3) % 80 else pg_temp.byte(d.h, 3) % 50 end,
       case when pg_temp.byte(d.h, 9) < 154 then 'sw' else 'en' end,
       d.pc, d.lat, d.lng, now(), '{sample}', false, false, false
  from sample_doors d
 where d.i < ${c.people}
on conflict do nothing;

insert into public.house_visits
  (client_id, campaign_id, pc, ward_id, person_id, outcome, support, issue, visited_at, lat, lng)
select md5('sample-visit:' || d.h)::uuid, ${q(c.id)}, d.pc, d.ward_id,
       case when d.i < ${c.people} then md5('sample:' || d.h)::uuid end, d.outcome,
       case when d.outcome = 'spoke' then 1 + least(4, (20 + pg_temp.byte(d.h, 3) % 80) / 20) end,
       case when d.outcome = 'spoke' and pg_temp.byte(d.h, 4) < 180
            then (${arr(ISSUES)})[1 + pg_temp.byte(d.h, 10) % ${ISSUES.length}] end,
       now() - make_interval(days => d.day) - make_interval(mins => d.minute), d.lat, d.lng
  from sample_doors d
 where d.i < ${Math.round(c.doors * 0.8)}
   and not exists (select 1 from public.house_visits v where v.client_id = md5('sample-visit:' || d.h)::uuid);

insert into public.person_events (client_id, campaign_id, person_id, kind, detail, created_at)
select v.client_id, v.campaign_id, v.person_id, 'door_' || v.outcome, case when v.outcome = 'spoke' then v.issue end, v.visited_at
  from public.house_visits v
 where v.campaign_id = ${q(c.id)} and v.person_id is not null
   and v.client_id in (select md5('sample-visit:' || h)::uuid from sample_doors)
   and not exists (select 1 from public.person_events e where e.client_id = v.client_id);

drop table pg_temp.sample_houses, pg_temp.sample_doors;`);

  // The diary: yesterday back a few days, and the week ahead.
  const diary = [-3, -1, 0, 0, 1, 2, 3, 4, 6].map((d, i) => {
    const p = c.places[i % c.places.length]!;
    const hour = [7, 10, 13, 16, 18][i % 5]!;
    return `  ((now() at time zone 'Africa/Nairobi')::date + ${d}, '${String(hour).padStart(2, "0")}:00', ${q(p.title)}, ${q(p.kind)}, ${q(p.ward)}, ${q(`${p.note} (sample)`)})`;
  });
  out.push(`insert into public.diary_entries (campaign_id, day, starts_at, title, kind, ward_id, note)
select ${q(c.id)}, v.day, v.starts_at::time, v.title, v.kind, ${`(select id from public.wards w where w.campaign_id = ${q(c.id)} and w.slug = v.ward)`}, v.note
  from (values
${diary.join(",\n")}
  ) as v(day, starts_at, title, kind, ward, note)
 where not exists (select 1 from public.diary_entries d where d.campaign_id = ${q(c.id)} and d.note like '%(sample)');`);

  out.push(`insert into public.expenses (campaign_id, description, category, vendor, amount_kes, status, reference, incurred_at)
select ${q(c.id)}, v.* from (values
${c.expenses.map((e, i) => `  (${q(e[0])}, ${q(e[1])}, ${q(e[2])}, ${e[3]}, ${q(e[4])}, ${q(`SAMPLE-${c.slug.toUpperCase()}-${i + 1}`)}, now() - interval '${i * 3} days')`).join(",\n")}
  ) as v(description, category, vendor, amount_kes, status, reference, incurred_at)
 where not exists (select 1 from public.expenses x where x.campaign_id = ${q(c.id)} and x.reference = v.reference);`);

  const donors = [
    ["Friends of the campaign (harambee)", "group", 85_000],
    ["Local business owners", "group", 40_000],
    ["Individual supporters (M-Pesa)", "individual", 26_500],
  ] as const;
  out.push(`insert into public.contributions (campaign_id, donor_name, donor_type, amount_kes, method, reference, received_at)
select ${q(c.id)}, v.* from (values
${donors.map((d, i) => `  (${q(d[0])}, ${q(d[1])}, ${Math.round((d[2] * c.people) / 200)}, 'mpesa', ${q(`SAMPLE-${c.slug.toUpperCase()}-C${i + 1}`)}, now() - interval '${4 + i * 5} days')`).join(",\n")}
  ) as v(donor_name, donor_type, amount_kes, method, reference, received_at)
 where not exists (select 1 from public.contributions x where x.campaign_id = ${q(c.id)} and x.reference = v.reference);`);

  out.push(`insert into public.conversations (campaign_id, person_id, channel, platform, subject, snippet, status, unread, last_message_at, issue, sentiment, tags)
select ${q(c.id)}, p.id, 'sms', 'sms', v.subject, v.snippet, 'open', v.unread, now() - make_interval(hours => v.hours), v.issue, v.sentiment, '{sample}'
  from (values
${c.inbox.map((m, i) => `  (${i + 1}, ${q(m[0])}, ${q(m[1])}, ${q(m[2])}, ${q(m[3])}, ${i % 2 === 0}, ${3 + i * 7})`).join(",\n")}
  ) as v(n, subject, snippet, issue, sentiment, unread, hours)
  join lateral (select id from public.people where campaign_id = ${q(c.id)} and 'sample' = any(tags) order by id offset v.n limit 1) p on true
 where not exists (select 1 from public.conversations x where x.campaign_id = ${q(c.id)} and 'sample' = any(x.tags) and x.subject = v.subject);`);

  const code = `SAMPLE-${c.slug.toUpperCase()}`;
  const opts = JSON.stringify(c.poll.options.map(([key, label]) => ({ key, label })));
  out.push(`insert into public.polls (campaign_id, code, question, question_sw, options, channels, status, lang, sample_target, opens_at, closes_at, launched_at)
select ${q(c.id)}, ${q(code)}, ${q(c.poll.question)}, ${q(c.poll.questionSw)}, ${q(opts)}::jsonb, '{sms}', 'closed', 'sw', ${c.people}, now() - interval '12 days', now() - interval '5 days', now() - interval '12 days'
 where not exists (select 1 from public.polls where campaign_id = ${q(c.id)} and code = ${q(code)});
insert into public.poll_responses (campaign_id, poll_id, person_id, ward_id, channel, option_key, created_at)
select p.campaign_id, (select id from public.polls where campaign_id = ${q(c.id)} and code = ${q(code)}), p.id, p.ward_id, 'sms',
       (array[${c.poll.options.map(([k]) => q(k)).join(", ")}])[
         case when b < 87 then 1 when b < 143 then 2 when b < 194 then 3 when b < 230 then 4 else 5 end],
       now() - interval '6 days' - make_interval(mins => (('x' || substr(md5(p.id::text), 9, 4))::bit(16)::int % 8000))
  from public.people p
  cross join lateral (select ('x' || substr(md5(p.id::text), 1, 2))::bit(8)::int as b) o
 where p.campaign_id = ${q(c.id)} and 'sample' = any(p.tags)
   and (('x' || substr(md5(p.id::text), 13, 2))::bit(8)::int) < 150
   and not exists (select 1 from public.poll_responses r where r.person_id = p.id);`);

  console.log(`${c.slug}: ${n} people, ${knocked} door visits, ${diary.length} diary stops`);
  return out.join("\n\n");
}

const [outPath, ...slugs] = process.argv.slice(2);
if (!outPath || !slugs.length) {
  console.error("usage: sample-activity.ts <out.sql> <slug>...");
  process.exit(2);
}
const parts: string[] = [];
for (const slug of slugs) {
  const c = CONFIGS.find((x) => x.slug === slug);
  if (!c) {
    console.error(`No sample activity for ${slug}`);
    process.exit(2);
  }
  parts.push(await campaignSql(c));
}
writeFileSync(
  outPath,
  `-- Sample activity for ${slugs.join(", ")}: invented, tagged, unreachable by message.\n-- Written by scripts/demo/sample-activity.ts; remove with supabase/seeds/sample-activity-remove.sql.\n\n${parts.join("\n\n")}\n`,
);
