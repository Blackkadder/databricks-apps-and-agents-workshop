import { createApp, genie, lakebase, server } from '@databricks/appkit';
import { agents } from '@databricks/appkit/beta';
import { realEstateAgent } from './agent/plugin.js';
import { bindHomeAdvisorGenie, homeAdvisor } from './home-advisor/index.js';
import { bindLakebase, listings } from './integration.js';

const homeAdvisorAlias = process.env.HOME_ADVISOR_GENIE_ALIAS ?? 'listings';

createApp({
  plugins: [
    genie({ spaces: { [homeAdvisorAlias]: process.env.DATABRICKS_GENIE_SPACE_ID } }),
    lakebase(),
    listings(),
    homeAdvisor(),
    realEstateAgent(),
    agents(),
    server(),
  ],
})
  .then((app) => {
    bindLakebase(app.lakebase);
    bindHomeAdvisorGenie(app.genie);
  })
  .catch(console.error);
