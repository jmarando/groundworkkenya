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
