import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from manage_genie_space import DEFAULT_TABLE, render, validate  # noqa: E402


class GenieSpaceTest(unittest.TestCase):
    def setUp(self):
        self.template = ROOT / "config/genie/listings-space.json"

    def test_space_is_single_table_and_grounded(self):
        space = render(self.template, DEFAULT_TABLE)
        self.assertEqual([DEFAULT_TABLE], [x["identifier"] for x in space["data_sources"]["tables"]])
        self.assertEqual(5, len(space["benchmarks"]["questions"]))

    def test_table_is_configurable(self):
        space = render(self.template, "catalog.schema.listings")
        self.assertEqual("catalog.schema.listings", space["data_sources"]["tables"][0]["identifier"])
        self.assertIn("catalog.schema.listings", json.dumps(space["instructions"]))

    def test_rejects_extra_table(self):
        space = render(self.template, DEFAULT_TABLE)
        space["data_sources"]["tables"].append({"identifier": "other.schema.table"})
        with self.assertRaises(ValueError):
            validate(space, DEFAULT_TABLE)


if __name__ == "__main__":
    unittest.main()
