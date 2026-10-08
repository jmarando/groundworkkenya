# Sources

Every document the atlas's figures come from, and everything that was looked for and not found.
A figure is loaded only from the publisher's own document: IEBC, the Kenya Gazette, WorldPop and,
for which coalition a party stood in, the Registrar of Political Parties. A news report or a
summary is not a source here. Downloaded files live in `_sources/` (not committed), so each is
listed with its SHA-256, to let anyone check they have the same file. A product made of many files
(WorldPop's grids) gets one row, whose SHA-256 is that of a manifest: the output of `sha256sum`
over its files, saved as `data/atlas/<product>.sha256` and committed.

In the CSVs a `source` is the Publisher and the Document of the row here, written
"Publisher, Document", and a `source_url` is the URL column. "Saved as" is the path under
`data/atlas/_sources/` (a national document used by two counties is saved once, and its "Taken
from it" says both counties use it). "Retrieved" is the date, written YYYY-MM-DD.

## Documents used

| Document | Publisher | Published | URL | Saved as | Retrieved | Taken from it | Level | SHA-256 |
|----------|-----------|-----------|-----|----------|-----------|---------------|-------|---------|

## Gaps

| County | What | Where it was looked for | Why it is missing |
|--------|------|-------------------------|-------------------|

## Notes

Judgment calls and facts about the sources that a later reader needs: which WorldPop product was
chosen and why, the declared nodata value of its grids, a figure a document gives two ways, a name
spelt two ways, and anything the user should know before relying on a number.
