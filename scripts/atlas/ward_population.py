"""Population estimates for wards, from WorldPop's age-and-sex grids.

Usage:
  python3 scripts/atlas/ward_population.py WARDS_GEOJSON AREAS_CSV RASTER_DIR YEAR SOURCE OUT_CSV

  WARDS_GEOJSON  a ward map with a "slug" on each feature (public/geo/nairobi-wards.json)
  AREAS_CSV      the county's areas.csv; every ward in it must be in the ward map
  RASTER_DIR     WorldPop's 100 m age-and-sex GeoTIFFs for Kenya for YEAR: one per sex and age
                 band, named like ken_f_15_2025_....tif (sex f or m, the band's first age, year)
  YEAR           the year of the grids
  SOURCE         the source, written "WorldPop, <dataset title and version>"
  OUT_CSV        population.csv: area_key, year, total, adults, young_adults, source, method

Each ward is the sum of the grid pixels whose centres fall inside its boundary. WorldPop's age
bands are five years wide, so 18-34 is two fifths of 15-19 plus 20-24, 25-29 and 30-34, and
adults (18 and over) likewise: people are taken to be spread evenly through a band. Everything
here is an estimate and is recorded as one.

Needs rasterio and numpy (pip install rasterio numpy); the age-band arithmetic does not, so the
tests of it run without.
"""
import csv
import json
import re
import sys
from pathlib import Path

METHOD = (
    "WorldPop age-and-sex grid at 100 m: the people in the pixels whose centres fall inside the "
    "ward. Five-year bands are split evenly, so 18-34 is two fifths of 15-19 plus 20-24, 25-29 and "
    "30-34; adults likewise."
)

RASTER_NAME = re.compile(r"(?:^|_)(f|m)_(\d{1,2})_(\d{4})(?:_|\.|$)", re.IGNORECASE)


def parse_raster_name(name):
    """(sex, the band's first age, year) from a WorldPop file name, or None for any other file."""
    match = RASTER_NAME.search(name)
    if not match:
        return None
    return match.group(1).lower(), int(match.group(2)), int(match.group(3))


def band_ends(starts):
    """Each band's first age mapped to where the next band starts; the last band is open (None)."""
    ordered = sorted(set(starts))
    return {lo: (ordered[i + 1] if i + 1 < len(ordered) else None) for i, lo in enumerate(ordered)}


def share_in(lo, hi, start, end=None):
    """The part of the band lo..hi that lies in start..end, taking people as even through the band.

    hi and end are exclusive; None means no upper limit.
    """
    if hi is None:
        return 1.0 if lo >= start and (end is None or lo < end) else 0.0
    top = hi if end is None else min(hi, end)
    return max(0, top - max(lo, start)) / (hi - lo)


def ward_numbers(sums):
    """(total, adults, young adults), in whole people, from {(sex, first age): people}."""
    ends = band_ends(lo for _, lo in sums)
    total = sum(sums.values())
    adults = sum(v * share_in(lo, ends[lo], 18) for (_, lo), v in sums.items())
    young = sum(v * share_in(lo, ends[lo], 18, 35) for (_, lo), v in sums.items())
    return round(total), round(adults), round(young)


def find_rasters(directory, year):
    """{(sex, first age): path} for the year's grids in a folder; two for one band are refused."""
    found = {}
    for path in sorted(Path(directory).glob("*.tif")):
        parsed = parse_raster_name(path.name)
        if parsed is None or parsed[2] != year:
            continue
        sex, lo, _ = parsed
        if (sex, lo) in found:
            raise ValueError(f"two grids for sex {sex}, age {lo}: {found[(sex, lo)].name} and {path.name}")
        found[(sex, lo)] = path
    return found


def check_complete(found, year):
    """Both sexes for every band, from age 0: a band left out would quietly undercount."""
    if not found:
        raise ValueError(f"no grids for {year}")
    ages = {lo for _, lo in found}
    missing = sorted(f"{sex} {lo}" for lo in ages for sex in ("f", "m") if (sex, lo) not in found)
    if missing:
        raise ValueError("missing grids: " + ", ".join(missing))
    if 0 not in ages:
        raise ValueError("the grids must start at age 0, so that the total counts everyone")


def ward_sums(geometry, rasters):
    """{(sex, first age): people inside the ward}: the pixels whose centres fall within it."""
    import rasterio
    from rasterio.mask import mask

    sums = {}
    for key, path in rasters.items():
        with rasterio.open(path) as src:
            data, _ = mask(src, [geometry], crop=True, all_touched=False, filled=True)
            band = data[0]
            sums[key] = float(band[band > 0].sum())
    return sums


def build_rows(wards_geojson, areas_csv, raster_dir, year, source):
    """population.csv's rows: one for each ward in areas.csv."""
    with open(wards_geojson, encoding="utf-8") as f:
        shapes = {ft["properties"]["slug"]: ft["geometry"] for ft in json.load(f)["features"]}
    with open(areas_csv, newline="", encoding="utf-8-sig") as f:
        wards = sorted(row["key"] for row in csv.DictReader(f) if row["level"] == "ward")
    rasters = find_rasters(raster_dir, year)
    check_complete(rasters, year)
    rows = []
    for key in wards:
        slug = key.rsplit("/", 1)[-1]
        if slug not in shapes:
            raise ValueError(f"{key} is not in the ward map")
        try:
            total, adults, young = ward_numbers(ward_sums(shapes[slug], rasters))
        except ValueError as e:
            raise ValueError(f"{key}: {e}") from None
        if total == 0:
            raise ValueError(f"{key}: the grids hold no people inside it; is the ward map in the right place?")
        rows.append([key, year, total, adults, young, source, METHOD])
    return rows


def main(argv):
    if len(argv) != 7:
        raise SystemExit(__doc__)
    wards, areas, rasters, year, source, out = argv[1:]
    try:
        rows = build_rows(wards, areas, rasters, int(year), source)
    except ValueError as e:
        raise SystemExit(str(e))
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["area_key", "year", "total", "adults", "young_adults", "source", "method"])
        writer.writerows(rows)


if __name__ == "__main__":
    main(sys.argv)
