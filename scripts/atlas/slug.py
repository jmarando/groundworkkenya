"""The slug rule: how a place's or a candidate's name becomes a part of a key.

The name lower-cased, spaces as hyphens, punctuation dropped: "Lang'ata" becomes "langata".
Accents are dropped, not spelled out: "Mũrĩithi" becomes "muriithi". scripts/atlas/checks.ts
has the same rule in TypeScript; both run the cases in tests/fixtures/atlas/slug-cases.csv, so
the two cannot drift apart.
"""
import re
import unicodedata


def slugify(name):
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    without_marks = re.sub(r"['`.]", "", ascii_only.lower())
    return re.sub(r"[^a-z0-9]+", "-", without_marks).strip("-")
