# Kenya, by county: the 2022 presidential result, and what has changed since

What the Strategy page's "Path to State House" starts from, and the facts beside its "Outlook 2027". Published election results and published reports only: no voter data, nobody's community.

## Files

- `counties.csv`: one row for each of the 47 counties, in IEBC's order, and one row for the diaspora (`DIA`, blank region).
  - `registered`, `valid`, `rejected`, `raila`, `ruto`: the 2022 presidential result as IEBC declared it, from the county rows of Form 34C. Cast votes are `valid + rejected`; every other candidate's votes are `valid - raila - ruto`.
  - `uhuru_2017`, `raila_2017`, `valid_2017`: the August 2017 count (the one the Supreme Court annulled), from Wikipedia's county table, which sums within 1% of the declared totals. Context only: the 2017 to 2022 swing in a region, to whole points. Blank for the diaspora.
  - `region`: the id of a row in `regions.csv`.
- `regions.csv`: the 13 regions. `id` is what `counties.csv` uses; `name` is shown; `note` is a grouping caveat, shown with the region.

## Where the numbers come from

- 2022: IEBC, Form 34C, the county rows (https://www.iebc.or.ke/uploads/resources/QLTlLJx0Vr.pdf). The counties and the diaspora add up to the declared totals: 14,213,137 valid votes, Ruto 7,176,141, Raila 6,942,930, 22,120,458 registered, 113,614 rejected. `tests/kenya-data.test.ts` checks it, and checks it against `data/atlas/kenya`.
- 2017: Wikipedia, "2017 Kenyan general election", the county table.
- Grouping into regions: the research notes behind the page (counties and regions, as Kenyan analysts group them). A region is a set of counties and nothing more; it says nothing about any person.

## One thing to know

IEBC's rows for Kilifi and West Pokot carry 10 and 100 more valid votes than their candidates' rows add up to. The declared national figures have the same 110-vote gap. We keep IEBC's valid votes; the difference counts as "other candidates".

## Changing a region

Edit the `region` of a county in `counties.csv` to another `id` from `regions.csv`. Every region must keep at least one county. `npm test` refuses a file with a county in no region, a number that is not whole, or anything other than 47 counties.

## Outlook 2027: what has changed since 2022

- `outlook-notes.csv`: dated, sourced notes shown beside the Outlook on the Strategy page. Columns: `id` (unique), `topic` (`youth`, `register`, `world`, `parties` or `nairobi`), `place` (blank for everywhere, else a county name; the Nairobi notes show only on a Nairobi campaign), `date` (the day the source reports, `YYYY-MM-DD`, or `YYYY-MM` when it gives a month), `title`, `text`, `kind` (`official`, `reported`, `survey` or `statement`), `source` (publication and date), `url` (https, to the page read), `caveat` (what to remember when reading it).
  - Every figure in a note is one its source prints; where a source reports another body's count (a rights commission, a pollster) the note says whose. Counts that differ between sources are not added or averaged.
  - A note names places, parties, officials and published bodies. It never names a community or says how one votes: `tests/outlook-notes.test.ts` refuses a note that does.
  - Statements by politicians are labelled `statement`; polls and studies `survey`, with their size and method where the source gives them.
- `registered-2026.csv`: new registrations by county in the IEBC's mass registration drive of 30 March to 28 April 2026, for the 17 counties that Capital FM printed on 1 May 2026 (the drive's national total was 2,345,476; the 17 add up to 1,107,452). `code` is IEBC's county code (checked against `counties.csv`). The figures are gross and unaudited, with no age breakdown. They leave out the 267,249 continuous registrations since 29 September 2025, which no source splits by county. Add a county only from a source that prints it.

Both files are read by `src/lib/outlook-notes.ts`, which refuses a bad file and names every problem.

## Campaign spending limits for 2027: `limits-2027-*.csv`

The most a candidate may spend in the general election of 10 August 2027, as IEBC published it in Kenya Gazette Notice No. 12251, a special issue of 7 August 2026 (https://www.iebc.or.ke/uploads/resources/QUTuQXad27.pdf). Published figures only.

- `limits-2027-counties.csv`: the Second Schedule, 47 rows. The notice's heading says the limit is for a county Governor, a Senator and a county Woman Member of the National Assembly. Columns: `code` (IEBC's county code, `001` to `047`), `county`, `population`, `area_km2` (the notice's "approximate area"), `limit_kes`.
- `limits-2027-constituencies.csv`: the Third Schedule, 290 rows, for a National Assembly candidate. The same columns, with `county` (a county `code`) after the constituency's name.
- `limits-2027-wards.csv`: the Fourth Schedule, 1,450 rows, for a County Assembly ward candidate. `code` runs `0001` to `1450`.
- The First Schedule (a presidential candidate: KSh 6,112,543,133), the Fifth (what political parties may spend, item by item: KSh 24,450,172,531) and the Sixth's fixed costs are short, so they sit in `src/lib/spending-limits.ts`.

How they were copied and checked:

- The notice's text (`pdftotext -layout`) was split into rows, then read a second time by a different script: the two readings agree on every row (names compared without case or punctuation).
- The notice lists constituencies without their counties. Each is placed in the county whose population its constituencies add up to; every county is within 5 people of its printed population.
- The Fourth Schedule prints each county's name beside its wards, but at a page break the name can sit a few rows below the block's first row. Read as printed, that put 8 wards in the wrong county: Kanyenya-Ini, Muguru and Rwathia in Kirinyaga instead of Murang'a, and Olkeri, Ongata Rongai, Nkaimurunya, Oloolua and Ngong in Narok instead of Kajiado. So wards are placed the way constituencies are, by adding them up in code order: every county's wards are within 5 people of its population, and Kirinyaga, Murang'a, Narok and Kajiado have 20, 35, 30 and 25 wards.
- The notice prints Kirinyaga's number as `0` and calls Nairobi "Nairobi City". The files use the code `020` and the name `counties.csv` gives.
- The Sixth Schedule says each limit is a fixed cost plus a cost per person and a cost per square kilometre, and prints them (ward: KSh 3,225,105, 42.10 and 1,655; constituency: 10,795,432, 53.72 and 2,112; county: 14,406,545, 33.83 and 1,330). The schedules' limits do not follow from those numbers: for wards the fixed cost and the land-area cost fit exactly, but the cost per person that fits is about 47.20, not 42.10, and for constituencies and counties no such sum fits exactly. Nothing here recomputes a limit; the files hold the schedules' own figures.

`tests/spending-limits.test.ts` checks the row counts, the sums above, the figures the guide quotes, and that a bad file is refused with every problem named.
