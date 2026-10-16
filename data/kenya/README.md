# Kenya, by county: the 2022 presidential result

What the Strategy page's "Path to State House" starts from. Published election results only: no voter data, nobody's community.

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
