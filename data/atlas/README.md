# Election atlas data

Public facts about elections, loaded once into the shared atlas tables (schema 22). This
repository is public: only public figures go here, and no personal detail beyond a candidate's
name, party and votes. Nothing records anyone's ethnicity or tribe.

```
data/atlas/
  README.md          this file
  SOURCES.md         every document used, and everything looked for and not found
  blocs.csv          which coalition each party stood in, election by election (every county)
  <county>/          one folder per county, named by its key: nairobi, nyeri
    areas.csv  candidates.csv  results.csv  turnout.csv  register.csv  population.csv
    known-differences.csv      (optional) differences IEBC itself published, kept on purpose
  <product>.sha256   the SHA-256 of every file of a many-file product (WorldPop's grids); committed
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
  `nairobi/dagoretti-north/kileleshwa`. A slug is the name lower-cased, with accents, apostrophes,
  backticks and full stops dropped and any other run of characters that are not letters or digits
  made one hyphen (`Lang'ata` is `langata`, `Mwiyogo/Endarasha` is `mwiyogo-endarasha`);
  `scripts/atlas/slug.py` is the rule, and `checks.ts` has the same one. `kenya` is added by the
  schema and stays out of `areas.csv`. A ward's slug is the one in `public/geo/*-wards.json`, and
  the ward must sit under the constituency that map names (a map that names none, Mathira's,
  leaves the constituency to the files).
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
- **Figures** are whole numbers in ASCII digits, with no separators (a known difference's
  `difference` may start with `-`). Every `area_key`, `seat` and `candidate_id` must be in the
  files. The checker refuses: more votes cast than registered; more valid votes than cast; cast
  not equal to valid plus rejected when all three are given (unless recorded in
  `known-differences.csv`); candidates' votes above the valid votes.
- **Complete rows**: where an election has votes in an area, every candidate whose seat covers
  that area has a row there, and the area has a turnout row (that is where the source is). A
  candidate whose votes were not found makes the checker refuse the county: find the figure, or
  leave that election's rows out of the whole area, so that it reads "not found yet" and never 0%.
- **Shared candidates**: the presidential candidates (seat `kenya`) are in every county's
  `candidates.csv` and must be identical in all of them. Each county's migration upserts them, so the
  checker refuses a county that disagrees with another about one.
- **Limits**: the checker refuses what the database would (text lengths, whole numbers up to
  2,147,483,647, a key that begins with `kenya`), so a county that passes the checker applies.
- **File format**: UTF-8, comma-separated, the header on the first line; a text cell holds no
  backslash; no row is listed twice (the key columns of a file are unique). The checker and
  `build_sql.py` refuse the same things, so a county that passes the one builds with the other.
- **Also required**: `level` and `parent` follow the key (one part is a county, under `kenya`; two
  parts a constituency; three a ward; the parent is the key less its last part); every turnout,
  register and population row has a `source`; a known difference's `reason` and a population row's
  `method` are at least 10 characters.
- **Population figures are estimates**, never counts: WorldPop's grid summed inside each ward. The
  `method` column says so, and the screens label them as estimates.
- **`source`** is written "Publisher, document title" (`IEBC, Presidential results by
  constituency 2022`); the screens keep the publisher. `source_url` is the https page or file, and
  is blank only where the document has no web address.
- **Known differences**: `check` is `county_sum` (`difference` is what the county says minus what
  its constituencies add up to; give `candidate_id` and the county in `area_key`) or `cast_split`
  (`difference` is cast minus valid minus rejected; give `election_id` and `area_key`). A reason is
  required, and a difference nothing needs any more is refused.
- Figures come only from the publisher's own document: IEBC, the Kenya Gazette, WorldPop. A news
  report or a summary is not a source; what is not found stays blank and is listed in `SOURCES.md`.
- **Corrections**: loading only inserts and updates. A correction that removes a row, or renames a
  key (a re-spelt candidate name gives a new id), needs explicit `delete` statements, written by
  hand, in the new migration; otherwise the old row stays and its votes are counted twice.

## Commands

```
npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts            # checks every county
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi      # what was found, and the checks
python3 scripts/atlas/areas_from_map.py public/geo/nairobi-wards.json Nairobi data/atlas/nairobi/areas.csv
# a ward map that names no constituency (Mathira's) needs one named, and the others listed bare
python3 scripts/atlas/areas_from_map.py public/geo/mathira-wards.json Nyeri data/atlas/nyeri/areas.csv \
  --constituency Mathira --also Kieni --also Mukurweini --also "Nyeri Town" --also Othaya --also Tetu
# needs rasterio and numpy (pip install rasterio numpy, in a virtual environment)
python3 scripts/atlas/ward_population.py public/geo/nairobi-wards.json data/atlas/nairobi/areas.csv \
  data/atlas/_sources/worldpop-<year> <year> "WorldPop, <dataset title and version>" data/atlas/nairobi/population.csv
python3 scripts/atlas/build_sql.py data/atlas/nairobi Nairobi supabase/migrations/<stamp>_atlas_nairobi.sql
```
