#!/usr/bin/env python3
"""Retrieve synced-table status and fail clearly unless it is ready."""

import argparse
import json
import subprocess


def find_states(value: object) -> list[str]:
    states: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in {"state", "status", "phase", "current_state"} and isinstance(child, str):
                states.append(child)
            states.extend(find_states(child))
    elif isinstance(value, list):
        for child in value:
            states.extend(find_states(child))
    return states


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="synced_tables/hackathon_prep.compass.listings_synced")
    parser.add_argument("--profile", default="fe-vm-serverless-stable-s967xa")
    args = parser.parse_args()
    result = subprocess.run(
        ["databricks", "postgres", "get-synced-table", args.name, "--profile", args.profile, "--output", "json"],
        check=True, capture_output=True, text=True,
    )
    payload = json.loads(result.stdout)
    print(json.dumps(payload, indent=2))
    states = find_states(payload)
    if states and not any(state.upper() in {"ONLINE", "READY", "ACTIVE", "DONE"} for state in states):
        raise SystemExit(f"synced table is not ready (reported states: {states})")
