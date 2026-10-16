#!/usr/bin/env python3
"""Run read-only workspace validation for the committed Genie benchmarks."""

from __future__ import annotations

import argparse
import json
import os
import subprocess

from manage_genie_space import DEFAULT_PROFILE, DEFAULT_TABLE, DEFAULT_WAREHOUSE, api, validate


def execute_sql(statement: str, warehouse: str, profile: str) -> dict:
    command = ["databricks", "api", "post", "/api/2.0/sql/statements", "--profile", profile, "--json",
               json.dumps({"warehouse_id": warehouse, "statement": statement, "wait_timeout": "50s", "format": "JSON_ARRAY"})]
    result = subprocess.run(command, capture_output=True, text=True,
                            env={**os.environ, "DATABRICKS_AUTH_STORAGE": "plaintext"})
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    response = json.loads(result.stdout)
    if response.get("status", {}).get("state") != "SUCCEEDED":
        raise RuntimeError(str(response.get("status")))
    return response


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--space-id", default=os.getenv("DATABRICKS_GENIE_SPACE_ID"), required=not os.getenv("DATABRICKS_GENIE_SPACE_ID"))
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    args = parser.parse_args()
    fetched = api(args.profile, "get", f"/api/2.0/genie/spaces/{args.space_id}?include_serialized_space=true")
    space = json.loads(fetched["serialized_space"])
    validate(space, DEFAULT_TABLE)
    warehouse = fetched.get("warehouse_id", DEFAULT_WAREHOUSE)
    outcomes = []
    for benchmark in space["benchmarks"]["questions"]:
        sql = "".join(benchmark["answer"][0]["content"])
        response = execute_sql(sql, warehouse, args.profile)
        outcomes.append({"id": benchmark["id"], "rows": response.get("manifest", {}).get("total_row_count", 0)})
    print(json.dumps({"space_id": args.space_id, "warehouse_id": warehouse, "benchmarks": outcomes}, indent=2))
