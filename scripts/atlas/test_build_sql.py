"""Tests for build_sql.py: how values become SQL, that a county's files build the golden file,
and that bad files are refused. Run from the repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import shutil
import tempfile
import unittest
from pathlib import Path

import build_sql

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "atlas" / "testland"
GOLDEN = ROOT / "tests" / "fixtures" / "atlas" / "testland.sql"


class Literals(unittest.TestCase):
    def test_text_is_quoted_and_apostrophes_doubled(self):
        self.assertEqual(build_sql.literal("name", "O'Test"), "'O''Test'")

    def test_blank_is_null(self):
        self.assertEqual(build_sql.literal("party", ""), "null")
        self.assertEqual(build_sql.literal("votes", ""), "null")

    def test_numbers_are_bare(self):
        self.assertEqual(build_sql.literal("votes", "0"), "0")
        self.assertEqual(build_sql.literal("votes", "1200"), "1200")

    def test_a_number_with_a_separator_is_refused(self):
        with self.assertRaises(ValueError):
            build_sql.literal("votes", "1,200")

    def test_text_that_looks_like_a_number_stays_text(self):
        self.assertEqual(build_sql.literal("iebc_code", "047"), "'047'")


class Build(unittest.TestCase):
    def test_the_fixture_builds_the_golden_file(self):
        self.assertEqual(build_sql.build(FIXTURE, "Testland"), GOLDEN.read_text())

    def test_building_twice_gives_the_same_text(self):
        self.assertEqual(build_sql.build(FIXTURE, "Testland"), build_sql.build(FIXTURE, "Testland"))

    def test_every_table_is_an_upsert(self):
        sql = build_sql.build(FIXTURE, "Testland")
        for table in (
            "atlas_areas",
            "atlas_candidates",
            "atlas_results",
            "atlas_turnout",
            "atlas_register",
            "atlas_population",
        ):
            self.assertIn(f"insert into public.{table} ", sql)
        self.assertEqual(sql.count("insert into "), sql.count("on conflict "))

    def test_parents_come_before_children(self):
        sql = build_sql.build(FIXTURE, "Testland")
        county = sql.index("'testland', 'county'")
        constituency = sql.index("'testland/north-test', 'constituency'")
        ward = sql.index("'testland/north-test/ward-one', 'ward'")
        self.assertLess(county, constituency)
        self.assertLess(constituency, ward)

    def test_a_large_table_is_split_into_several_statements(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "testland"
            shutil.copytree(FIXTURE, copy)
            rows = "".join(f"2022-governor/testland/a-test,testland/north-test/w{i},{i}\n" for i in range(450))
            (copy / "results.csv").write_text("candidate_id,area_key,votes\n" + rows)
            sql = build_sql.build(copy, "Testland")
            self.assertEqual(sql.count("insert into public.atlas_results "), 3)


class Refusals(unittest.TestCase):
    def copy_fixture(self, tmp):
        copy = Path(tmp) / "testland"
        shutil.copytree(FIXTURE, copy)
        return copy

    def test_wrong_columns_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "results.csv").write_text("candidate,area,votes\nx,y,1\n")
            with self.assertRaisesRegex(ValueError, "results.csv: the columns must be"):
                build_sql.build(copy, "Testland")

    def test_a_missing_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "register.csv").unlink()
            with self.assertRaisesRegex(ValueError, "register.csv is missing"):
                build_sql.build(copy, "Testland")

    def test_a_short_row_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "results.csv").write_text("candidate_id,area_key,votes\n2022-governor/testland/a-test,testland\n")
            with self.assertRaisesRegex(ValueError, "results.csv row 2: 2 cells, expected 3"):
                build_sql.build(copy, "Testland")

    def test_a_number_that_is_not_a_number_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "results.csv").write_text(
                "candidate_id,area_key,votes\n2022-governor/testland/a-test,testland,6OO\n"
            )
            with self.assertRaisesRegex(ValueError, "results.csv row 2"):
                build_sql.build(copy, "Testland")


if __name__ == "__main__":
    unittest.main()
