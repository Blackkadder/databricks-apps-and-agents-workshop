# Real Estate Intelligence Demo — Product Requirements Document

## 1. Product summary

Build a small Databricks App that helps a real-estate professional explore synthetic property listings on a map and ask an AI agent natural-language questions about them. The demo must showcase:

- Databricks Apps built with [AppKit v0](https://developers.databricks.com/docs/appkit/v0) as the user experience
- Databricks agents for conversational listing discovery and comparison
- Lakebase synced tables and search for low-latency retrieval
- Geospatial plots driven by listing latitude and longitude
- Unity Catalog and Delta as the governed system of record

**One-line pitch:** Turn governed listing data into an interactive map and an AI property advisor—without moving data outside Databricks.

## 2. Demo audience and duration

- **Audience:** Technical decision-makers, data/AI leaders, solution architects, and real-estate stakeholders
- **Target duration:** 8–12 minutes
- **Primary presenter goal:** Show a coherent flow from governed data to operational search, agent reasoning, and a polished geospatial application

## 3. Problem statement

Property search experiences often force users to choose between rigid filters and generic AI responses. Filters cannot interpret nuanced intent such as “a family-friendly home near transit with outdoor space,” while generic LLMs may answer without grounding in current inventory. Teams also need operationally fast search without creating an unmanaged copy of analytics data.

This demo should show how Databricks can provide a governed, grounded, and responsive experience using one compact dataset across Delta, Lakebase, an agent, and an interactive map.

## 4. Goals

1. Generate a reproducible synthetic dataset containing fewer than 500 property listings.
2. Store the same logical dataset as a CSV artifact, a Unity Catalog Delta table, and a Lakebase synced table.
3. Present listings on an interactive map with useful filters and a synchronized results view.
4. Let users search listings by natural language and ask grounded follow-up questions through a Databricks agent.
5. Demonstrate traceability from an agent response back to specific listing records.
6. Provide initialization, validation, reset, and demo instructions that another presenter can run reliably.

## 5. Non-goals

- Production MLS ingestion or redistribution
- More than one source/domain table
- Real customer, owner, or personally identifiable information
- Transaction processing, offers, mortgages, or closing workflows
- Production-grade ranking, recommendations, or fair-housing compliance certification
- A nationwide or globally complete property dataset

## 6. Personas and core jobs

### Real-estate advisor

- Find listings that satisfy nuanced buyer preferences.
- Compare a shortlist using price, space, amenities, and location.
- Explain recommendations with evidence from current listings.

### Prospective buyer

- Explore an area visually.
- Discover suitable homes without knowing exact filter values.
- Ask follow-up questions and understand why a listing was recommended.

### Demo presenter

- Initialize the environment predictably.
- Reset the app between sessions.
- Explain how Delta, Lakebase, agents, and the app work together.

## 7. Demo narrative

### Act 1 — Explore the market

Open the app to a city-level map. Filter by property type, price, bedrooms, and neighborhood. Markers and listing cards update together.

**Message:** Governed Delta data can power an intuitive geospatial application.

### Act 2 — Search by intent

Ask: “Show me three 2+ bedroom homes under $900K near transit with outdoor space, and explain the tradeoffs.”

The app returns grounded matches, highlights them on the map, and cites listing IDs.

**Message:** The agent turns natural language into useful discovery grounded in the available inventory.

### Act 3 — Refine conversationally

Ask: “Which one offers the best value per square foot? Prefer quieter neighborhoods.”

The agent retains context, compares only valid candidates, and explains its calculation and qualitative judgment.

**Message:** Multi-turn agent experiences can combine structured filters, retrieval, tools, and reasoning.

### Act 4 — Show Lakebase

Demonstrate that listing search and detail lookup are served from a Lakebase synced table while Delta remains the governed source.

**Message:** Lakebase supports low-latency operational access without a bespoke ingestion pipeline.

### Act 5 — Under the hood

Show the one-table data flow, agent tools, citations, Unity Catalog lineage/governance, and request traces.

## 8. Functional requirements

### 8.1 Initialization and data

- A single command or documented sequence must initialize all demo data resources.
- Use a fixed random seed so repeated initialization produces the same dataset.
- Generate exactly **600 synthetic listings** in a single table and reject any other row count.
- Generate exactly one logical source table named `listings`.
- Write the generated records to:
  1. `data/listings.csv`
  2. A Unity Catalog Delta table, configurable as `<catalog>.<schema>.listings`
  3. A Lakebase synced table sourced from that Delta table
- Initialization must be idempotent or support an explicit reset/rebuild option.
- Scripts must validate row count, uniqueness, required fields, coordinate bounds, and successful sync readiness.
- Synthetic data must be clearly labeled and contain no real names, contact details, or MLS records.

### 8.2 Dataset contract

The `listings` table should contain the following fields. Additional derived fields are allowed only if they remain in this same table.

| Field | Type | Requirement |
|---|---|---|
| `listing_id` | string | Unique, stable synthetic identifier |
| `title` | string | Short display name |
| `description` | string | Natural-language property description suitable for retrieval |
| `property_type` | string | Controlled values such as condo, co-op, townhouse, or single-family |
| `status` | string | Controlled values such as active or pending |
| `price_usd` | integer | Positive asking price |
| `bedrooms` | integer | Non-negative |
| `bathrooms` | decimal | Positive half-bath increments permitted |
| `square_feet` | integer | Positive interior area |
| `price_per_sqft` | decimal | Derived and validated |
| `year_built` | integer | Plausible four-digit year |
| `neighborhood` | string | Synthetic or generalized neighborhood label |
| `city` | string | Demo city |
| `state` | string | Two-character state code |
| `postal_code` | string | Synthetic but structurally plausible |
| `latitude` | double | Valid latitude within the selected demo region |
| `longitude` | double | Valid longitude within the selected demo region |
| `amenities` | array/string | Searchable features such as balcony, parking, doorman, or yard |
| `transit_score` | integer | Synthetic 0–100 score |
| `walk_score` | integer | Synthetic 0–100 score |
| `days_on_market` | integer | Non-negative |
| `listed_at` | date/timestamp | Plausible recent listing date |
| `has_outdoor_space` | boolean | Filterable feature |
| `has_parking` | boolean | Filterable feature |
| `lakebase_synced_at` | timestamp, optional | Operational freshness indicator if supported by the sync design |

Descriptions must be generated from the structured attributes so claims remain internally consistent. Coordinates should be spatially distributed enough to make map filtering and clustering visually meaningful.

### 8.3 Map and listing experience

- Render all current filtered results as geospatial points.
- Automatically fit the viewport to visible results; use clustering where appropriate.
- Encode at least one metric visually, such as price band, property type, or status.
- Selecting a marker must open a concise listing card with price, beds, baths, area, neighborhood, and description.
- Filters must include price range, bedrooms, property type, neighborhood, and at least one amenity.
- The map, result count, and listing cards must stay synchronized.
- Include loading, empty, and error states.
- Include a reset action that restores default filters, map viewport, selected listings, and chat state.

### 8.4 Lakebase search

- Provision a Lakebase database/project using environment configuration rather than hard-coded identifiers.
- Create a synced table from the Delta `listings` table.
- Add appropriate indexes for detail lookup and common structured filters.
- Provide a search path over `title`, `description`, `neighborhood`, and `amenities`; implementation may use Lakebase full-text search, vector search, or a documented hybrid approach supported by the target environment.
- Return stable `listing_id` values, relevance information where available, and only fields required by the app/agent.
- Expose and visibly report last-known freshness or sync status.
- Define a fallback/error message when Lakebase is unavailable; do not silently fabricate results.

### 8.5 Agent experience

- Provide an agent tool for intent-based listing search backed by Lakebase.
- Provide a tool for exact listing lookup and a tool for deterministic comparison/calculation.
- Preserve conversation context across follow-up questions within a session.
- Every recommendation must cite one or more `listing_id` values returned by tools.
- The agent must state when no listing satisfies all constraints and may explain which constraint was relaxed only after making that explicit.
- Numeric comparisons such as price per square foot must be computed from tool data, not guessed by the model.
- The system prompt must identify the dataset as synthetic and prohibit claims outside the available data.
- Agent responses must avoid steering or protected-class recommendations and include a concise fair-housing guardrail.
- Capture traces sufficient to inspect tool inputs, tool outputs, latency, and failures.

### 8.6 Configuration and operations

- Use **AppKit v0** as the required application framework; do not substitute Streamlit or a custom standalone React/FastAPI scaffold.
- Follow the AppKit v0 project structure, development workflow, authentication patterns, resource bindings, and deployment conventions from the official documentation.
- Pin the AppKit dependency/version used by the project and document any v0 limitations or required preview features.
- Keep workspace host, catalog, schema, warehouse, model endpoint, Lakebase resource, and app URL in environment/configuration files.
- Commit an `.env.example`; do not commit credentials.
- Provide scripts or commands for `init`, `validate`, `run`, and `reset`.
- Provide a presenter runbook with exact demo prompts and expected response characteristics.

## 9. Reference architecture

```text
Synthetic generator
      |
      +--> data/listings.csv
      |
      +--> Unity Catalog Delta: <catalog>.<schema>.listings
                                      |
                                      v
                              Lakebase synced table
                               |              |
                               v              v
                         App search API   Agent tools
                               \              /
                                \            /
                                 Databricks App
                              map + cards + chat
```

Delta is the governed source of truth. Lakebase is the operational serving layer. The UI should never treat model-generated text as a source of listing facts.

## 10. User experience outline

- **Header:** Demo name, “Synthetic data” badge, sync status, reset, and “How it works.”
- **Filter rail:** Price, bedrooms, property type, neighborhood, amenities.
- **Primary canvas:** Interactive map with markers/clusters.
- **Results panel:** Sortable listing cards linked to map markers.
- **Advisor panel:** Chat, suggested prompts, grounded responses, and clickable listing citations.
- **Architecture modal/page:** Delta → Lakebase → agent/app data flow and governance notes.

## 11. Success criteria

- A new environment can be initialized from repository instructions without manual data editing.
- The CSV, Delta table, and Lakebase synced table each expose the same 600 listing IDs.
- Exactly 600 rows exist in the source dataset.
- Map points use valid coordinates and respond correctly to all required filters.
- Search returns relevant results for the scripted demo prompts.
- Agent answers cite valid listing IDs and contain no unsupported property facts in the scripted flow.
- A presenter can complete the full demo in 8–12 minutes and reset it in under 10 seconds.
- Median structured search/detail latency and agent end-to-end latency are recorded during validation; target values are documented after the first deployed baseline.

## 12. Acceptance test scenarios

1. Run initialization twice and confirm it completes without duplicate records.
2. Verify CSV row count is 600 and IDs are unique.
3. Compare ID sets and key field checksums across CSV, Delta, and Lakebase.
4. Confirm all coordinates fall inside the configured demo-region bounding box.
5. Filter for a neighborhood and verify map markers, result count, and cards agree.
6. Search “2+ bedrooms under $900K near transit with outdoor space” and verify returned records satisfy or explicitly disclose relaxed constraints.
7. Ask a follow-up comparison and verify the agent retains the shortlist and calculates values correctly.
8. Click every cited listing ID and verify the corresponding map/card record opens.
9. Interrupt Lakebase access and verify a clear degraded-state message appears.
10. Reset and confirm filters, selection, viewport, and conversation state return to defaults.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Lakebase synced-table features differ by workspace/region | Add a preflight capability check and document supported runtime assumptions |
| Synthetic descriptions contradict structured fields | Generate descriptions from finalized attributes and validate embedded claims |
| Agent invents listing facts | Require tool grounding, listing citations, deterministic calculations, and scripted evaluations |
| Sparse or visually uninteresting map | Generate coordinates from several bounded neighborhood clusters with controlled variation |
| Demo query has no matches after regeneration | Use a fixed seed and validate scripted prompts during initialization |
| Real-estate recommendations create fair-housing risk | Avoid protected-class attributes and steering; add system-prompt and UI guardrails |

## 14. Open decisions

- Select the demo city and bounding box; the default proposal is a fictionalized NYC-like market.
- Confirm the target Lakebase product/version and supported search/index capabilities.
- Choose the Databricks agent framework/model endpoint available in the target workspace.
- Set latency targets after the first deployment baseline.

## 15. Definition of done

The feature is done when the initialization and validation scripts pass in the target workspace, the app can complete the five-act demo using exactly one synthetic listing table with fewer than 500 records, and the presenter runbook has been rehearsed successfully end to end.

