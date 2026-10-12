# The election atlas's figures

Public figures only: this repository is public. Each folder is one county (`kenya` holds the
country itself, the presidential candidates and national totals, and sources several counties
share). `scripts/atlas/build-sql.ts` turns folders into a migration once
`tests/atlas-data.test.ts` passes; `scripts/atlas/report.ts` writes `REPORT.md`.

## Files (every one optional, every header exact)

- `sources.csv` — `id,title,publisher,url,note`: one row per document. Ids are lower case with
  dashes, e.g. `iebc-2022-form-37c-nairobi`.
- `areas.csv` — `key,level,name,parent,iebc_code`: `kenya`; counties (`nairobi`, parent
  `kenya`); constituencies (`nairobi/westlands`); wards (`nairobi/westlands/kangemi`, the slug
  from the ward map). `scripts/atlas/areas.ts` prints the constituency and ward rows.
- `candidates.csv` — `election,seat,name,party,bloc`: elections are `2013-president` …
  `2022-mp`; the seat is `kenya` for president, the county for governor, the constituency for
  MP.
- `results.csv` — `election,seat,candidate,area,votes,source`: votes where they were counted
  (a constituency or the county total), whole numbers with no commas.
- `turnout.csv` — `election,area,registered,cast_votes,rejected,valid,source`: blanks for what
  the document doesn't give.
- `register.csv` — `year,area,registered,source`: registered voters, by ward and above.
- `population.csv` — `area,year,total,adults,young_adults,source`: WorldPop estimates, written
  by `scripts/atlas/population.ts`.
- `known-differences.csv` — `election,seat,candidate,area,difference,note`: a sum that doesn't
  add up in IEBC's own documents, with the exact difference (total minus its parts) and what
  the documents say. For a turnout row whose valid and rejected don't make cast, leave seat and
  candidate empty. The note must say why; once the figures add up, the checker asks for the row
  to go.
- `blocs.csv`, in `data/atlas` itself rather than a county's folder — `year,party,bloc,source,source_url`:
  the coalition each party stood in at one general election, so a coalition has one name in
  every county. `source` reads "Publisher, document title"; `source_url` is an https link or
  blank. It isn't loaded into the database: the bloc travels in `candidates.csv`, and the
  checker holds each candidate to it.

## Rules

- A figure comes from a document listed in `sources.csv`, or it isn't entered. Nothing is
  estimated from other figures, averaged or filled in.
- Prefer IEBC's own documents (results forms 34B/34C, 35B, 37B/37C; published results and
  registers; post-election reports) and the Kenya Gazette. A media tally or open dataset is
  used only to fill a gap, with its own publisher, and the report flags it.
- List every candidate the document lists. When a document lists only the leaders, enter
  them and the document's valid votes, so shares stay right. When it gives no valid total
  either (press reports often give only the top two), enter what it lists and leave valid
  empty: the screens then call those shares "of the candidates listed".
- Votes cast may be entered as valid plus rejected when a document gives those two, since
  that is how IEBC's forms define it; say so in the source's note.
- In MP races the bloc is the party: coalition partners often stood against each other
  (UDA against TSP in Tetu, ODM against Jubilee in Mathare). In presidential and governor
  races the bloc is the coalition `blocs.csv` gives the candidate's party for that year, else
  the party. An independent (party blank or `Independent`) is a bloc of their own:
  `Independent: <name>`. The checker refuses any other bloc. Spell a party as the document does;
  a party spelt two ways needs a `blocs.csv` row for each. Take a coalition from the
  Registrar of Political Parties or the Kenya Gazette where that can be had, else from a
  report that names the coalition's parties. Where a party's membership is unclear, leave it
  out of `blocs.csv`, so it stands as itself, and say so in the source's note.
- The checker holds the files to the database's limits, so a folder that passes can be applied:
  names of 2 to 80 characters for areas and 2 to 120 for candidates, a party of up to 120, a bloc
  of up to 60 (an independent's long name can pass it), source titles of 2 to 300 and
  publishers of 2 to 120, notes of up to 1,000, whole numbers up to 2,147,483,647, population
  years from 2000 to 2030, and a candidate's name with letters an id can be made from. A ward
  must sit under the constituency its ward map names (Mathira's map names none).
- The 2017 presidential figures are the 8 August vote.
- Provisional results are public figures not yet checked against IEBC's forms: their sources
  are published as "Provisional results" and their notes say what was checked (IEBC's
  candidate lists for completeness, and the press where it printed the leaders). Replace them
  with IEBC's figures as each form is checked.
