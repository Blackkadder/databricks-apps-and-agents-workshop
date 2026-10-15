import csv
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from generate_listings import FIELDS, generate, write_csv  # noqa: E402
from validate_listings import validate  # noqa: E402


class ListingDataTest(unittest.TestCase):
    def test_default_dataset_contract(self):
        rows = generate()
        self.assertEqual(300, len(rows))
        self.assertEqual(300, len({r["listing_id"] for r in rows}))
        self.assertTrue(any(r["neighborhood"] == "Riverside" and "doorman" in r["amenities"] for r in rows))

    def test_hard_cap(self):
        with self.assertRaises(ValueError):
            generate(500)

    def test_reproducible_csv_and_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            one, two = Path(directory) / "one.csv", Path(directory) / "two.csv"
            digest = write_csv(generate(), one)
            self.assertEqual(digest, write_csv(generate(), two))
            self.assertEqual(hashlib.sha256(one.read_bytes()).hexdigest(), digest)
            validate(one)
            with one.open(newline="", encoding="utf-8") as handle:
                self.assertEqual(FIELDS, list(next(csv.DictReader(handle)).keys()))


if __name__ == "__main__":
    unittest.main()
