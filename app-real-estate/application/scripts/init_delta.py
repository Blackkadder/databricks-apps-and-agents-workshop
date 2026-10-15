#!/usr/bin/env python3
"""Idempotently create the governed Delta source through the SQL Statements API."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
from pathlib import Path

TABLE_COMMENT = "Synthetic real-estate listings for demonstration only; contains no MLS or personal data."


def identifier(value: str) -> str:
    if not value.replace("_", "").isalnum():
        raise ValueError("catalog and schema must be simple identifiers")
    return f"`{value}`"


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def execute(statement: str, warehouse: str, profile: str) -> dict[str, object]:
    payload = json.dumps({
        "statement": statement,
        "warehouse_id": warehouse,
        "format": "JSON_ARRAY",
        "wait_timeout": "50s",
    })
    result = subprocess.run(
        ["databricks", "api", "post", "/api/2.0/sql/statements/", "--json", payload, "--profile", profile],
        check=True,
        capture_output=True,
        text=True,
    )
    response = json.loads(result.stdout)
    state = response.get("status", {}).get("state")
    if state != "SUCCEEDED":
        raise RuntimeError(f"Databricks SQL statement did not succeed: {response.get('status')}")
    return response


def create_statement(rows: list[dict[str, str]], catalog: str, schema: str) -> str:
    columns = list(rows[0])
    values = ",\n".join(
        "(" + ",".join(literal(row[column]) for column in columns) + ")" for row in rows
    )
    aliases = ",".join(f"`{column}`" for column in columns)
    table = f"{identifier(catalog)}.{identifier(schema)}.`listings`"
    return f"""CREATE OR REPLACE TABLE {table}
USING DELTA
COMMENT {literal(TABLE_COMMENT)} AS
SELECT
  listing_id, title, description, property_type, status,
  CAST(price AS INT) AS price, CAST(bedrooms AS INT) AS bedrooms,
  CAST(bathrooms AS DOUBLE) AS bathrooms, CAST(square_feet AS INT) AS square_feet,
  CAST(price_per_sqft AS DOUBLE) AS price_per_sqft, CAST(year_built AS INT) AS year_built,
  neighborhood, city, state, postal_code, CAST(latitude AS DOUBLE) AS latitude,
  CAST(longitude AS DOUBLE) AS longitude, amenities, CAST(transit_score AS INT) AS transit_score,
  CAST(walk_score AS INT) AS walk_score, CAST(days_on_market AS INT) AS days_on_market,
  CAST(listed_at AS DATE) AS listed_at, CAST(has_outdoor_space AS BOOLEAN) AS has_outdoor_space,
  CAST(has_parking AS BOOLEAN) AS has_parking
FROM VALUES
{values}
AS source({aliases})"""


def initialize(csv_path: Path, catalog: str, schema: str, warehouse: str, profile: str) -> None:
    with csv_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows or len(rows) > 499:
        raise ValueError("CSV must contain between 1 and 499 listings")
    execute(f"CREATE SCHEMA IF NOT EXISTS {identifier(catalog)}.{identifier(schema)}", warehouse, profile)
    execute(create_statement(rows, catalog, schema), warehouse, profile)
    table = f"{identifier(catalog)}.{identifier(schema)}.`listings`"
    execute(f"ALTER TABLE {table} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)", warehouse, profile)
    validation = execute(
        f"SELECT count(*) AS rows, count(DISTINCT listing_id) AS ids FROM {table}", warehouse, profile
    )
    counts = validation.get("result", {}).get("data_array", [["0", "0"]])[0]
    if counts != [str(len(rows)), str(len(rows))]:
        raise RuntimeError(f"Delta validation mismatch: expected {len(rows)}, received {counts}")
    print(f"initialized {table} with {len(rows)} synthetic listings")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=os.getenv("DATABRICKS_CATALOG", "hackathon_prep"))
    parser.add_argument("--schema", default=os.getenv("DATABRICKS_SCHEMA", "compass"))
    parser.add_argument("--warehouse", default=os.getenv("DATABRICKS_WAREHOUSE_ID", "7fdbdb9a13f359b9"))
    parser.add_argument("--profile", default=os.getenv("DATABRICKS_CONFIG_PROFILE", "fe-vm-serverless-stable-s967xa"))
    parser.add_argument("--csv", type=Path, default=Path(__file__).parents[1] / "data/listings.csv")
    args = parser.parse_args()
    initialize(args.csv.resolve(), args.catalog, args.schema, args.warehouse, args.profile)
