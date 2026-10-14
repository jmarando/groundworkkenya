# Area profiles and class indicators (insights, part 1)

Status: designed with the user on 9 October 2026; this spec awaits their review.

## Why

The user wants Groundwork to give the candidate insight, not just figures. That means the
"so what" behind the numbers, and options to consider, for four decisions:

- where to spend time
- what to say where
- where to put field work and money
- how to respond to rivals and polls

The candidate or manager should also be able to ask open strategy questions ("what's our
strategy in Dagoretti North?", "what lines should I take in Kawangware?", "what should we find
out next?").

The advice must not be naive. Places inside one constituency differ by class and by community:
Kileleshwa and Kawangware are both in Dagoretti North, and the same advice can't serve both.
Part 1 gives Groundwork that place context. Later parts build on it.

## The three parts

1. **Area profiles and class indicators** (this spec): the team's profile of each place, and
   measured signals of how each place lives.
2. **Findings engine:** plain code turns everything Groundwork holds into numbered findings
   with figures and sources, shown as one-line "so whats" on Home, Elections, Voters, the
   Diary and the War room. No AI is involved.
3. **Strategy page:** a weekly strategy brief with options, and an ask box. The AI, through
   Lovable's AI gateway (as listening and the morning story already use), writes only from
   the findings and profiles. A checker drops any figure not in the findings and any option
   that cites none. Only aggregates are sent, never a voter's personal data.

## Decisions

- **Approach:** a findings engine with AI writing on top, built in the three parts above, in
  that order.
- **Who:** the guidance and the profiles are for the whole team except field agents: the
  super admin, candidate, manager and organisers.
- **Community and class:** the team's profiles plus measured indicators, each shown as what it
  is.
- **Tribe:** tribe matters to how places vote, so it enters the guidance as context about
  places, never about people.
  - Nothing ever records or guesses a person's tribe, including from their name. The Data
    Protection Act 2019 treats ethnic origin as sensitive personal data.
  - The 2019 census publishes ethnicity nationally only, so community context for a ward comes
    from the team's knowledge of the place. How each area voted over three elections is
    already a strong, lawful signal.
  - The guidance (parts 2 and 3) may tailor engagement: whom to reach, which associations,
    which languages, which local voices. It never produces messaging that disparages a
    community or sets communities against each other, under the NCIC Act 2008 and IEBC's
    Electoral Code of Conduct.

## Success

- Every Nairobi ward, and each of Mathira's six, shows its measured building density and
  building size and its people per km². Kileleshwa and Kawangware read clearly different.
- The candidate, manager and organisers can write a profile for any ward or constituency.
  Field agents can't read profiles, and no campaign sees another's.
- A missing figure never reads as zero.

## 1. Area profiles (each campaign's own)

One profile per place (any atlas area: a ward, a constituency or a county) per campaign.

| Field | Kind |
|---|---|
| Settlement type | one of: high-income residential, middle-income estates, low-income estates, informal settlement, mixed, peri-urban or rural, commercial |
| Communities in the area | text, up to 500 characters |
| Languages commonly used | any of: English, Swahili, Sheng, Kikuyu, Dholuo, Luhya, Kamba, Ekegusii, Somali, Kalenjin, Meru, other |
| Institutions and influencers | text, up to 1,000 characters (churches, mosques, chamas, welfare groups, SACCOs, market and youth leaders) |
| Local issues | text, up to 500 characters |
| Who updated it, and when | set on save |

Table `area_profiles`:

- `id`, `campaign_id` (default `my_campaign()`), `area_key` (references `atlas_areas`).
- `settlement`: null, or one of `high-income`, `middle-income`, `low-income`, `informal`,
  `mixed`, `peri-urban`, `commercial`.
- `communities` (≤ 500), `institutions` (≤ 1000), `issues` (≤ 500): null or text within the
  limit.
- `languages`: a text array, a subset of `en`, `sw`, `sheng`, `kikuyu`, `luo`, `luhya`,
  `kamba`, `kisii`, `somali`, `kalenjin`, `meru`, `other`.
- `updated_by`, `updated_at`.
- Unique per campaign and area.

Policies:

- The usual restrictive "own campaign only".
- Read and write for `my_campaign_role()` in `super`, `candidate`, `manager`, `organiser`.
- Nothing for agents.

## 2. Measured indicators (the shared atlas)

Public figures, stored with the rest of the atlas (no `campaign_id`, readable by any team, written only by
migrations).

| Indicator | What it is |
|---|---|
| `area_km2` | the area's size, from its ward boundaries (geoBoundaries, CC BY 4.0) |
| `buildings` | buildings whose centre lies in the area, at confidence 0.65 or more (Google's threshold) |
| `buildings_per_km2` | buildings ÷ area |
| `median_building_m2` | the median building footprint |
| `small_building_share` | the share of buildings under 40 m² |
| `large_building_share` | the share of buildings of 200 m² or more |

- **Source:** Google Open Buildings v3 (CC BY 4.0), released in 2023, so year 2023.
- **Coverage:** every ward with a ward map, which is Nairobi's 85 and Mathira's 6. A
  constituency is computed from all its wards' buildings, not by averaging its wards. Nyeri's
  other constituencies have no ward map yet.
- **People per km²:** worked out in the app from the WorldPop population and `area_km2`; it
  isn't stored.
- **Table `atlas_indicators`:** `area_key`, `indicator` (one of the six), `year` (2000–2030),
  `value` (≥ 0; shares ≤ 1), `source_id`. The primary key is area, indicator and year.
- **Files:** `data/atlas/<county>/indicators.csv` (`area,indicator,year,value,source`), checked
  by `checkAtlas` and loaded by `build-sql.ts` as for the rest of the atlas. `REPORT.md` says
  how many wards are measured.
  - Values are decimals with a point and no thousands separators.
  - Counts are whole numbers, `area_km2` has three decimals, `median_building_m2` is whole
    square metres, and shares have three decimals.
- **The script:**
  - `scripts/atlas/buildings.ts` streams Google's gzipped CSV for a tile. It reads only the
    first four columns: latitude, longitude, area and confidence.
  - It assigns each building to the ward its centre falls in.
  - It writes the indicators.
  - The arithmetic lives in a pure module, tested in `npm test`.
- **Downloads:** Nairobi is tile 183, 1.76 GB compressed, downloaded once only with the
  user's go-ahead. Mathira's tile is found from Open Buildings' tile index.
- **Census figures are out of part 1.** Nairobi's 11 census sub-counties don't line up with its
  17 constituencies, and they don't separate wards within one.

## 3. Screens

- **Elections ward page:** an "About this place" card beside "Who lives here".
  - Measured: buildings per km², median building size, the small and large shares, and
    people per km². Each is compared with the median of the county's measured wards ("3×
    Nairobi's median density"); a constituency's card compares with the county's measured
    constituencies. Each figure carries its source tag.
  - Profile: the five fields, who updated them and when. An Edit button shows for candidate,
    manager and organisers.
- **Elections constituency page:**
  - the same card for the constituency as a whole
  - three new columns in "Its wards": buildings per km², median building size, and the
    team's settlement type
- **Profile editor:** a panel like the note box.
  - The settlement-type picker, language checkboxes, and three text boxes with character
    counters.
  - The standing reminder: "About the place, never about a person. Don't record anyone's
    tribe."
- **Data flow:** profiles and indicators load with the atlas (`loadAtlas`). A new
  `saveProfile` server function validates the fields and checks the role before writing; the
  database checks again.
- **Field agents:** they don't reach any of this, because Elections is closed to them.

## Errors

- A place without buildings data: "not measured yet", never 0.
- A ward without a ward map (Nyeri outside Mathira): "no ward map yet".
- An empty profile: says it hasn't been filled in, and invites the team to add what they know.
- A refused save (too long, or not allowed for this role): the reason, inline.

## Testing

- **The building arithmetic:** a small made-up tile with two small wards, with the expected
  counts, areas, medians and shares worked out by hand.
- **The data checks:** an unknown indicator, an unknown place, a share outside 0–1, a negative
  value, a duplicate and an unlisted source are refused.
- **SQL:**
  - An organiser reads and writes their own campaign's profiles.
  - An agent can't read them.
  - Another campaign never sees them.
  - The text limits and allowed values hold.
  - `atlas_indicators` is readable by the team and writable by no one signed in.
- **The screens' logic:** people per km², the comparisons with the county's median, profile
  validation and the empty states.
- **The preview:** desktop and phone width.

## Data (schema 23, then the indicators)

Schema 23 creates `area_profiles` and `atlas_indicators` with their policies and the version
bump; `atlas_indicators` joins the list of campaign-less tables in `tests/sql/access.test.sql`.
The indicators load in a separate data migration made by `build-sql.ts`. Lovable applies both,
asked in its chat, before the code that reads them ships.

## Build order

1. Schema 23 and its SQL tests.
2. The building arithmetic and its tests, then the script.
3. With the user's go-ahead, download Nairobi's tile and find and download Mathira's. Write the
   indicators, then the checks, the report and the data migration.
4. `saveProfile` and its validation.
5. The screens, then a look in the preview.
6. The release.

## Not now

- The findings engine (part 2) and the Strategy page with the ask box (part 3).
- Census sub-county figures, night-time lights, and anything else beyond the six indicators.
- Any data on the ethnicity of people, ever.
