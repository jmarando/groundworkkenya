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
