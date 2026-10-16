# Genie Home Advisor server integration

The service consumes the AppKit 0.84 Genie `sendMessage` async event stream, maintains the opaque Genie conversation ID behind an application session ID, and verifies every extracted `listing_id` against Lakebase before returning clickable citations.

## AppKit wiring

Use the same alias for the Genie plugin and `HOME_ADVISOR_GENIE_ALIAS` (default `listings`):

```ts
import { createApp, genie, lakebase, server } from '@databricks/appkit';
import { agents } from '@databricks/appkit/beta';
import { homeAdvisor, bindHomeAdvisorGenie } from './home-advisor/index.js';

const alias = process.env.HOME_ADVISOR_GENIE_ALIAS ?? 'listings';
createApp({
  plugins: [
    genie({ spaces: { [alias]: process.env.DATABRICKS_GENIE_SPACE_ID } }),
    lakebase(),
    listings(),
    homeAdvisor(),
    agents(),
    server(),
  ],
}).then((app) => {
  bindLakebase(app.lakebase);
  bindHomeAdvisorGenie(app.genie);
});
```

The forthcoming Databricks App resource binding must inject `DATABRICKS_GENIE_SPACE_ID`; no Space ID is committed. `HOME_ADVISOR_GENIE_TIMEOUT_MS` defaults to AppKit's 120-second Genie timeout.

## API

- `POST /api/home-advisor/chat` — `{ message, sessionId? }`; returns verified citations, map actions, Genie/application conversation IDs, statuses, warnings, and synthetic/guardrail flags.
- `POST /api/home-advisor/cancel` — `{ sessionId }`; aborts the active Genie stream.
- `POST /api/home-advisor/reset` — `{ sessionId }`; cancels active work and drops local conversation state. AppKit 0.84 has no remote Genie delete-conversation API.
- `GET /api/home-advisor/health` — binding, Lakebase verifier, lifecycle, and result-boundary health.
- `GET /api/home-advisor/validate` — deployment preflight checks.

At most 100 verified listings and map actions are returned. The service never exposes an unverified ID as a structured citation.
