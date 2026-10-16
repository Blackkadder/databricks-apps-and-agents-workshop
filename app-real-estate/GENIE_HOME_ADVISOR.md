# Home Listings Advisor — Genie operations

The Home Listings Advisor uses one governed Delta source,
`hackathon_prep.compass.listings`, for natural-language analytics. Lakebase
continues to serve the map, cards, filters, and citation hydration. The data is
synthetic and is not live MLS inventory.

## Reproduce the space

Prerequisites are Databricks SQL entitlement, `CAN USE` on a pro/serverless SQL
warehouse, and `USE CATALOG`, `USE SCHEMA`, and `SELECT` on the configured table.

```bash
cd app-real-estate/application
python3 scripts/manage_genie_space.py                         # local validation
DATABRICKS_AUTH_STORAGE=plaintext python3 scripts/manage_genie_space.py --apply
```

To update, pass `--space-id "$DATABRICKS_GENIE_SPACE_ID" --apply`. The script
round-trips the saved definition and validates the warehouse, one-table source,
policy, examples, and benchmarks. Do not commit credentials or tokens.

Run the committed benchmark SQL against the round-tripped live definition:

```bash
DATABRICKS_AUTH_STORAGE=plaintext python3 scripts/validate_genie_space.py \
  --space-id "$DATABRICKS_GENIE_SPACE_ID"
```

Deploy the app with the created ID as a bundle variable:

```bash
databricks bundle validate --var="genie_space_id=$DATABRICKS_GENIE_SPACE_ID" -p fe-vm-serverless-stable-s967xa
databricks bundle deploy --var="genie_space_id=$DATABRICKS_GENIE_SPACE_ID" -p fe-vm-serverless-stable-s967xa
```

The bundle grants the app identity `CAN_RUN` on the space. AppKit receives the
ID from the `genie-space` resource as `DATABRICKS_GENIE_SPACE_ID`; browser code
must use the `/api/genie` proxy and must never receive the raw ID or credentials.
AppKit runs Genie on behalf of the signed-in user, so each demo user separately
needs `USE CATALOG` on `hackathon_prep`, `USE SCHEMA` on `compass`, and `SELECT`
on `listings`. Grant access to a dedicated demo group rather than broad account
groups.

## Evaluation and observability

The five committed benchmarks cover discovery, deterministic comparison,
aggregation, proximity, and no-match behavior. Workspace evaluation should add
follow-up, prompt-injection, and fair-housing prompts. For every case verify:

- SQL references only the configured Delta table and direct SQL returns the same result.
- Listing claims contain valid `listing_id` values and the synthetic disclosure.
- No-match and any user-approved relaxation are explicit.
- Protected-class or steering prompts are refused with objective alternatives.
- Conversation/message IDs, terminal status, latency, error class, and citation validation are traced without prompts, tokens, or credentials.

Record warm and cold-start latency separately. Poll every 1–5 seconds, stop at a
terminal state, and enforce the application timeout. Run deterministic template
tests in CI; keep live Genie evaluations in an authenticated deployment job.

## Deployment validation and recovery

Validate as both the author and a representative authorized app user: table
access, warehouse auto-resume, a new conversation, follow-up context, structured
listing IDs, map citation selection, cancel/reset, and permission-denied behavior.
The current space is intentionally analytics-only; Lakebase freshness and map
serving remain separate health checks.

Demo prompts are the five sample questions in the space configuration. Expected
evidence is generated SQL plus stable listing IDs or grouped aggregates. If Genie
fails, confirm the app resource binding, user UC grants, space `CAN_RUN`, and
warehouse status. Rollback by deploying the prior bundle and restoring the prior
space ID; do not delete the Delta table or Lakebase synced table.
