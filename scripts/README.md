# Scripts

Run everything from the repository root. TypeScript scripts run with
`node_modules/.bin/tsx --tsconfig tsconfig.json <script> …`; each file's opening comment gives its
exact arguments. Nothing here writes to the production database: scripts that load data write a
migration (or a SQL file) for you to read and apply.

## Repeatable: run again when the source changes

| Script | What it makes |
| --- | --- |
| `atlas/build-sql.ts` | A migration loading the election atlas folders under `data/atlas`, once their figures pass the checks. |
| `atlas/report.ts` | `data/atlas/REPORT.md`: what each county has loaded, what is missing, and every source. |
| `atlas/areas.ts` | `areas.csv` rows for every ward in a ward map. |
| `atlas/population.ts` | A ward's WorldPop 2020 age-and-sex estimate as an atlas `population.csv`. |
| `atlas/buildings.ts` | Each ward's building figures from its house file. |
| `stations/register.ts` | IEBC's register by polling station into `data/stations/<area>.csv`. |
| `stations/positions.ts` | Polling centre positions from OpenStreetMap schools and colleges. |
| `stations/build-sql.ts` | The migration loading `data/stations`. |
| `geo/house-tiles.ts` | The house files `public/tiles/houses-<area>.pmtiles` from Google Open Buildings v3. |
| `geo/ward-map.ts` | A ward campaign's own map and its nearest-centre demo map. |
| `geo/demo_maps.py`, `geo/nairobi_wards.py` | County and ward outlines from geoBoundaries (Python 3; run in a folder holding the inputs each names). |

`atlas/read.ts`, `stations/read.ts` and `stations/areas.ts` are read by the scripts above and the
data tests; they are not run on their own.

## One-off: demo workspaces

`demo/sample-activity.ts <out.sql> <slug>…` writes invented activity (supporters on real houses,
door knocks, a diary week, money, an inbox, a poll) for the named campaigns. Every row it writes is
marked so `supabase/seeds/sample-activity-remove.sql` can remove it; no sample person has agreed to
be contacted, so nothing a campaign sends reaches the numbers.

## Checks

| Script | What it tells you |
| --- | --- |
| `seo/check.mjs` | How the live site (or a preview, with `--base http://127.0.0.1:5199`) meets a crawler that does not run JavaScript: the content and head in the raw HTML, structured data, robots.txt, sitemap.xml, llms.txt, redirects and speed. Run `npm run seo:check`; any `FAIL` exits 1. |
