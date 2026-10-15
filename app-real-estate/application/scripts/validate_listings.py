#!/usr/bin/env python3
"""Validate the local synthetic-listing data contract."""

import csv
from pathlib import Path

from generate_listings import FIELDS, REQUIRED_ROWS


def validate(path: Path) -> None:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == REQUIRED_ROWS
    assert list(rows[0]) == FIELDS
    assert len({row["listing_id"] for row in rows}) == len(rows)
    for row in rows:
        assert all(row[field] for field in FIELDS)
        assert -90 <= float(row["latitude"]) <= 90
        assert -180 <= float(row["longitude"]) <= 180
        assert int(row["price"]) > 0 and int(row["square_feet"]) > 0
        assert abs(float(row["price_per_sqft"]) - int(row["price"]) / int(row["square_feet"])) < 0.01
        assert 0 <= int(row["transit_score"]) <= 100
        assert 0 <= int(row["walk_score"]) <= 100
        assert int(row["days_on_market"]) >= 0
        assert row["has_outdoor_space"] in {"True", "False"}
        assert row["has_parking"] in {"True", "False"}
        assert row["property_type"] in {"condo", "townhouse", "co-op", "single-family"}
        assert row["status"] in {"active", "coming-soon"}
        assert row["neighborhood"] in row["description"]
        assert row["property_type"] in row["description"]


if __name__ == "__main__":
    validate(Path(__file__).parents[1] / "data/listings.csv")
    print("listings.csv is valid")
