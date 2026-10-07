# Election atlas data

Public facts about elections, loaded once into the shared atlas tables (schema 22). This
repository is public: only public figures go here, and nothing about any person, least of all
their ethnicity or tribe.

```
data/atlas/
  README.md          this file
  SOURCES.md         every document used, and everything looked for and not found
  blocs.csv          which coalition each party stood in, election by election (every county)
  <county>/          one folder per county, named by its key: nairobi, nyeri
    areas.csv  candidates.csv  results.csv  turnout.csv  register.csv  population.csv
    known-differences.csv      (optional) differences IEBC itself published, kept on purpose
  _sources/          the documents downloaded to read figures from; not committed
```

## The files

| File | Columns |
|------|---------|
| `areas.csv` | `key,level,name,parent,iebc_code` |
| `candidates.csv` | `id,election_id,seat,name,party,bloc` |
| `results.csv` | `candidate_id,area_key,votes` |
| `turnout.csv` | `election_id,area_key,registered,cast_votes,rejected_votes,valid_votes,source,source_url` |
| `register.csv` | `year,area_key,registered,source,source_url` |
| `population.csv` | `area_key,year,total,adults,young_adults,source,method` |
| `known-differences.csv` | `check,election_id,area_key,candidate_id,difference,reason` |
| `blocs.csv` (in `data/atlas/`, not in a county) | `year,party,bloc,source,source_url` |

## Rules

- **Keys** are paths of slugs: `nairobi`, `nairobi/dagoretti-north`,
  `nairobi/dagoretti-north/kileleshwa`. A slug is the IEBC name lower-cased, punctuation dropped,
  other gaps a hyphen (`Lang'ata` is `langata`); `scripts/atlas/slug.py` is the rule. `kenya` is
  added by the schema and stays out of `areas.csv`. A ward's slug is the one in `public/geo/*-wards.json`.
- **Elections** are `<year>-<race>`: 2013, 2017 and 2022; `president`, `governor`, `mp`. The 2017
  presidential race is the 8 August vote; the 26 October re-run is not loaded.
- **Candidates**: `id` is `<election_id>/<seat>/<slug of the name>`. `seat` is the area contested:
  `kenya` for president, the county for governor, the constituency for MP. `bloc` is the
  coalition the candidate's party stood in at that election (Jubilee and CORD in 2013, Jubilee and
  NASA in 2017, Kenya Kwanza and Azimio in 2022), as `blocs.csv` records it, with its source: the
  Registrar of Political Parties' or the Kenya Gazette's own list. A party with no row stands as
  itself, and an independent (no party) as `Independent`. The checker refuses any other bloc, so a
  coalition has one name in every county. Spell a party as the document does; a party spelt two
  ways needs a `blocs.csv` row for each.
- **Results** are votes where they were counted: a county or a constituency. A candidate's county
  row and constituency rows must agree (president and governor).
- **A blank is "not found"**, never a zero. Write `0` only where the document says 0.
- **File format**: UTF-8, comma-separated, the header on the first line; a text cell holds no
  backslash; no row is listed twice (the key columns of a file are unique). The checker and
  `build_sql.py` refuse the same things, so a county that passes the one builds with the other.
- **`source`** is written "Publisher, document title" (`IEBC, Presidential results by
  constituency 2022`); the screens keep the publisher. `source_url` is the https page or file.
- **Known differences**: `check` is `county_sum` (`difference` is what the county says minus what
  its constituencies add up to; give `candidate_id` and the county in `area_key`) or `cast_split`
  (`difference` is cast minus valid minus rejected; give `election_id` and `area_key`). A reason is
  required, and a difference nothing needs any more is refused.
- Figures come only from the publisher's own document: IEBC, the Kenya Gazette, WorldPop. A news
  report or a summary is not a source; what is not found stays blank and is listed in `SOURCES.md`.

## Commands

```
npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts            # checks every county
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi      # what was found, and the checks
python3 scripts/atlas/areas_from_map.py public/geo/nairobi-wards.json Nairobi data/atlas/nairobi/areas.csv
python3 scripts/atlas/ward_population.py public/geo/nairobi-wards.json data/atlas/nairobi/areas.csv \
  data/atlas/_sources/worldpop-<year> <year> "WorldPop, <dataset title and version>" data/atlas/nairobi/population.csv
python3 scripts/atlas/build_sql.py data/atlas/nairobi Nairobi supabase/migrations/<stamp>_atlas_nairobi.sql
```
