"""Tests for areas_from_map.py: a county's areas.csv made from its ward map. Run from the
repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import json
import tempfile
import unittest
from pathlib import Path

import areas_from_map as afm
import slug

ROOT = Path(__file__).resolve().parents[2]
NAIROBI = ROOT / "public" / "geo" / "nairobi-wards.json"
MATHIRA = ROOT / "public" / "geo" / "mathira-wards.json"


def geo(features):
    tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump({"type": "FeatureCollection", "features": features}, tmp)
    tmp.close()
    return tmp.name


def feature(slug_, name, constituency=None):
    properties = {"slug": slug_, "name": name}
    if constituency:
        properties["constituency"] = constituency
    return {"type": "Feature", "properties": properties, "geometry": None}


class Rows(unittest.TestCase):
    def test_a_map_that_names_constituencies(self):
        path = geo([feature("ward-one", "Ward One", "North Test"), feature("ward-two", "Ward Two", "South Test")])
        rows = afm.build_areas(path, "Testland")
        self.assertEqual(
            rows,
            [
                ["testland", "county", "Testland", "kenya", ""],
                ["testland/north-test", "constituency", "North Test", "testland", ""],
                ["testland/north-test/ward-one", "ward", "Ward One", "testland/north-test", ""],
                ["testland/south-test", "constituency", "South Test", "testland", ""],
                ["testland/south-test/ward-two", "ward", "Ward Two", "testland/south-test", ""],
            ],
        )

    def test_a_map_that_names_none_takes_the_one_given(self):
        path = geo([feature("ward-one", "Ward One"), feature("ward-two", "Ward Two")])
        rows = afm.build_areas(path, "Testland", constituency="North Test")
        self.assertEqual([r[0] for r in rows], ["testland", "testland/north-test", "testland/north-test/ward-one", "testland/north-test/ward-two"])

    def test_a_map_that_names_none_and_is_given_none_is_refused(self):
        with self.assertRaisesRegex(ValueError, "names no constituency"):
            afm.build_areas(geo([feature("ward-one", "Ward One")]), "Testland")

    def test_constituencies_without_a_ward_map_are_listed_too(self):
        path = geo([feature("ward-one", "Ward One", "North Test")])
        rows = afm.build_areas(path, "Testland", also=["Far Test", "Away Test"])
        keys = [r[0] for r in rows]
        self.assertIn("testland/far-test", keys)
        self.assertIn("testland/away-test", keys)
        self.assertEqual([r for r in rows if r[0] == "testland/far-test"], [["testland/far-test", "constituency", "Far Test", "testland", ""]])

    def test_a_constituency_given_twice_is_refused(self):
        path = geo([feature("ward-one", "Ward One", "North Test")])
        with self.assertRaisesRegex(ValueError, "north-test is listed twice"):
            afm.build_areas(path, "Testland", also=["North Test"])

    def test_a_repeated_ward_is_refused(self):
        path = geo([feature("ward-one", "Ward One", "North Test"), feature("ward-one", "Ward One", "North Test")])
        with self.assertRaisesRegex(ValueError, "testland/north-test/ward-one is listed twice"):
            afm.build_areas(path, "Testland")


class RealMaps(unittest.TestCase):
    def test_nairobi_is_one_county_17_constituencies_and_85_wards(self):
        rows = afm.build_areas(NAIROBI, "Nairobi")
        levels = [r[1] for r in rows]
        self.assertEqual((levels.count("county"), levels.count("constituency"), levels.count("ward")), (1, 17, 85))
        self.assertIn(["nairobi/langata", "constituency", "Langata", "nairobi", ""], rows)
        self.assertIn(["nairobi/embakasi-west/umoja-ii", "ward", "Umoja II", "nairobi/embakasi-west", ""], rows)

    def test_every_key_is_a_slug_path_under_its_parent(self):
        for r in afm.build_areas(NAIROBI, "Nairobi"):
            key, level, name, parent, code = r
            self.assertEqual(key.split("/")[-1], slug.slugify(name) if level != "ward" else key.split("/")[-1])
            if level != "county":
                self.assertTrue(key.startswith(parent + "/"))

    def test_mathira_is_six_wards_in_one_constituency(self):
        rows = afm.build_areas(MATHIRA, "Nyeri", constituency="Mathira", also=["Kieni", "Mukurweini", "Nyeri Town", "Othaya", "Tetu"])
        levels = [r[1] for r in rows]
        self.assertEqual((levels.count("county"), levels.count("constituency"), levels.count("ward")), (1, 6, 6))
        self.assertIn(["nyeri/mathira/karatina-town", "ward", "Karatina Town", "nyeri/mathira", ""], rows)

    def test_the_csv_it_writes(self):
        out = Path(tempfile.mkdtemp()) / "areas.csv"
        afm.main(["areas_from_map.py", str(NAIROBI), "Nairobi", str(out)])
        lines = out.read_text().splitlines()
        self.assertEqual(lines[0], "key,level,name,parent,iebc_code")
        self.assertEqual(lines[1], "nairobi,county,Nairobi,kenya,")
        self.assertEqual(len(lines), 1 + 1 + 17 + 85)


if __name__ == "__main__":
    unittest.main()
