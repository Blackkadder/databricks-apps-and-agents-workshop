#!/usr/bin/env python3
"""Validate Lakebase row/ID parity using a runtime-supplied PostgreSQL URL."""

import argparse
import csv
import os
from pathlib import Path


def validate(csv_path: Path, database_url: str) -> None:
    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("Install psycopg[binary] to validate Lakebase") from exc
    with csv_path.open(newline="", encoding="utf-8") as handle:
        expected = {row["listing_id"] for row in csv.DictReader(handle)}
    with psycopg.connect(database_url, connect_timeout=10) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT listing_id FROM listings")
            actual = {row[0] for row in cursor.fetchall()}
    if expected != actual:
        raise RuntimeError(f"Lakebase mismatch: missing={sorted(expected-actual)[:5]}, extra={sorted(actual-expected)[:5]}")
    print(f"Lakebase contains all {len(actual)} expected listing IDs")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=Path(__file__).parents[1] / "data/listings.csv")
    parser.add_argument("--database-url", default=os.getenv("LAKEBASE_DATABASE_URL"))
    args = parser.parse_args()
    if not args.database_url:
        parser.error("set LAKEBASE_DATABASE_URL or --database-url; credentials must be obtained at runtime")
    validate(args.csv, args.database_url)
