"""Tests for ward_population.py: reading WorldPop's file names, splitting five-year age bands, and
summing a grid inside a ward. The grid tests build tiny GeoTIFFs and need rasterio and
numpy; without them they skip and the rest still run. Run from the repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import csv
import json
import tempfile
import unittest
from pathlib import Path

import ward_population as wp

try:
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

    HAVE_RASTERIO = True
except ImportError:
    HAVE_RASTERIO = False

# WorldPop's bands by their first age: under 1, 1 to 4, then every five years to 80 and over.
STARTS = [0, 1] + list(range(5, 85, 5))

# An areas.csv with one ward in it, and one with only a county.
ONE_WARD = "key,level,name,parent,iebc_code\ntestland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
NO_WARDS = "key,level,name,parent,iebc_code\ntestland,county,Testland,kenya,\n"

# Rows 2 to 5 and columns 2 to 5 of the grid: the sixteen pixels of the 16-pixel ward, each holding nothing.
EMPTY_WARD_PIXELS = {(row, column): 0 for row in range(2, 6) for column in range(2, 6)}

# Wards over the ten by ten grid, as (left, top, right, bottom) in pixels from its top left corner.
# Four columns or rows against each edge, the outline 0.9 of a pixel past that edge: still on the
# grid, as a border ward's outline can be a hair outside it. Each holds sixteen pixel centres.
AT_THE_EDGE = {
    "the right edge": (6.1, 2.1, 10.9, 5.9),
    "the left edge": (-0.9, 2.1, 3.9, 5.9),
    "the top edge": (2.1, -0.9, 5.9, 3.9),
    "the bottom edge": (2.1, 6.1, 5.9, 10.9),
}
# Wards that run past an edge by more than a pixel: half off (columns 8 to 11 of ten, and so on),
# and 1.1 pixels past.
PAST_THE_EDGE = {
    "half off the right edge": (8.1, 2.1, 11.9, 5.9),
    "half off the left edge": (-1.9, 2.1, 1.9, 5.9),
    "half off the top edge": (2.1, -1.9, 5.9, 1.9),
    "half off the bottom edge": (2.1, 8.1, 5.9, 11.9),
    "1.1 pixels past the right edge": (6.1, 2.1, 11.1, 5.9),
    "1.1 pixels past the left edge": (-1.1, 2.1, 3.9, 5.9),
    "1.1 pixels past the top edge": (2.1, -1.1, 5.9, 3.9),
    "1.1 pixels past the bottom edge": (2.1, 6.1, 5.9, 11.1),
}


def ward_map(*features):
    """The text of a ward map holding these features."""
    return json.dumps({"type": "FeatureCollection", "features": list(features)})


def ward_feature(slug, geometry):
    return {"type": "Feature", "properties": {"slug": slug}, "geometry": geometry}


class Names(unittest.TestCase):
    def test_a_worldpop_file_name(self):
        self.assertEqual(wp.parse_raster_name("ken_f_15_2025_CN_100m_R2025A_v1.tif"), ("f", 15, 2025))

    def test_case_and_short_ages(self):
        self.assertEqual(wp.parse_raster_name("KEN_M_5_2020.tif"), ("m", 5, 2020))
        self.assertEqual(wp.parse_raster_name("ken_f_00_2020.tif"), ("f", 0, 2020))
        self.assertEqual(wp.parse_raster_name("ken_f_1_2020.tif"), ("f", 1, 2020))

    def test_other_files_are_not_grids(self):
        self.assertIsNone(wp.parse_raster_name("ken_ppp_2020.tif"))
        self.assertIsNone(wp.parse_raster_name("README.txt"))


class Bands(unittest.TestCase):
    def test_where_each_band_ends(self):
        ends = wp.band_ends(STARTS)
        self.assertEqual(ends[0], 1)
        self.assertEqual(ends[1], 5)
        self.assertEqual(ends[15], 20)
        self.assertIsNone(ends[80])

    def test_adults_are_two_fifths_of_15_to_19_and_everyone_older(self):
        self.assertEqual(wp.share_in(10, 15, 18), 0)
        self.assertAlmostEqual(wp.share_in(15, 20, 18), 0.4)
        self.assertEqual(wp.share_in(20, 25, 18), 1)
        self.assertEqual(wp.share_in(80, None, 18), 1)

    def test_young_adults_are_two_fifths_of_15_to_19_and_the_next_three_bands(self):
        self.assertAlmostEqual(wp.share_in(15, 20, 18, 35), 0.4)
        self.assertEqual(wp.share_in(20, 25, 18, 35), 1)
        self.assertEqual(wp.share_in(30, 35, 18, 35), 1)
        self.assertEqual(wp.share_in(35, 40, 18, 35), 0)
        self.assertEqual(wp.share_in(80, None, 18, 35), 0)

    def test_single_year_bands_need_no_splitting(self):
        self.assertEqual(wp.share_in(17, 18, 18), 0)
        self.assertEqual(wp.share_in(18, 19, 18), 1)
        self.assertEqual(wp.share_in(34, 35, 18, 35), 1)
        self.assertEqual(wp.share_in(35, 36, 18, 35), 0)


class Numbers(unittest.TestCase):
    def test_a_ward_where_every_band_holds_ten_people(self):
        sums = {(sex, lo): 10.0 for sex in ("f", "m") for lo in STARTS}
        # 36 grids of ten; adults are the 13 bands from 20 up and two fifths of 15 to 19, for
        # both sexes; the young are 20 to 34 (three bands) and the same two fifths.
        self.assertEqual(wp.ward_numbers(sums), (360, 268, 68))

    def test_the_order_survives_rounding(self):
        total, adults, young = wp.ward_numbers({("f", 15): 10.4, ("f", 20): 0.3, ("f", 35): 0.2})
        self.assertGreaterEqual(total, adults)
        self.assertGreaterEqual(adults, young)


class Rasters(unittest.TestCase):
    def folder(self, names):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for name in names:
            (Path(tmp.name) / name).write_bytes(b"")
        return tmp.name

    def grids(self, starts, year=2025):
        """The year's grids for both sexes at each of these band starts, as find_rasters finds them."""
        names = [f"ken_{sex}_{lo:02d}_{year}.tif" for sex in ("f", "m") for lo in starts]
        return wp.find_rasters(self.folder(names), year)

    def test_finds_the_years_grids_by_sex_and_age(self):
        found = wp.find_rasters(self.folder(["ken_f_0_2025.tif", "ken_m_0_2025.tif", "ken_f_0_2020.tif", "notes.txt"]), 2025)
        self.assertEqual(sorted(found), [("f", 0), ("m", 0)])

    def test_two_grids_for_one_band_are_refused(self):
        with self.assertRaisesRegex(ValueError, "two grids"):
            wp.find_rasters(self.folder(["ken_f_15_2025_a.tif", "ken_f_15_2025_b.tif"]), 2025)

    def test_a_band_missing_for_one_sex_is_refused(self):
        found = wp.find_rasters(self.folder(["ken_f_0_2025.tif", "ken_m_0_2025.tif", "ken_f_15_2025.tif"]), 2025)
        with self.assertRaisesRegex(ValueError, "missing grids: m 15"):
            wp.check_complete(found, 2025)

    def test_grids_must_start_at_age_zero(self):
        found = wp.find_rasters(self.folder(["ken_f_15_2025.tif", "ken_m_15_2025.tif"]), 2025)
        with self.assertRaisesRegex(ValueError, "start at age 0"):
            wp.check_complete(found, 2025)

    def test_no_grids_for_the_year_is_refused(self):
        found = wp.find_rasters(self.folder(["ken_f_0_2020.tif"]), 2025)
        with self.assertRaisesRegex(ValueError, "no grids for 2025"):
            wp.check_complete(found, 2025)

    def test_a_band_missing_for_both_sexes_is_refused(self):
        # Nothing in the files that are there says a whole band is gone, so the bands WorldPop
        # publishes are looked for by name: under 1, 1 to 4, then every five years.
        for gap in (20, 1, 5, 75):
            with self.subTest(band=gap):
                found = self.grids([lo for lo in STARTS if lo != gap])
                with self.assertRaisesRegex(ValueError, f"missing grids: f {gap}, m {gap}"):
                    wp.check_complete(found, 2025)

    def test_grids_that_stop_short_of_80_and_over_are_refused(self):
        found = self.grids([lo for lo in STARTS if lo <= 75])
        with self.assertRaisesRegex(ValueError, "missing grids: f 80, m 80"):
            wp.check_complete(found, 2025)

    def test_a_gap_below_a_higher_top_band_is_refused(self):
        # A series that goes on to 90 and over needs every band up to its last, not only to 80.
        found = self.grids([lo for lo in STARTS + [85, 90] if lo != 85])
        with self.assertRaisesRegex(ValueError, "missing grids: f 85, m 85"):
            wp.check_complete(found, 2025)

    def test_whole_sets_are_accepted(self):
        wp.check_complete(self.grids(STARTS), 2025)
        wp.check_complete(self.grids(STARTS + [85, 90]), 2025)


class Method(unittest.TestCase):
    def test_it_says_the_figures_are_estimates(self):
        self.assertIn("estimate", wp.METHOD)
        self.assertTrue(wp.METHOD.endswith("These are estimates, not counts."))
        self.assertGreaterEqual(len(wp.METHOD), 10)
        self.assertLessEqual(len(wp.METHOD), 500)


class Inputs(unittest.TestCase):
    """What build_rows refuses in the ward map and areas.csv, before it looks at a single grid."""

    def files(self, features, areas):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        folder = Path(tmp.name)
        (folder / "wards.json").write_text(ward_map(*features))
        (folder / "areas.csv").write_text(areas)
        return folder / "wards.json", folder / "areas.csv", folder

    def test_a_repeated_slug_in_the_ward_map_is_refused(self):
        # Two different outlines under one slug: the second would quietly replace the first.
        first = {"type": "Polygon", "coordinates": [[[36.0, -1.0], [36.1, -1.0], [36.1, -1.1], [36.0, -1.0]]]}
        second = {"type": "Polygon", "coordinates": [[[37.0, -2.0], [37.1, -2.0], [37.1, -2.1], [37.0, -2.0]]]}
        geo, areas, folder = self.files([ward_feature("ward-one", first), ward_feature("ward-one", second)], ONE_WARD)
        with self.assertRaisesRegex(ValueError, "ward-one is listed twice in the ward map"):
            wp.build_rows(geo, areas, folder, 2025, "WorldPop, Test grids")

    def test_an_areas_file_with_no_ward_rows_is_refused(self):
        shape = {"type": "Polygon", "coordinates": [[[36.0, -1.0], [36.1, -1.0], [36.1, -1.1], [36.0, -1.0]]]}
        geo, areas, folder = self.files([ward_feature("ward-one", shape)], NO_WARDS)
        with self.assertRaisesRegex(ValueError, "no ward rows in areas.csv"):
            wp.build_rows(geo, areas, folder, 2025, "WorldPop, Test grids")


@unittest.skipUnless(HAVE_RASTERIO, "needs rasterio and numpy")
class Grids(unittest.TestCase):
    def write_grids(self, nodata=-99999, pixels=None):
        """Ten by ten pixels of 0.001 degrees, one person in each pixel of every band's grid.

        nodata is the value the files declare for no data (None declares none). pixels maps a
        (row, column) to the value that pixel holds instead of one person, in every grid.
        """
        values = np.ones((1, 10, 10), dtype="float32")
        for (row, column), value in (pixels or {}).items():
            values[0, row, column] = value
        transform = from_origin(36.0, -1.0, 0.001, 0.001)
        for sex in ("f", "m"):
            for lo in STARTS:
                with rasterio.open(
                    self.dir / f"ken_{sex}_{lo:02d}_2025_test.tif",
                    "w",
                    driver="GTiff",
                    height=10,
                    width=10,
                    count=1,
                    dtype="float32",
                    crs="EPSG:4326",
                    transform=transform,
                    nodata=nodata,
                ) as dst:
                    dst.write(values)

    def sums_over(self, ward):
        sums = wp.ward_sums(ward, wp.find_rasters(self.dir, 2025))
        self.assertEqual(len(sums), 36)
        return sums

    def write_inputs(self, ward=None):
        """wards.json and areas.csv beside the grids, for the one ward, ward-one; returns their paths."""
        geo = self.dir / "wards.json"
        geo.write_text(ward_map(ward_feature("ward-one", ward or self.ward)))
        areas = self.dir / "areas.csv"
        areas.write_text(ONE_WARD)
        return geo, areas

    def ward_over(self, left, top, right, bottom):
        """A ward from pixel column left to right and row top to bottom of the ten by ten grid,
        counted from its top left corner (fractions allowed)."""

        def corner(column, row):
            return [round(36.0 + 0.001 * column, 6), round(-1.0 - 0.001 * row, 6)]

        ring = [corner(left, top), corner(right, top), corner(right, bottom), corner(left, bottom), corner(left, top)]
        return {"type": "Polygon", "coordinates": [ring]}

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.write_grids()
        # A ward over four columns and four rows of pixel centres: sixteen pixels.
        self.ward = {
            "type": "Polygon",
            "coordinates": [
                [[36.0021, -1.0021], [36.0059, -1.0021], [36.0059, -1.0059], [36.0021, -1.0059], [36.0021, -1.0021]]
            ],
        }

    def test_a_ward_sums_the_pixels_whose_centres_it_holds(self):
        rasters = wp.find_rasters(self.dir, 2025)
        sums = wp.ward_sums(self.ward, rasters)
        self.assertEqual(len(sums), 36)
        self.assertTrue(all(v == 16 for v in sums.values()))
        self.assertEqual(wp.ward_numbers(sums), (576, 429, 109))

    def test_a_ward_outside_the_grids_is_refused(self):
        far = {"type": "Polygon", "coordinates": [[[40, 3], [40.1, 3], [40.1, 3.1], [40, 3.1], [40, 3]]]}
        with self.assertRaises(ValueError):
            wp.ward_sums(far, wp.find_rasters(self.dir, 2025))

    def test_the_rows_for_a_county(self):
        geo = self.dir / "wards.json"
        geo.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [{"type": "Feature", "properties": {"slug": "ward-one"}, "geometry": self.ward}],
                }
            )
        )
        areas = self.dir / "areas.csv"
        areas.write_text(
            "key,level,name,parent,iebc_code\n"
            "testland,county,Testland,kenya,\n"
            "testland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
        )
        rows = wp.build_rows(geo, areas, self.dir, 2025, "WorldPop, Test grids")
        self.assertEqual(
            rows, [["testland/north-test/ward-one", 2025, 576, 429, 109, "WorldPop, Test grids", wp.METHOD]]
        )

    def test_a_ward_missing_from_the_map_is_refused(self):
        geo = self.dir / "wards.json"
        geo.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
        areas = self.dir / "areas.csv"
        areas.write_text(
            "key,level,name,parent,iebc_code\ntestland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
        )
        with self.assertRaisesRegex(ValueError, "testland/north-test/ward-one is not in the ward map"):
            wp.build_rows(geo, areas, self.dir, 2025, "WorldPop, Test grids")

    def test_the_file_it_writes(self):
        geo = self.dir / "wards.json"
        geo.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [{"type": "Feature", "properties": {"slug": "ward-one"}, "geometry": self.ward}],
                }
            )
        )
        areas = self.dir / "areas.csv"
        areas.write_text(
            "key,level,name,parent,iebc_code\ntestland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
        )
        out = self.dir / "population.csv"
        wp.main(["ward_population.py", str(geo), str(areas), str(self.dir), "2025", "WorldPop, Test grids", str(out)])
        with out.open(newline="") as f:
            rows = list(csv.reader(f))
        self.assertEqual(rows[0], ["area_key", "year", "total", "adults", "young_adults", "source", "method"])
        self.assertEqual(rows[1][:6], ["testland/north-test/ward-one", "2025", "576", "429", "109", "WorldPop, Test grids"])
        self.assertEqual(rows[1][6], wp.METHOD)
        self.assertGreaterEqual(len(wp.METHOD), 10)
        self.assertLessEqual(len(wp.METHOD), 500)

    def test_a_pixel_the_ward_only_clips_is_left_out(self):
        # The same sixteen pixel centres, now with a sliver 0.0001 degrees wide of the pixels all
        # round them: it touches those pixels but reaches none of their centres, so the answer is
        # the same. (Counting every pixel the ward touches would make it 36 a grid, not 16.)
        clipped = {
            "type": "Polygon",
            "coordinates": [
                [[36.0019, -1.0019], [36.0061, -1.0019], [36.0061, -1.0061], [36.0019, -1.0061], [36.0019, -1.0019]]
            ],
        }
        sums = self.sums_over(clipped)
        self.assertTrue(all(v == 16 for v in sums.values()))
        self.assertEqual(wp.ward_numbers(sums), (576, 429, 109))

    def test_a_positive_value_declared_as_no_data_is_not_people(self):
        # 9999 is the files' no-data value and one pixel of the ward holds it in every grid:
        # fifteen people a grid, not 10,014.
        self.write_grids(nodata=9999, pixels={(3, 3): 9999})
        sums = self.sums_over(self.ward)
        self.assertTrue(all(v == 15 for v in sums.values()))
        self.assertEqual(wp.ward_numbers(sums), (540, 402, 102))

    def test_negative_and_nan_pixels_are_not_people(self):
        # One pixel of the ward holds a number below zero, or NaN, whether the files declare it as
        # no data or not.
        for label, nodata, value in (
            ("a declared negative", -99999, -99999),
            ("an undeclared negative", None, -99999),
            ("a declared NaN", float("nan"), float("nan")),
        ):
            with self.subTest(label):
                self.write_grids(nodata=nodata, pixels={(3, 3): value})
                sums = self.sums_over(self.ward)
                self.assertTrue(all(v == 15 for v in sums.values()))
                self.assertEqual(wp.ward_numbers(sums), (540, 402, 102))

    def test_a_ward_with_no_people_is_refused_not_written_as_zero(self):
        self.write_grids(pixels=EMPTY_WARD_PIXELS)
        geo, areas = self.write_inputs()
        with self.assertRaisesRegex(ValueError, "testland/north-test/ward-one: the grids hold no people"):
            wp.build_rows(geo, areas, self.dir, 2025, "WorldPop, Test grids")

    def test_main_stops_for_a_ward_with_no_people_and_writes_no_file(self):
        self.write_grids(pixels=EMPTY_WARD_PIXELS)
        geo, areas = self.write_inputs()
        out = self.dir / "population.csv"
        with self.assertRaisesRegex(SystemExit, "hold no people"):
            wp.main(["ward_population.py", str(geo), str(areas), str(self.dir), "2025", "WorldPop, Test grids", str(out)])
        self.assertFalse(out.exists())

    def test_a_ward_that_runs_past_the_grid_is_refused(self):
        rasters = wp.find_rasters(self.dir, 2025)
        for what, edges in PAST_THE_EDGE.items():
            with self.subTest(what):
                with self.assertRaisesRegex(ValueError, "the ward runs past the grid"):
                    wp.ward_sums(self.ward_over(*edges), rasters)

    def test_a_bbox_in_the_geometry_does_not_hide_a_ward_that_runs_past_the_grid(self):
        # The coordinates run off the grid while the bbox member says the ward fits inside it.
        ward = dict(self.ward_over(*PAST_THE_EDGE["half off the right edge"]), bbox=[36.002, -1.006, 36.006, -1.002])
        with self.assertRaisesRegex(ValueError, "the ward runs past the grid"):
            wp.ward_sums(ward, wp.find_rasters(self.dir, 2025))

    def test_a_ward_that_runs_past_the_grid_is_named_by_its_key(self):
        geo, areas = self.write_inputs(self.ward_over(*PAST_THE_EDGE["half off the right edge"]))
        with self.assertRaisesRegex(ValueError, "testland/north-test/ward-one: the ward runs past the grid"):
            wp.build_rows(geo, areas, self.dir, 2025, "WorldPop, Test grids")

    def test_a_ward_at_the_edge_of_the_grid_still_works(self):
        for what, edges in AT_THE_EDGE.items():
            with self.subTest(what):
                sums = self.sums_over(self.ward_over(*edges))
                self.assertTrue(all(v == 16 for v in sums.values()))
                self.assertEqual(wp.ward_numbers(sums), (576, 429, 109))

    def test_the_file_is_written_with_unix_line_ends(self):
        geo, areas = self.write_inputs()
        out = self.dir / "population.csv"
        wp.main(["ward_population.py", str(geo), str(areas), str(self.dir), "2025", "WorldPop, Test grids", str(out)])
        raw = out.read_bytes()
        self.assertNotIn(b"\r", raw)
        self.assertTrue(raw.endswith(b"\n"))


if __name__ == "__main__":
    unittest.main()
