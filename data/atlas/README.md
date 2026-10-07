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
  candidate empty.

## Rules

- A figure comes from a document listed in `sources.csv`, or it isn't entered. Nothing is
  estimated from other figures, averaged or filled in.
- Prefer IEBC's own documents (results forms 34B/34C, 35B, 37B/37C; published results and
  registers; post-election reports) and the Kenya Gazette. A media tally or open dataset is
  used only to fill a gap, with its own publisher, and the report flags it.
- List every candidate the document lists. When a document lists only the leaders, enter
  them and the document's valid votes, so shares stay right.
- The bloc is the coalition the candidate's party stood in, else the party. An independent
  is a bloc of their own: `Independent: <name>`. The main coalitions: 2013 Jubilee (TNA, URP
  and partners), CORD (ODM, Wiper, Ford-K and partners), Amani (UDF, KANU and partners); 2017
  Jubilee (Jubilee Party), NASA (ODM, Wiper, ANC, Ford-K, CCM); 2022 Kenya Kwanza (UDA, ANC,
  Ford-K and partners), Azimio (ODM, Jubilee, Wiper, KANU, DAP-K and partners). Where a party's
  membership is unclear, use the party and say so in the source's note.
- The 2017 presidential figures are the 8 August vote.
