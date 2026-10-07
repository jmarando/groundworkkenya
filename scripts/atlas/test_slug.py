"""Tests for slug.py, against the cases tests/fixtures/atlas/slug-cases.csv shares with
scripts/atlas/checks.ts. Run from the repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import csv
import re
import unittest
from pathlib import Path

import slug

CASES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "atlas" / "slug-cases.csv"


def cases():
    with CASES.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


class Slugs(unittest.TestCase):
    def test_every_shared_case(self):
        for row in cases():
            with self.subTest(name=row["name"]):
                self.assertEqual(slug.slugify(row["name"]), row["slug"])

    def test_a_slug_is_a_part_of_a_key(self):
        for row in cases():
            self.assertRegex(slug.slugify(row["name"]), r"^[a-z0-9]+(-[a-z0-9]+)*$")

    def test_nothing_is_left_to_slugify_twice(self):
        for row in cases():
            self.assertEqual(slug.slugify(row["slug"]), row["slug"])


if __name__ == "__main__":
    unittest.main()
