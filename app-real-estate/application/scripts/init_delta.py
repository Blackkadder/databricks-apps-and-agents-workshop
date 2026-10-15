#!/usr/bin/env python3
"""Idempotently create the governed Delta source using Databricks Connect/Spark."""

import argparse
import csv
import os
from pathlib import Path

TABLE_COMMENT = "Synthetic real-estate listings for demonstration only; contains no MLS or personal data."


def qualified_table(catalog: str, schema: str) -> str:
    for value in (catalog, schema):
        if not value.replace("_", "").isalnum():
            raise ValueError("catalog and schema must be simple identifiers")
    return f"`{catalog}`.`{schema}`.`listings`"


def initialize(csv_path: Path, catalog: str, schema: str) -> None:
    try:
        from databricks.connect import DatabricksSession
        from pyspark.sql import functions as F
        from pyspark.sql.types import DoubleType, IntegerType
    except ImportError as exc:
        raise SystemExit("Install databricks-connect to initialize Delta") from exc
    spark = DatabricksSession.builder.getOrCreate()
    table = qualified_table(catalog, schema)
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS `{catalog}`.`{schema}`")
    # Materialize locally so Databricks Connect does not require the remote
    # cluster to see the developer's filesystem path.
    with csv_path.open(newline="", encoding="utf-8") as handle:
        frame = spark.createDataFrame(list(csv.DictReader(handle)))
    for column in ("price", "bedrooms", "square_feet", "year_built"):
        frame = frame.withColumn(column, F.col(column).cast(IntegerType()))
    for column in ("bathrooms", "latitude", "longitude"):
        frame = frame.withColumn(column, F.col(column).cast(DoubleType()))
    frame.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(table)
    spark.sql(f"COMMENT ON TABLE {table} IS '{TABLE_COMMENT}'")
    for column in frame.columns:
        spark.sql(f"ALTER TABLE {table} ALTER COLUMN `{column}` COMMENT 'Synthetic demo field'")
    delta_ids = {r.listing_id for r in spark.table(table).select("listing_id").collect()}
    csv_ids = {r.listing_id for r in frame.select("listing_id").collect()}
    if delta_ids != csv_ids:
        raise RuntimeError("Delta listing IDs do not match CSV")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=os.getenv("DATABRICKS_CATALOG", "hackathon_prep"))
    parser.add_argument("--schema", default=os.getenv("DATABRICKS_SCHEMA", "compass"))
    parser.add_argument("--csv", type=Path, default=Path(__file__).parents[1] / "data/listings.csv")
    args = parser.parse_args()
    initialize(args.csv.resolve(), args.catalog, args.schema)
