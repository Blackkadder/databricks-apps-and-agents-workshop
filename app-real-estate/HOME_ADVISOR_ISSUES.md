# Home Advisor with Databricks Genie — Issue Breakdown

## HA-001: Configure the listings Genie space

**Goal:** Create a curated Genie space over the governed synthetic listings Delta table.

**Acceptance criteria:**

- The space uses exactly one configurable table: `<catalog>.<schema>.listings`.
- Table grain, field descriptions, synonyms, units, example values, and controlled values are documented.
- Instructions require synthetic-data disclosure, stable listing IDs, explicit no-match/relaxation behavior, deterministic comparisons, and fair-housing safeguards.
- Verified examples cover discovery, comparison, aggregation, proximity, and no-match questions.
- Generated SQL for benchmarks references only the configured table and matches direct SQL results.

**Dependencies:** None

## HA-002: Bind Genie to the AppKit application

**Goal:** Add deployable, least-privilege Genie configuration to the existing AppKit v0 app.

**Acceptance criteria:**

- The AppKit Genie integration is enabled.
- Bundle configuration accepts a Genie space ID and binds it with `CAN_RUN`.
- App identity and on-behalf-of user permissions are documented and validated.
- No Genie ID, credential, or access token is hard-coded in browser or application logic.
- Health checks return actionable configuration, permission, warehouse, and Genie failures.

**Dependencies:** HA-001

## HA-003: Build the Genie-backed Home Advisor service

**Goal:** Replace the user-facing custom advisor path with a stable server contract backed by Genie.

**Acceptance criteria:**

- The service supports send, follow-up, status, cancel, retry, and reset operations.
- Responses contain text, status, structured citations, conversation/message IDs, optional map actions, and typed errors.
- Conversation context persists until reset; cancelled/reset requests cannot update the UI later.
- Every actionable listing ID is verified before return, and the UI never parses IDs from prose.
- No-match, timeout, permission, rate-limit, malformed-result, and unavailable outcomes are distinct.
- Unit and integration tests cover lifecycle, validation, errors, and session isolation.

**Dependencies:** HA-002

## HA-004: Apply Home Advisor grounding and safety policy

**Goal:** Make Genie answers reliable, transparent, and safe for the real-estate demo.

**Acceptance criteria:**

- Listing-specific claims include verified structured citations.
- Constraint relaxation and no-match outcomes are explicit.
- Price-per-square-foot and other numeric rankings are checked deterministically.
- Protected-class, demographic, and steering requests are refused with objective alternatives.
- Responses state that the dataset is synthetic and never imply live MLS availability or financial advice.
- Delta/Lakebase freshness mismatches produce an explicit unavailable/stale outcome rather than a fabricated map result.

**Dependencies:** HA-003

## HA-005: Integrate Home Advisor citations with the map

**Goal:** Turn Genie results into reliable, non-destructive map interactions.

**Acceptance criteria:**

- Citation activation selects the exact listing card and marker by stable ID.
- Opening/closing the advisor preserves filters, results, selection, map instance, center, and zoom.
- Citation focus pans/flies to one marker without global bounds fitting.
- Out-of-window citations load as temporary cited results without changing filters or exceeding 100 visible listings.
- Missing citations show `Listing unavailable` inline without breaking the conversation.
- Global reset clears advisor and related selection state deterministically.

**Dependencies:** HA-003, HA-004

## HA-006: Polish the Home Advisor UI and accessibility

**Goal:** Deliver a clear, resilient Genie chat experience consistent with the map-first monochrome design.

**Acceptance criteria:**

- Copy accurately says `Powered by Databricks Genie` and describes governed listing data.
- UI remains black/white/gray, has WCAG AA contrast, uses no listing images, and removes obsolete image/color styles.
- Pending stages, cancellation, retry, no-match, timeout, permission, rate-limit, and unavailable states are usable and distinct.
- Retry resubmits only the failed user prompt.
- Draft, transcript, transcript scroll, and map camera survive panel open/close and architecture-view navigation.
- Desktop keeps the map visible or offers a non-destructive map action; mobile uses `100dvh`, safe areas, sticky controls, and a clear return-to-advisor flow.
- Keyboard navigation, focus return, `aria-live`, loading status, 44 px touch targets, 200% zoom, and narrow-screen behavior pass tests.

**Dependencies:** HA-005

## HA-007: Add Genie evaluations and observability

**Goal:** Measure answer quality, data grounding, safety, and runtime behavior.

**Acceptance criteria:**

- Evaluation cases cover discovery, aggregation, comparison, follow-up, proximity, no-match, prompt injection, and fair housing.
- Checks validate allowed-table SQL, direct-SQL correctness, citations, constraints, unsupported claims, and map actions.
- Traces capture Genie conversation/message IDs, latency, errors, and citation validation without secrets.
- Deterministic contract tests run in CI; workspace-dependent evaluations run separately.
- A deployed baseline records quality, warm latency, cold-start latency, and timeout behavior.

**Dependencies:** HA-003, HA-004

## HA-008: Validate deployment and update demo documentation

**Goal:** Make the Genie-powered Home Advisor reliable and explainable in the live demo.

**Acceptance criteria:**

- End-to-end validation covers Delta access, permissions, warehouse auto-resume, Genie, conversation context, citations, map selection, cancellation, and reset.
- Validation runs as both the space author and a representative authorized app user.
- Architecture copy clearly distinguishes Delta/Genie analytics from Lakebase map/search serving.
- Presenter runbook includes exact prompts, expected evidence, timing, known limitations, recovery steps, and rollback.
- The deployed app passes desktop, mobile, keyboard, accessibility, maximum-100-visible-record, and no-listing-image checks.

**Dependencies:** HA-006, HA-007
