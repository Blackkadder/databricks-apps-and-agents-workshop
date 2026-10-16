# Real Estate Explorer

An AppKit v0 Databricks App that combines a map-first property search experience with governed conversational analytics.

The demo uses one deterministic table of 600 synthetic listings to showcase:

- Databricks Apps and [AppKit v0](https://developers.databricks.com/docs/appkit/v0)
- Unity Catalog Delta as the governed source of truth
- Lakebase synced-table search for low-latency filters and listing retrieval
- Databricks Genie for the multi-turn Home Advisor
- Leaflet and OpenStreetMap for interactive geospatial exploration

All listings, prices, descriptions, and property details are synthetic. This is not live MLS inventory or financial advice.

## Experience

- Explore listings on a real, interactive marker-clustered map.
- Search and filter across all 600 Lakebase-hosted records.
- Display at most 100 records on the map and in cards at any time.
- Ask the Genie-powered Home Advisor discovery, comparison, and aggregate questions.
- Open verified `listing_id` citations directly on the corresponding marker and card.
- Continue follow-up questions within the same Genie conversation.
- Use a monochrome, image-free, responsive interface designed around the map.

## Architecture

```text
Synthetic generator
      |
      +--> data/listings.csv (600 rows)
      |
      +--> Unity Catalog Delta: <catalog>.<schema>.listings
                    |                         |
                    v                         v
          Lakebase synced table       Databricks Genie
                    |                         |
                    v                         v
             map/search APIs        Home Advisor API
                    \                         /
                     \                       /
                      AppKit React application
```

Delta powers governed Genie analytics. Lakebase independently serves operational map search, filters, exact listing lookup, and citation verification.

## Repository guide

- [Product requirements](PRD.md)
- [Original issue breakdown](ISSUES.md)
- [Home Advisor PRD](HOME_ADVISOR_PRD.md)
- [Home Advisor issue breakdown](HOME_ADVISOR_ISSUES.md)
- [Genie operations](GENIE_HOME_ADVISOR.md)
- [Presenter runbook](RUNBOOK.md)
- [Application setup](application/README.md)
- [Data and Lakebase design](application/docs/data-and-lakebase.md)

## Prerequisites

- Node.js 22+
- pnpm 11+
- Python 3.11+
- Databricks CLI 0.229+
- A serverless Databricks workspace with Unity Catalog, a PRO or serverless SQL warehouse, Lakebase Autoscaling, AI/BI Genie, and Databricks Apps

Authenticate with a named CLI profile. Do not commit credentials or local `.env` files.

```bash
databricks auth login \
  --host https://<workspace-host> \
  --profile <profile>
```

## Local validation

Run commands from `app-real-estate/application`:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
python3 -m unittest discover -s tests
```

The test suites cover listing search, the 100-record boundary, Home Advisor sessions and citations, Genie answer extraction, guardrails, client contracts, and the 600-row data contract.

## Data initialization

The generator is deterministic and produces exactly 600 records.

```bash
pnpm data:generate
pnpm data:validate
python3 scripts/init_delta.py --profile <profile>
```

Create or refresh the Lakebase synced table and indexes using the commands documented in [data-and-lakebase.md](application/docs/data-and-lakebase.md). The Delta table has Change Data Feed enabled atomically so full refreshes remain valid.

## Genie Home Advisor

The Genie space is defined reproducibly in `application/config/genie/listings-space.json`. It uses one Delta table and contains curated metadata, example SQL, benchmark questions, synthetic-data disclosure, citation rules, and fair-housing safeguards.

```bash
python3 scripts/manage_genie_space.py
python3 scripts/validate_genie_space.py \
  --profile <profile> \
  --space-id <genie-space-id>
```

For creation, updates, permissions, and recovery, follow [GENIE_HOME_ADVISOR.md](GENIE_HOME_ADVISOR.md).

## Development

```bash
cd app-real-estate/application
cp .env.example .env
pnpm dev
```

Local resource values come from the selected CLI profile and `.env`. The deployed app receives Lakebase and Genie identifiers through Databricks App resource bindings.

## Deployment

```bash
DATABRICKS_AUTH_STORAGE=plaintext databricks bundle validate \
  --profile <profile> \
  --var genie_space_id=<genie-space-id>

DATABRICKS_AUTH_STORAGE=plaintext databricks bundle deploy \
  --profile <profile> \
  --var genie_space_id=<genie-space-id>
```

If only source files changed, create a new application snapshot after bundle sync:

```bash
DATABRICKS_AUTH_STORAGE=plaintext databricks apps deploy real-estate-intelligence \
  --source-code-path /Workspace/Users/<user>/.bundle/real-estate-intelligence/default/files \
  --auto-approve \
  --profile <profile>
```

The deployment binds the model endpoint, SQL warehouse, Lakebase database, and Genie space. Deployment health is available at `GET /api/home-advisor/health`.

## Guardrails and limitations

- The app refuses protected-class, demographic, safety, and steering requests.
- Listing citations are verified against Lakebase before becoming actionable.
- Genie and Lakebase may have different freshness; unavailable citations are disclosed rather than fabricated.
- The map and listing panel never render more than 100 records at once.
- Conversation state is process-local and intended for a demonstration, not durable production chat history.
- The dataset, ranking behavior, and guardrails are demonstration-grade and not a compliance certification.
