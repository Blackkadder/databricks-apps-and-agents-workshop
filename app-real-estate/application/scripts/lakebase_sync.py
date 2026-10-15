#!/usr/bin/env python3
"""Render Lakebase Autoscaling provisioning/sync commands; execute explicitly."""

from __future__ import annotations

import argparse
import json
import subprocess


def commands(project: str, branch: str, database: str, source: str, profile: str) -> list[list[str]]:
    parent = f"projects/{project}/branches/{branch}"
    return [
        ["databricks", "postgres", "create-project", project, "--profile", profile],
        ["databricks", "postgres", "create-database", parent, "--database-id", database,
         "--replace-existing", "--profile", profile],
        ["databricks", "postgres", "create-synced-table", source, "--profile", profile],
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Provision Autoscaling Lakebase and sync UC (dry-run by default)")
    parser.add_argument("--project", default="real-estate-intelligence")
    parser.add_argument("--branch", default="production")
    parser.add_argument("--database", default="databricks-postgres")
    parser.add_argument("--source", default="hackathon_prep.compass.listings")
    parser.add_argument("--profile", default="fe-vm-serverless-stable-s967xa")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    plan = commands(args.project, args.branch, args.database, args.source, args.profile)
    if not args.execute:
        print(json.dumps({"dry_run": True, "commands": plan}, indent=2))
        return
    for command in plan:
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
