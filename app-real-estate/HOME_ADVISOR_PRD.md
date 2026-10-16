# Home Advisor with Databricks Genie — Product Requirements Document

## 1. Product summary

Add a Genie-powered Home Advisor to the Real Estate Explorer. Users should be able to ask natural-language questions about the synthetic listing inventory, refine questions conversationally, compare homes, and open cited listings on the map.

Genie queries the governed Unity Catalog Delta `listings` table. The existing Lakebase path remains responsible for low-latency map and filter queries. The app must present these as one coherent experience without exposing raw Genie APIs or workspace identifiers to the browser.

**One-line pitch:** Ask questions of governed listing data with Genie, then inspect every grounded result on an interactive map.

## 2. Problem statement

The current Home Advisor is a custom tool-calling agent backed by Lakebase. It can retrieve and compare listings, but it does not showcase Genie or let a curated Genie space answer analytical questions directly over the governed Delta table.

The feature should replace the user-facing advisor path with a Genie-backed experience while preserving the strongest parts of the current app: a map-first layout, stable listing citations, deterministic selection behavior, synthetic-data disclosure, and fair-housing safeguards.

## 3. Goals

1. Create one focused Genie space over the existing Delta `listings` table.
2. Integrate Genie into the AppKit v0 app through a server-side, typed Home Advisor contract.
3. Support discovery, refinement, comparison, and market-summary questions in a multi-turn conversation.
4. Ground listing-specific answers in stable `listing_id` citations that open the correct map marker and listing card.
5. Preserve Lakebase as the operational serving layer for filters, search, and the maximum 100 visible map records.
6. Fix advisor UI and interaction defects required for a polished desktop and mobile demo.
7. Add evaluations, health checks, observability, deployment configuration, and presenter guidance.

## 4. Non-goals

- Replacing Lakebase for map, card, or structured-filter serving
- Adding another source table or increasing the 600-row dataset
- Exposing raw generated SQL, credentials, tokens, or Genie resource IDs to the browser
- Real MLS data, home valuations, mortgage advice, or transaction workflows
- Recommendations based on protected classes or demographic proxies
- Listing images, generated property art, or image placeholders
- Unbounded map rendering; no more than 100 listing records may be visible at once

## 5. Users and jobs

### Prospective buyer

- Describe needs in natural language without knowing the available fields.
- Refine results through follow-up questions.
- Understand why a listing was cited and locate it on the map.

### Real-estate advisor

- Compare matching homes using governed facts and deterministic metrics.
- Ask market-level questions such as counts or median prices by neighborhood.
- Retain a shortlist while exploring tradeoffs.

### Demo presenter

- Show Delta as the governed analytical source and Lakebase as the operational serving layer.
- Demonstrate Genie conversation, cited listings, map interaction, and traceability.
- Recover clearly from permission, warehouse, Genie, or freshness failures.

## 6. Product principles

- **Grounded:** Listing facts come from query results, not model memory.
- **Traceable:** Every listing-specific recommendation includes verified structured citations.
- **Map-first:** Advisor interactions enhance the map and never reset it unexpectedly.
- **Governed:** Genie reads one Unity Catalog Delta table using least-privilege access.
- **Honest:** No matches, relaxed constraints, stale data, and unavailable services are disclosed.
- **Demo-safe:** The UI states that all listings are synthetic and avoids fair-housing steering.

## 7. Reference architecture

```text
Unity Catalog Delta: <catalog>.<schema>.listings (600 rows)
             |                              |
             |                              +--> Lakebase synced table
             |                                      |
             v                                      v
     Databricks Genie space                  map/search API
             |
             v
     AppKit Home Advisor API
             |
             +--> verified listing citations --> map + cards (max 100 visible)
```

The browser communicates only with the AppKit application. The server owns Genie resource resolution, conversation state, error translation, citation verification, and observability.

## 8. Functional requirements

### 8.1 Genie space and Delta table

- Create one Genie space named generically, such as `Real Estate Listings Advisor`.
- Configure exactly one data source: `<catalog>.<schema>.listings`.
- Use a configurable PRO or serverless SQL warehouse with auto-resume support.
- Document the table grain as one synthetic property listing per `listing_id`.
- Curate descriptions, synonyms, value examples, and units for price, square feet, price per square foot, scores, amenities, coordinates, dates, property type, status, and neighborhood.
- Space instructions must require synthetic-data disclosure, stable listing IDs, explicit no-match behavior, no silent constraint relaxation, deterministic use of stored `price_per_sqft`, and fair-housing-safe responses.
- Add representative example questions and verified SQL for discovery, comparison, aggregation, geospatial proximity, and no-match scenarios.
- Generated SQL must read only the configured listings table.

### 8.2 AppKit and resource configuration

- Use the AppKit v0 Genie integration and keep the existing AppKit application structure.
- Add a configurable Genie space ID and app resource binding with `CAN_RUN`.
- Keep catalog, schema, table, warehouse, and Genie identifiers in bundle/environment configuration rather than application logic.
- Use least privilege. The app identity needs only the access required to run the space; users using on-behalf-of access need the required catalog, schema, table, warehouse, and Genie permissions.
- Health output must distinguish missing configuration, permission failure, warehouse failure, and Genie unavailability.
- Do not send credentials, access tokens, or raw workspace resource identifiers to the client.

### 8.3 Home Advisor service contract

- Provide a typed server-side endpoint or AppKit wrapper for sending a message, continuing a conversation, retrieving status, cancelling an in-flight request, and resetting the conversation.
- Preserve the Genie conversation ID across follow-up questions and clear it only on explicit reset.
- Return answer text, response status, structured citations, conversation/message identifiers, optional map actions, and a typed error code.
- A citation contains at minimum a verified `listingId`; it may also include a display label or snippet.
- Verify every returned listing ID against application data before exposing it as actionable.
- Never require the UI to extract listing IDs from prose.
- Treat no-match as a successful answer with possible refinements, not a transport error.
- Do not silently fall back to invented results. If Genie is unavailable, show an explicit degraded state.
- Enforce a bounded response and interaction timeout; late results from cancelled or reset conversations must be ignored.

### 8.4 Advisor behavior

- Support questions for listing discovery, structured constraint refinement, deterministic comparisons, and aggregate market summaries.
- Preserve conversational context, including a prior shortlist, across follow-up turns.
- Explicitly state when no exact match exists and identify any relaxed constraint before presenting alternatives.
- Require an explicit numeric budget before interpreting terms such as “affordable.”
- Decline protected-class, demographic, school-as-proxy, or steering requests and offer objective property filters instead.
- Do not imply live MLS availability, financial advice, or facts outside the synthetic dataset.
- When Delta and Lakebase results differ because of freshness, disclose the mismatch and avoid presenting a missing record as currently visible inventory.

### 8.5 Map and citation integration

- Clicking a valid citation selects the matching listing card and marker using the stable `listing_id`.
- Advisor open/close must not recreate the map, change filters, clear the selection, refit bounds, or reset camera state.
- Citation navigation may pan or fly to one marker but must not trigger a global fit-to-results operation.
- If a cited listing is outside the current 100-record result window, fetch it by ID and show a temporary cited-result card/overlay without silently changing active filters.
- Missing or stale citations show an inline `Listing unavailable` state without breaking the conversation.
- Marker, card, citation, and selected-listing summary must always agree.
- Reset clears the Genie conversation, messages, pending request, draft, selection, and cited overlay in one deterministic action.

### 8.6 UI and visual fixes

- Label the feature `Home Advisor` and use accurate copy such as `Powered by Databricks Genie` and `Searching governed listing data`.
- Preserve the map as the dominant visual element.
- Use a strict black, white, and gray palette with accessible contrast; selection must not rely on color alone.
- Keep listing cards typography-first and image-free. Remove obsolete image/thumbnail presentation styles.
- Provide clear pending stages, cancellation, retry, no-match, timeout, permission, rate-limit, malformed-response, and unavailable states.
- Retry only the failed user prompt, never the preceding assistant response.
- Preserve the draft, transcript, scroll position, and map camera when the panel is closed and reopened.
- Desktop should keep the map visible or provide a non-destructive `View on map` action. Mobile citation activation should establish selection, collapse the advisor, reveal the map, and provide a clear return action.
- Use an `aria-live` message region, `role=status` for loading, keyboard-accessible citations, predictable focus behavior, and minimum 44 px touch targets.
- On small screens, use `100dvh`, safe-area padding, a sticky header/composer, and an independently scrollable transcript that remains usable with the software keyboard.

### 8.7 Evaluations and observability

- Add benchmark prompts for discovery, aggregation, comparison, follow-up context, geospatial proximity, no-match, prompt injection, and fair-housing behavior.
- Validate generated SQL success, allowed-table scope, constraint satisfaction, aggregate correctness, citation validity, unsupported claims, and map-action integrity.
- Compare aggregate answers against direct SQL and verify that every cited ID exists.
- Capture Genie conversation/message IDs, status, latency, failures, and app-side citation verification without logging secrets.
- Keep deterministic API/UI contract tests in CI and run workspace-dependent Genie evaluations separately.
- Record a deployed latency and quality baseline, including warehouse cold-start behavior.

## 9. UX flow

1. The user opens Home Advisor without disturbing the current map, filters, or selection.
2. The user chooses a suggestion or enters a question. The transcript immediately shows the user message and a cancellable `Asking Genie…` state.
3. Genie queries the governed Delta table and returns a grounded response.
4. The app verifies structured listing citations before rendering them.
5. The user selects a citation. The corresponding listing is made available, selected, and focused on the map without resetting the active search.
6. The user returns to the unchanged conversation and asks a follow-up.
7. Reset clears conversation and related map selection while preserving the underlying dataset and infrastructure.

## 10. Success criteria

- All benchmark prompts complete successfully as both the space author and a representative authorized app user.
- Generated SQL references only `<catalog>.<schema>.listings` and returns correct results for verified test cases.
- All actionable listing citations resolve to existing stable listing IDs.
- Multi-turn context works, while a new/reset conversation is isolated.
- Map and card rendering never exceeds 100 records.
- Advisor toggling leaves map center, zoom, filters, results, and selection unchanged.
- The app clearly distinguishes Genie/Delta analytics from Lakebase operational serving.
- No listing image requests are made and the monochrome visual/accessibility requirements pass review.
- A deployed validation covers permissions, warehouse auto-resume, Genie, citations, map focus, cancellation, reset, and error recovery.

## 11. Acceptance test scenarios

1. Ask for active homes under a numeric budget with an amenity and verify every result against direct SQL.
2. Ask for the five lowest-price-per-square-foot listings with structured constraints and verify order and calculations.
3. Ask for counts and median prices by neighborhood/property type and compare with direct SQL.
4. Ask a proximity question using a supplied coordinate and verify the documented distance calculation.
5. Ask an impossible question and verify explicit no-match behavior without fabricated citations.
6. Ask a follow-up about the prior shortlist, then reset and verify context isolation.
7. Submit a protected-class or steering request and verify a safe refusal with objective alternatives.
8. Click an in-window citation and verify exact card/marker selection without camera reset.
9. Click an out-of-window citation and verify a temporary cited result without changing active filters or exceeding 100 visible records.
10. Exercise timeout, cancellation, unauthorized, rate-limit, malformed-citation, and Genie-unavailable fixtures.
11. Validate at 1440 px, 1024 px, 390 px, 320 px, 200% zoom, and keyboard-only navigation.
12. Confirm no serious or critical accessibility violations and no network requests for listing images.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Generated SQL or prose varies between runs | Curate metadata/examples and evaluate constraints, SQL results, and citations rather than exact wording |
| Delta and Lakebase freshness differs | Surface freshness, verify citations, and handle unavailable operational records explicitly |
| Genie query latency harms the demo | Use an auto-resuming warehouse, staged progress UI, cancellation, timeouts, and a measured cold-start baseline |
| Permissions differ between author and app users | Validate both identities and document least-privilege grants and on-behalf-of behavior |
| Raw Genie output creates a brittle UI | Isolate Genie behind a typed server contract with stable error and citation models |
| Agent produces fair-housing-sensitive guidance | Apply space instructions, app guardrails, adversarial evaluations, and objective-filter alternatives |
| Advisor interaction disrupts the map | Preserve map instance/camera and cover open, close, citation, and reset behavior with UI tests |

## 13. Rollout and demo readiness

1. Author and validate the Genie space against the existing Delta table.
2. Add resource bindings and the typed server integration behind a feature flag if needed.
3. Migrate the Home Advisor UI and run deterministic contract tests.
4. Run workspace Genie evaluations as author and representative user.
5. Deploy, validate end to end, and update the architecture view and presenter runbook.

Rollback must restore the last working advisor route without changing the Delta table, Lakebase sync, map search, or listing data.
