import { createApp, lakebase, server } from '@databricks/appkit';
import { agents } from '@databricks/appkit/beta';
import { realEstateAgent } from './agent/plugin.js';
import { bindLakebase, listings } from './integration.js';

createApp({
  plugins: [
    lakebase(),
    listings(),
    realEstateAgent(),
    agents(),
    server(),
  ],
})
  .then((app) => bindLakebase(app.lakebase))
  .catch(console.error);
