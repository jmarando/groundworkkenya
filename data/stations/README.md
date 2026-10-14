# Polling centres

One file per map area (`src/lib/map-areas.ts`): `nairobi.csv` and `mathira.csv`, one row per
polling centre, read from IEBC's register of voters per polling station for the 2022 General
Election (`https://www.iebc.or.ke/docs/rov_per_polling_station.pdf`, 712 pages, dated 3 August
2022).

| Column       | What it holds                                                                  |
| ------------ | ------------------------------------------------------------------------------ |
| `iebc_code`  | IEBC's 13 digits: county 3, constituency 3, ward 4, centre 3                   |
| `code`       | The short code agents key on USSD and write on a form's photo: PS-0001 upwards |
| `name`       | The centre as the register spells it                                           |
| `ward`       | Our ward's slug (`public/geo/<area>-wards.json`)                               |
| `streams`    | How many streams (polling stations) the centre has                             |
| `registered` | The voters registered to its streams, added up                                 |

Every ward's centres add up to the registered voters the atlas holds for it
(`data/atlas/<county>/register.csv`): Nairobi 378 centres, 3,643 streams and 2,415,310 voters;
Mathira 109 centres, 201 streams and 104,492 voters.

To read the register again:

```bash
pdftotext -tsv rov_per_polling_station.pdf /tmp/rov.tsv
npx tsx --tsconfig tsconfig.json scripts/stations/register.ts /tmp/rov.tsv
```

The reader (`src/lib/stations/register.ts`) goes by where each word is on the page, because
long names run into the next column: a stream's code is the 15 digits a word ends with, and its
count the digits ending the word at the count column. IEBC spells one of our wards differently
(MUGUMU-INI for Mugumo-ini); `WARD_ALIASES` there maps it.

## Where the centres are

`<area>-positions.csv` holds the centres whose position was found from OpenStreetMap's
schools, colleges and universities (© OpenStreetMap contributors, published under the Open
Database License, ODbL): `iebc_code`, `lat`, `lng`, `placed_by` (`osm` for the same name,
`osm-close` for a name one word off, or the same name in two places more than 500 m apart,
kept as a hollow pin until someone confirms it), and the school's `osm_id` and `osm_name`.
These positions are a database derived from OpenStreetMap, and are published under the ODbL
too. The rules are in `src/lib/stations/match.ts`. On 14 October 2026 they placed 164 of
Nairobi's 378 centres, with 27 close names, and 8 of Mathira's 109: Mathira's rural schools are
mostly not on OpenStreetMap. Organisers place the rest on the Voters map ("Place it"), and agents
confirm them at the centre ("I'm here").

To find them again:

```bash
npx tsx --tsconfig tsconfig.json scripts/stations/positions.ts
```
