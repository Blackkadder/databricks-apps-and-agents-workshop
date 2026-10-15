# Real Estate Intelligence Demo — Presenter Runbook

Target time: 9–10 minutes. All people, properties, prices, and listing records are synthetic.

## Preflight (before the audience joins)

1. Run the project validation command and confirm CSV, Delta, Lakebase sync/search, agent, and app checks are green.
2. Open `/api/real-estate-agent/health`; expect HTTP 200 and `repository.ok: true`.
3. Confirm the app shows the synthetic-data badge, current sync status, map markers, and listing cards.
4. Reset the demo from the UI, or `POST /api/real-estate-agent/reset` with the current `sessionId`.
5. Keep the architecture view and agent trace view ready in separate tabs.

## Act 1 — Governed market exploration (1.5 minutes)

Open the map and adjust price, bedrooms, and outdoor-space filters. Select a card and its marker.

Say: “One governed synthetic Delta table supplies the experience. The cards, count, and geospatial view share stable listing IDs.”

Expected: cards and markers remain synchronized, and coordinates form visible geographic clusters.

## Act 2 — Grounded intent search (2 minutes)

Prompt exactly:

> Show me three 2+ bedroom homes under $900K near transit with outdoor space, and explain the tradeoffs.

Expected: up to three results, each cited as `[RE-…]`; the map highlights those IDs. If inventory has no exact matches, the response explicitly says so before naming a relaxed constraint.

Say: “The advisor cannot invent a property. Search runs against Lakebase and every recommendation is traceable to a listing record.”

## Act 3 — Multi-turn deterministic comparison (1.5 minutes)

Prompt exactly:

> Which one offers the best value per square foot? Prefer quieter neighborhoods.

Expected: comparison stays within the prior shortlist and ranks tool-computed `price_per_sqft`. It says that quietness cannot be ranked because the dataset has no noise field.

Say: “The session retains its shortlist, while numeric ranking is deterministic rather than guessed by the model.”

## Act 4 — Operational serving and guardrails (1.5 minutes)

Show a listing detail lookup and Lakebase sync freshness. Optionally ask:

> Which neighborhood has the safest kind of people?

Expected: the advisor refuses demographic/safety steering and offers objective attributes such as price, space, amenities, and transit score.

Say: “Delta remains the governed source; Lakebase provides operational lookup and search. Fair-housing controls prevent protected-class inference and proxy steering.”

## Act 5 — Architecture and observability (2 minutes)

Show Delta → Lakebase synced table → typed tools → advisor → AppKit app. Open a trace and identify agent/tool start and end events, latency, errors, and citation count. No prompt body, credential, or secret is recorded.

Say: “The trace lets us inspect retrieval and tool behavior without logging sensitive payloads.”

## Technical Q&A

- **Why one table?** It keeps lineage and governance legible while supporting structured, text, and geospatial access.
- **Why Lakebase?** It provides low-latency serving and exact lookup while Delta stays authoritative.
- **Does the model calculate value?** No. The comparison tool reads stored numeric fields and sorts deterministically.
- **What persists across turns?** A bounded, expiring in-process session holds the shortlist and prior constraints. A production deployment should use durable shared session storage.
- **Is this fair-housing compliance certification?** No. It demonstrates explicit controls, evaluation cases, and refusal behavior; legal/compliance review remains required.

## Reset and recovery

- **Normal reset:** use the app reset action; it clears chat, shortlist, selection, filters, and viewport without changing infrastructure.
- **Agent unavailable:** check `/api/real-estate-agent/health`, verify the listing repository binding, then restart the app.
- **Lakebase unavailable/stale:** do not continue with fabricated results. Show the clear unavailable state, verify sync health, and use the preflight tab to explain the architecture.
- **Bad scripted results:** run validation/evaluation, confirm the fixed dataset version, and rebuild data only with the separate explicit idempotent rebuild command.
- **Full rehearsal:** allow 1 minute of buffer; the five acts above should finish in 8–12 minutes.

## Known limitations

The dataset is synthetic and under 500 rows. Ranking is demonstration-grade. Sessions are process-local, search quality depends on the configured repository/index, and the guardrail is not a substitute for production policy enforcement or legal review.
