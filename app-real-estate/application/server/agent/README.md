# Real-estate agent backend

This AppKit plugin exposes:

- `POST /api/real-estate-agent/chat` — `{ message, sessionId? }`
- `POST /api/real-estate-agent/reset` — `{ sessionId }`
- `GET /api/real-estate-agent/health`
- `GET /api/real-estate-agent/validate`

Integration requires a `ListingRepository` backed by the application's parameterized Lakebase/listing service. During server startup call `configureListingRepository(repository)`, import `agents` from `@databricks/appkit/beta`, then add both `realEstateAgent()` and `agents()` to the `createApp` plugin list in `server/server.ts`. AppKit auto-discovers `server/agents/real-estate-advisor/agent.ts`, uses `databricks-gpt-6-1-sol`, manages native threads, streams `/chat`, and traces its model/tool calls. The custom endpoint's `listingIds` array remains a simple stable UI hook; `sessionId` must be sent on follow-up turns.

The module logs structured trace metadata (tool/model stage, latency, errors, and counts), but intentionally excludes prompts, tool output bodies, connection strings, and credentials. Replace `JsonTraceSink` with the deployment's MLflow/Databricks trace exporter when its binding is available.

AppKit-native evals are co-located under `server/agents/real-estate-advisor/evals`. With the app running, execute `pnpm appkit agent eval real-estate-advisor --url http://localhost:3000`. They cover scripted discovery, multi-turn deterministic comparison, no-match disclosure, and adversarial fair-housing behavior. The local deterministic unit baseline is intentionally separate so CI can run without a workspace/model endpoint.
