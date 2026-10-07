"""A county's areas.csv, made from its ward map, so no key is typed by hand.

Usage:
  python3 scripts/atlas/areas_from_map.py WARDS_GEOJSON "County name" [OUT_CSV]
      [--constituency "Name"] [--also "Name"]...

WARDS_GEOJSON  a ward map whose features carry a "slug" and a "name", and a "constituency" where
               the map knows it (public/geo/nairobi-wards.json does; mathira-wards.json does not)
--constituency the constituency every ward is in, for a map that names none
--also         a constituency of the county that has no ward map, so it is listed with no wards
               (repeat it for each)

Writes the county, its constituencies and its wards as areas.csv rows, keyed by the path of slugs
(see slug.py); the IEBC code is left blank to be filled in from IEBC's documents. Names are the
ward map's, which are the names the app uses. To the screen when there is no OUT_CSV.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

from slug import slugify

HEADER = ["key", "level", "name", "parent", "iebc_code"]


def build_areas(wards_geojson, county, constituency=None, also=()):
    """areas.csv's rows, in key order: the county, then its constituencies and wards."""
    with open(wards_geojson, encoding="utf-8") as f:
        features = json.load(f)["features"]
    county_key = slugify(county)
    rows = {county_key: [county_key, "county", county, "kenya", ""]}
    for feature in features:
        props = feature["properties"]
        name = props.get("constituency") or constituency
        if not name:
            raise ValueError(f"the ward map names no constituency for {props['slug']}; give one with --constituency")
        constituency_key = f"{county_key}/{slugify(name)}"
        if constituency_key not in rows:
            rows[constituency_key] = [constituency_key, "constituency", name, county_key, ""]
        ward_key = f"{constituency_key}/{props['slug']}"
        if ward_key in rows:
            raise ValueError(f"{ward_key} is listed twice")
        rows[ward_key] = [ward_key, "ward", props["name"], constituency_key, ""]
    for name in also:
        key = f"{county_key}/{slugify(name)}"
        if key in rows:
            raise ValueError(f"{key} is listed twice")
        rows[key] = [key, "constituency", name, county_key, ""]
    return [rows[key] for key in sorted(rows)]


def main(argv):
    parser = argparse.ArgumentParser(prog=Path(argv[0]).name, description="A county's areas.csv from its ward map.")
    parser.add_argument("wards")
    parser.add_argument("county")
    parser.add_argument("out", nargs="?")
    parser.add_argument("--constituency")
    parser.add_argument("--also", action="append", default=[])
    args = parser.parse_args(argv[1:])
    try:
        rows = build_areas(args.wards, args.county, args.constituency, args.also)
    except ValueError as e:
        raise SystemExit(str(e))
    if args.out:
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(HEADER)
            writer.writerows(rows)
    else:
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(HEADER)
        writer.writerows(rows)


if __name__ == "__main__":
    main(sys.argv)
