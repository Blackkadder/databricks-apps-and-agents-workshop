# Real Estate Intelligence Demo — Issue Breakdown

The issues below are ordered by dependency. Each issue is intended to be independently assignable and testable.

## Epic 1 — Foundation and reproducible data

### RE-001: Scaffold the AppKit v0 app and configuration

**Goal:** Create the minimal project structure and environment contract.

**Scope:** Create the project with [AppKit v0](https://developers.databricks.com/docs/appkit/v0), plus scripts, tests, data, configuration, `.env.example`, dependency management, and local/deployed run commands.

**Acceptance criteria:**

- The application uses AppKit v0 and follows its documented project structure, authentication, resource-binding, local-development, and deployment conventions.
- The AppKit dependency/version is pinned, and required v0 or preview assumptions are documented.
- The scaffold does not use Streamlit or a custom standalone React/FastAPI application framework.
- No secrets or workspace-specific IDs are committed.
- Catalog, schema, warehouse, Lakebase resource, model endpoint, and row count are configurable.
- README documents prerequisites and the `init`, `validate`, `run`, and `reset` commands.

**Dependencies:** None

### RE-002: Define and generate the synthetic listings dataset

**Goal:** Generate a deterministic, useful dataset for search, mapping, and the scripted demo.

**Scope:** One `listings` schema, fixed seed, clustered coordinates, internally consistent descriptions, and exactly 600 rows.

**Acceptance criteria:**

- Generator creates exactly one logical table with 600 rows.
- Generator rejects requests for any other row count.
- IDs are unique; required fields are populated; coordinates and values are valid.
- No real PII or copied MLS content is present.
- The scripted search scenarios have known matching records.

**Dependencies:** RE-001

### RE-003: Write the CSV artifact and data-quality tests

**Goal:** Create a reviewable local artifact and validate the data contract.

**Acceptance criteria:**

- `data/listings.csv` is generated reproducibly.
- Automated tests cover schema, row limit, uniqueness, ranges, controlled values, and description consistency.
- A checksum or equivalent reproducibility assertion is documented.

**Dependencies:** RE-002

### RE-004: Create the Unity Catalog Delta table

**Goal:** Establish the governed source of truth.

**Acceptance criteria:**

- Initialization creates or replaces `<catalog>.<schema>.listings` idempotently.
- Delta row count and listing ID set match the CSV.
- Table and columns include comments stating that the data is synthetic.
- Required permissions and ownership are documented.

**Dependencies:** RE-003

## Epic 2 — Lakebase operational serving

### RE-005: Provision and configure Lakebase resources

**Goal:** Create the target database/project and secure connectivity.

**Acceptance criteria:**

- Setup uses configurable resource names and supported authentication.
- Credentials are obtained at runtime and never committed.
- Preflight checks produce actionable errors for unsupported or missing capabilities.
- Teardown/reset behavior is documented.

**Dependencies:** RE-001

### RE-006: Create and validate the Lakebase synced table

**Goal:** Sync the Delta listings table into Lakebase.

**Acceptance criteria:**

- Synced table is sourced from the Unity Catalog Delta table.
- All 600 listing IDs become queryable in Lakebase.
- Sync status/freshness can be retrieved.
- Validation detects row/ID mismatches and stalled syncs.

**Dependencies:** RE-004, RE-005

### RE-007: Implement Lakebase listing search and indexes

**Goal:** Support fast detail, filter, and text/semantic retrieval.

**Acceptance criteria:**

- Exact lookup by `listing_id` is indexed.
- Common filters have an explained index strategy.
- Search covers title, description, neighborhood, and amenities.
- Queries use parameters rather than string concatenation.
- A test suite verifies relevance for the scripted prompts and records latency.

**Dependencies:** RE-006

## Epic 3 — Application and geospatial experience

### RE-008: Build the listing query API/service layer

**Goal:** Give the app a stable contract for filters, listing details, and search.

**Acceptance criteria:**

- Endpoints/functions support paginated filters, exact detail lookup, and intent search.
- Response models expose stable listing IDs and only required fields.
- Timeouts and Lakebase failures return clear typed errors.
- Unit/integration tests cover success, empty, invalid, and unavailable states.

**Dependencies:** RE-007

### RE-009: Build the synchronized geospatial map

**Goal:** Visualize and explore listings by location.

**Acceptance criteria:**

- Valid listings render as points and clusters.
- Viewport fits visible results.
- Marker selection opens the matching listing card.
- Price band, type, or status is visually encoded with an accessible legend.
- Empty and loading states are implemented.

**Dependencies:** RE-008

### RE-010: Build filters and listing cards

**Goal:** Provide a complete structured search experience around the map.

**Acceptance criteria:**

- Required filters are implemented and reflected in the URL or app state.
- Result count, cards, and markers always agree.
- Cards show price, beds, baths, square feet, neighborhood, and description.
- Selecting a card focuses the corresponding marker.
- Mobile/narrow-screen behavior is usable for demos.

**Dependencies:** RE-008, RE-009

## Epic 4 — Databricks agent

### RE-011: Implement grounded agent tools

**Goal:** Give the agent safe, typed access to listing search and calculations.

**Acceptance criteria:**

- Tools cover intent search, exact listing lookup, and deterministic comparison.
- Tool outputs always include stable listing IDs.
- Inputs are validated and queries are parameterized.
- Unit tests cover tool errors and no-match behavior.

**Dependencies:** RE-007, RE-008

### RE-012: Configure the real-estate advisor agent

**Goal:** Create a multi-turn agent that makes evidence-backed recommendations.

**Acceptance criteria:**

- System instructions identify the data as synthetic and restrict claims to tool results.
- Responses cite listing IDs and disclose relaxed constraints.
- Numeric comparisons use tool calculations.
- Follow-up questions preserve shortlist context.
- Fair-housing guardrails prohibit protected-class inference and steering.

**Dependencies:** RE-011

### RE-013: Integrate agent chat with map and cards

**Goal:** Make conversational results actionable in the UI.

**Acceptance criteria:**

- Suggested prompts cover discovery, refinement, and comparison.
- Cited listing IDs are clickable and select matching records on the map.
- Chat loading, retry, no-match, and error states are clear.
- Reset clears the conversation and related listing selection.

**Dependencies:** RE-010, RE-012

### RE-014: Add tracing and agent evaluation

**Goal:** Demonstrate observability and prevent unsupported answers.

**Acceptance criteria:**

- Traces capture model calls, tool calls, latency, and errors without secrets.
- An evaluation set includes the scripted demo prompts plus no-match and adversarial cases.
- Automated checks score citation validity, constraint satisfaction, and unsupported claims.
- Baseline results and known limitations are documented.

**Dependencies:** RE-012

## Epic 5 — Demo readiness

### RE-015: Add reset, health, and validation workflows

**Goal:** Make the demo recoverable and predictable.

**Acceptance criteria:**

- One validation command checks CSV, Delta, Lakebase sync, search, agent, and app health.
- Reset restores UI/chat state without rebuilding infrastructure.
- Data rebuild is separate, explicit, and idempotent.
- Failures identify the affected component and suggested remediation.

**Dependencies:** RE-004, RE-006, RE-013, RE-014

### RE-016: Add “How it works” architecture view

**Goal:** Explain the Databricks value proposition within the demo.

**Acceptance criteria:**

- View shows Delta as source, Lakebase as serving layer, agent tools, and Databricks App.
- Copy covers governance, grounding, operational latency, and synthetic-data status.
- Presenter can enter and exit the view without losing current demo state.

**Dependencies:** RE-013

### RE-017: Write and rehearse the presenter runbook

**Goal:** Deliver a repeatable 8–12 minute story modeled on the reference runbook.

**Acceptance criteria:**

- Runbook includes preflight, five acts, exact prompts, expected response characteristics, technical Q&A, and reset steps.
- Scripted prompts pass against the fixed dataset.
- A timed rehearsal completes within 8–12 minutes.
- Known limitations and recovery steps are included.

**Dependencies:** RE-015, RE-016

### RE-018: Package and deploy the AppKit v0 Databricks App

**Goal:** Deploy a secure, repeatable demo environment.

**Acceptance criteria:**

- Deployment uses the AppKit v0 workflow and its supported Databricks App packaging conventions.
- AppKit deployment instructions and app resource configuration are committed.
- App identity has least-privilege access to required resources.
- A clean deployment passes the full validation workflow.
- App URL, ownership, and cleanup steps are documented outside source-controlled secrets.

**Dependencies:** RE-015, RE-016, RE-017

## Suggested milestones

| Milestone | Issues | Demonstrable outcome |
|---|---|---|
| M1 — Governed dataset | RE-001–RE-004 | Reproducible CSV and Delta table |
| M2 — Operational search | RE-005–RE-008 | Synced Lakebase table with tested search |
| M3 — Visual app | RE-009–RE-010 | Filterable listing map and cards |
| M4 — Agent experience | RE-011–RE-014 | Grounded multi-turn advisor with traces |
| M5 — Demo ready | RE-015–RE-018 | Validated, deployed, rehearsed demo |

