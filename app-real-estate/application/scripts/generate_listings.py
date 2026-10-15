#!/usr/bin/env python3
"""Generate the single synthetic listings dataset used by the demo."""

from __future__ import annotations

import argparse
import csv
import hashlib
import random
from pathlib import Path

DEFAULT_ROWS = 300
MAX_ROWS = 499
SEED = 20261015

FIELDS = [
    "listing_id", "title", "description", "property_type", "status", "price",
    "bedrooms", "bathrooms", "square_feet", "year_built", "neighborhood",
    "city", "state", "postal_code", "latitude", "longitude", "amenities",
]

NEIGHBORHOODS = [
    ("Riverside", 40.8007, -73.9707, "10024"),
    ("Park Slope", 40.6728, -73.9778, "11215"),
    ("Astoria", 40.7644, -73.9235, "11103"),
    ("Long Island City", 40.7447, -73.9485, "11101"),
    ("Harlem", 40.8116, -73.9465, "10027"),
]
PROPERTY_TYPES = ["condo", "townhouse", "co-op", "single-family"]
STATUSES = ["active", "coming-soon"]
AMENITY_SETS = [
    ("doorman", "elevator", "roof deck"),
    ("pet-friendly", "in-unit laundry", "balcony"),
    ("parking", "garden", "home office"),
    ("gym", "package room", "bike storage"),
    ("solar panels", "EV charging", "smart thermostat"),
]


def generate(rows: int = DEFAULT_ROWS) -> list[dict[str, object]]:
    if not 1 <= rows <= MAX_ROWS:
        raise ValueError(f"rows must be between 1 and {MAX_ROWS}")
    rng = random.Random(SEED)
    listings: list[dict[str, object]] = []
    for index in range(rows):
        neighborhood, base_lat, base_lon, postal_code = NEIGHBORHOODS[index % len(NEIGHBORHOODS)]
        property_type = PROPERTY_TYPES[(index * 3) % len(PROPERTY_TYPES)]
        bedrooms = 1 + index % 4
        bathrooms = round(1 + (index % 5) * 0.5, 1)
        square_feet = 575 + bedrooms * 260 + (index % 9) * 45
        amenities = AMENITY_SETS[index % len(AMENITY_SETS)]
        price = 425_000 + bedrooms * 245_000 + (index % 17) * 28_500 + (index % 5) * 35_000
        title = f"{bedrooms}-bedroom {property_type} in {neighborhood}"
        description = (
            f"Synthetic {property_type} with {bedrooms} bedrooms, {bathrooms:g} bathrooms, "
            f"and {square_feet} square feet in {neighborhood}. Features {', '.join(amenities)}. "
            "Created for a Databricks real-estate demonstration; not a real property listing."
        )
        listings.append({
            "listing_id": f"SYN-{index + 1:04d}", "title": title, "description": description,
            "property_type": property_type, "status": STATUSES[index % len(STATUSES)],
            "price": price, "bedrooms": bedrooms, "bathrooms": bathrooms,
            "square_feet": square_feet, "year_built": 1920 + (index * 7) % 105,
            "neighborhood": neighborhood, "city": "New York", "state": "NY",
            "postal_code": postal_code,
            "latitude": round(base_lat + rng.uniform(-0.009, 0.009), 6),
            "longitude": round(base_lon + rng.uniform(-0.009, 0.009), 6),
            "amenities": "|".join(amenities),
        })
    return listings


def write_csv(records: list[dict[str, object]], output: Path) -> str:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
    return hashlib.sha256(output.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--output", type=Path, default=Path(__file__).parents[1] / "data/listings.csv")
    args = parser.parse_args()
    digest = write_csv(generate(args.rows), args.output)
    print(f"wrote {args.rows} synthetic listings to {args.output} (sha256={digest})")


if __name__ == "__main__":
    main()
