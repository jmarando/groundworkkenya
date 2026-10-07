"""Turns one county's atlas files into a migration of idempotent upserts.

Usage:
  python3 scripts/atlas/build_sql.py DATA_DIR "County name" [OUT_SQL]

DATA_DIR holds areas.csv, candidates.csv, results.csv, turnout.csv, register.csv and
population.csv (the columns of each are in FILES below). The SQL goes to OUT_SQL, or to the
screen. Every statement upserts, so running the migration again changes nothing, and each
county is one more migration, applied before the code that needs it.

This only checks that the files can be read: the right columns, and whole numbers where
numbers belong. That what they say adds up is tests/atlas-data.test.ts's job.
"""
import csv
import re
import sys
from pathlib import Path

# The files, in the order they load, with their columns. scripts/atlas/checks.ts has the same
# lists; tests/atlas-scripts.test.ts fails if the two ever differ.
FILES = {
    "areas": ["key", "level", "name", "parent", "iebc_code"],
    "candidates": ["id", "election_id", "seat", "name", "party", "bloc"],
    "results": ["candidate_id", "area_key", "votes"],
    "turnout": [
        "election_id",
        "area_key",
        "registered",
        "cast_votes",
        "rejected_votes",
        "valid_votes",
        "source",
        "source_url",
    ],
    "register": ["year", "area_key", "registered", "source", "source_url"],
    "population": ["area_key", "year", "total", "adults", "young_adults", "source", "method"],
}

# Each file's table, and the columns that make a row unique: what an upsert matches on.
TABLES = {
    "areas": ("atlas_areas", ["key"]),
    "candidates": ("atlas_candidates", ["id"]),
    "results": ("atlas_results", ["candidate_id", "area_key"]),
    "turnout": ("atlas_turnout", ["election_id", "area_key"]),
    "register": ("atlas_register", ["year", "area_key"]),
    "population": ("atlas_population", ["area_key", "year"]),
}

NUMBERS = {
    "votes",
    "registered",
    "cast_votes",
    "rejected_votes",
    "valid_votes",
    "year",
    "total",
    "adults",
    "young_adults",
}

# Rows per insert, so a county's results are several statements and not one huge one.
CHUNK = 200


def literal(column, value):
    """One cell as SQL: blank is null, a number is bare, anything else is quoted text."""
    if value == "":
        return "null"
    if column in NUMBERS:
        if not re.fullmatch(r"\d+", value):
            raise ValueError(f"{column} must be a whole number, not {value!r}")
        return value
    return "'" + value.replace("'", "''") + "'"


def read(directory, name):
    """A file's rows as dicts, each with the line it came from in "_row"."""
    path = Path(directory) / f"{name}.csv"
    if not path.exists():
        raise ValueError(f"{path.name} is missing")
    with path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    want = FILES[name]
    if not rows or rows[0] != want:
        found = ",".join(rows[0]) if rows else "nothing"
        raise ValueError(f"{path.name}: the columns must be {','.join(want)}; found {found}")
    out = []
    for n, cells in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in cells):
            continue
        if len(cells) != len(want):
            raise ValueError(f"{path.name} row {n}: {len(cells)} cells, expected {len(want)}")
        row = dict(zip(want, cells))
        row["_row"] = n
        out.append(row)
    return out


def sort_key(name):
    """Rows go in the order of their keys, so the same files always build the same text."""
    if name == "areas":
        return lambda r: (r["key"].count("/"), r["key"])
    return lambda r: tuple(r[c] for c in TABLES[name][1])


def upserts(name, rows):
    """The insert statements for one file: parents first for areas, CHUNK rows at a time."""
    table, key = TABLES[name]
    columns = FILES[name]
    sets = ", ".join(f"{c} = excluded.{c}" for c in columns if c not in key)
    if name == "areas":
        by_depth = {}
        for r in rows:
            by_depth.setdefault(r["key"].count("/"), []).append(r)
        groups = [by_depth[depth] for depth in sorted(by_depth)]
    else:
        groups = [rows]
    out = []
    for group in groups:
        for i in range(0, len(group), CHUNK):
            lines = []
            for r in group[i : i + CHUNK]:
                try:
                    cells = [literal(c, r[c]) for c in columns]
                except ValueError as e:
                    raise ValueError(f"{name}.csv row {r['_row']}: {e}") from None
                lines.append("  (" + ", ".join(cells) + ")")
            out.append(
                f"insert into public.{table} ({', '.join(columns)}) values\n"
                + ",\n".join(lines)
                + f"\non conflict ({', '.join(key)}) do update set {sets};\n"
            )
    return out


def build(directory, title):
    """The whole migration for one county's files."""
    directory = Path(directory)
    title = re.sub(r"\s+", " ", title).strip()
    folder = re.sub(r"\s+", " ", directory.name)
    parts = [
        f'-- Election atlas: {title}. Generated by scripts/atlas/build_sql.py from the files in "{folder}".\n'
        "-- Do not edit by hand: change the files and build it again. Every statement upserts,\n"
        "-- so running it again changes nothing.\n"
    ]
    for name in FILES:
        rows = read(directory, name)
        rows.sort(key=sort_key(name))
        if rows:
            parts.append(f"\n-- {TABLES[name][0]}: {len(rows)} rows\n")
            parts.extend(upserts(name, rows))
    return "".join(parts)


def main(argv):
    if len(argv) not in (3, 4):
        raise SystemExit(__doc__)
    try:
        sql = build(argv[1], argv[2])
    except ValueError as e:
        raise SystemExit(f"{argv[1]}: {e}")
    if len(argv) == 4:
        Path(argv[3]).write_text(sql)
    else:
        sys.stdout.write(sql)


if __name__ == "__main__":
    main(sys.argv)
