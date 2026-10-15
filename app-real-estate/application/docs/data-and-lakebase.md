# Synthetic data and Lakebase initialization

The demo has one logical dataset of exactly 600 deterministic synthetic listings.
The generator rejects any other row count. It contains no MLS content or real PII.

```bash
python3 scripts/generate_listings.py
python3 scripts/validate_listings.py
python3 -m unittest discover -s tests
```

The committed CSV SHA-256 is recorded in `data/listings.sha256`. Regenerating
with seed `20261015` must produce the same digest.

## Unity Catalog

Set Databricks Connect authentication (the CLI profile may be supplied through
its standard environment settings), then run:

```bash
DATABRICKS_CATALOG=hackathon_prep DATABRICKS_SCHEMA=compass python3 scripts/init_delta.py
```

The command replaces `hackathon_prep.compass.listings`, preserves the fixed IDs,
and adds synthetic-data comments. The operator needs USE CATALOG, USE SCHEMA,
CREATE TABLE, MODIFY, and SELECT. Table ownership should remain with the demo
deployment principal or an owning group.

## Lakebase synced table

`lakebase_sync.py` is dry-run unless `--execute` is explicitly supplied. It uses
the Lakebase Autoscaling `databricks postgres` API to plan a project, production
branch database, and UC synced table. It obtains no secrets; CLI OAuth is
resolved at runtime.

```bash
python3 scripts/lakebase_sync.py --profile fe-vm-serverless-stable-s967xa
# Inspect, then repeat with --execute.
```

Run `python3 scripts/lakebase_status.py` to retrieve status/freshness metadata
and fail if the reported state is not ready. Once the table is ONLINE,
then connect with a runtime OAuth credential, apply
`scripts/sql/lakebase_indexes.sql`, and run `validate_lakebase.py`. The latter
compares the complete CSV and Lakebase ID sets and fails on any missing/extra ID.
A non-ONLINE state that stops advancing should be treated as stalled; inspect
the synced-table status message and source-table privileges. Reset is explicit:
delete the synced table first, then recreate it; never embed database passwords.

## AppKit server integration

`server/listings/router.ts` exports `createListingsRouter(service)`. The AppKit
server integration should build a `QueryClient` backed by its Lakebase resource
binding and mount the returned router at `/api/listings`. This module intentionally
does not read credentials or create its own pool, allowing AppKit to own auth and
connection lifecycle.
