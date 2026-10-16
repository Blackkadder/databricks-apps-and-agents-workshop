#!/usr/bin/env python3
"""Validate, create, update, and round-trip the Home Listings Advisor space."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

DEFAULT_PROFILE = "fe-vm-serverless-stable-s967xa"
DEFAULT_TABLE = "hackathon_prep.compass.listings"
DEFAULT_WAREHOUSE = "7fdbdb9a13f359b9"
TITLE = "Home Listings Advisor"
DESCRIPTION = "Explore governed synthetic property listings with natural-language analytics."


def render(template_path: Path, table: str) -> dict[str, Any]:
    if len(table.split(".")) != 3:
        raise ValueError("table must use catalog.schema.table format")
    space = json.loads(template_path.read_text(encoding="utf-8").replace("{{TABLE_IDENTIFIER}}", table))
    normalize_ids(space)
    for source in space.get("data_sources", {}).get("tables", []):
        source.get("column_configs", []).sort(key=lambda item: item["column_name"])
    validate(space, table)
    return space


def normalize_ids(value: object) -> None:
    """Convert readable template IDs to stable API-compatible opaque IDs."""
    if isinstance(value, dict):
        if isinstance(value.get("id"), str):
            value["id"] = hashlib.sha256(value["id"].encode()).hexdigest()[:32]
        for child in value.values():
            normalize_ids(child)
    elif isinstance(value, list):
        for child in value:
            normalize_ids(child)
        if value and all(isinstance(child, dict) and isinstance(child.get("id"), str) for child in value):
            value.sort(key=lambda child: child["id"])


def validate(space: dict[str, Any], table: str) -> None:
    if space.get("version") != 2:
        raise ValueError("Genie serialized_space version must be 2")
    tables = space.get("data_sources", {}).get("tables", [])
    if [item.get("identifier") for item in tables] != [table]:
        raise ValueError("Genie space must contain exactly the configured listings table")
    required = ("synthetic", "listing_id", "relax", "protected", "price_per_sqft")
    policy = " ".join(space.get("instructions", {}).get("text_instructions", [{}])[0].get("content", [])).lower()
    missing = [word for word in required if word not in policy]
    if missing:
        raise ValueError(f"grounding policy is missing: {missing}")
    examples = space.get("instructions", {}).get("example_question_sqls", [])
    benchmarks = space.get("benchmarks", {}).get("questions", [])
    if len(examples) < 5 or len(benchmarks) < 5:
        raise ValueError("at least five examples and benchmarks are required")
    for entry in examples + benchmarks:
        raw = entry.get("sql") or entry.get("answer", [{}])[0].get("content", [])
        sql = "".join(raw)
        if table not in sql or any(keyword in sql.upper() for keyword in (" INSERT ", " UPDATE ", " DELETE ", " MERGE ")):
            raise ValueError(f"benchmark SQL must be read-only and use only {table}: {entry.get('id')}")


def api(profile: str, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    command = ["databricks", "api", method, path, "--profile", profile]
    if payload is not None:
        command += ["--json", json.dumps(payload)]
    env = {**os.environ, "DATABRICKS_AUTH_STORAGE": "plaintext"}
    result = subprocess.run(command, capture_output=True, text=True, env=env)
    if result.returncode:
        raise RuntimeError(f"Databricks API {method.upper()} {path} failed: {result.stderr.strip()}")
    return json.loads(result.stdout or "{}")


def apply(space: dict[str, Any], profile: str, warehouse: str, parent_path: str, space_id: str | None) -> str:
    payload = {
        "title": TITLE, "description": DESCRIPTION, "warehouse_id": warehouse,
        "serialized_space": json.dumps(space, separators=(",", ":")),
    }
    if space_id:
        response = api(profile, "patch", f"/api/2.0/genie/spaces/{space_id}", payload)
        result_id = response.get("space_id", space_id)
    else:
        payload["parent_path"] = parent_path
        response = api(profile, "post", "/api/2.0/genie/spaces", payload)
        result_id = response["space_id"]
    fetched = api(profile, "get", f"/api/2.0/genie/spaces/{result_id}?include_serialized_space=true")
    actual = json.loads(fetched["serialized_space"])
    validate(actual, space["data_sources"]["tables"][0]["identifier"])
    if fetched.get("warehouse_id") != warehouse:
        raise RuntimeError("round-trip warehouse mismatch")
    return result_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, default=Path(__file__).parents[1] / "config/genie/listings-space.json")
    parser.add_argument("--table", default=os.getenv("UC_LISTINGS_TABLE", DEFAULT_TABLE))
    parser.add_argument("--warehouse", default=os.getenv("DATABRICKS_WAREHOUSE_ID", DEFAULT_WAREHOUSE))
    parser.add_argument("--profile", default=os.getenv("DATABRICKS_CONFIG_PROFILE", DEFAULT_PROFILE))
    parser.add_argument("--parent-path", default="/Workspace/Users/rob.bajra@databricks.com")
    parser.add_argument("--space-id", default=os.getenv("DATABRICKS_GENIE_SPACE_ID"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    space = render(args.template, args.table)
    if not args.apply:
        print(json.dumps({"valid": True, "title": TITLE, "warehouse_id": args.warehouse, "serialized_space": space}, indent=2))
        return
    print(apply(space, args.profile, args.warehouse, args.parent_path, args.space_id))


if __name__ == "__main__":
    main()
