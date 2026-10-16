import { createAgent, tool } from '@databricks/appkit/beta';
import { REAL_ESTATE_SYSTEM_PROMPT } from '../../agent/advisor.js';
import { getListingRepository } from '../../agent/repository-registry.js';
import { comparisonInputSchema, lookupInputSchema, searchInputSchema } from '../../agent/schemas.js';
import { AgentTools } from '../../agent/tools.js';

function listingTools() {
  return new AgentTools(getListingRepository());
}

export default createAgent({
  default: true,
  instructions: `${REAL_ESTATE_SYSTEM_PROMPT}

Use search_listings for discovery and never silently relax constraints. If its relaxedConstraints is non-empty, say that no exact match was found and list every relaxation before recommending anything.
Use the configured Genie Space for natural-language analysis over the governed Delta listings table. Treat Genie as the source for Delta analysis, then verify every listing ID with lookup_listing before citing it.
Use lookup_listing for factual detail. Use compare_listings for every numeric ranking, including price per square foot.
Render every cited ID exactly as [RE-0001] so the application can make it clickable. Preserve the prior shortlist on follow-up turns.
If asked for safety, demographics, schools as a proxy, or protected-class preferences, refuse that part and offer objective filters.`,
  model: 'databricks-gpt-6-1-sol',
  maxSteps: 8,
  generationParams: { temperature: 0.1 },
  tools(plugins) {
    const alias = process.env.HOME_ADVISOR_GENIE_ALIAS ?? 'listings';
    const genieTools = plugins.genie
      ? plugins.genie.toolkit({ only: [`${alias}.sendMessage`, `${alias}.getConversation`] })
      : {};
    return {
      ...genieTools,
      search_listings: tool({
        description:
          'Search the synthetic listing inventory using validated structured and text constraints. Returns stable listing IDs, applied constraints, explicit relaxed constraints, and total matches.',
        schema: searchInputSchema,
        annotations: { effect: 'read' },
        execute: (input) => listingTools().search(input),
      }),
      lookup_listing: tool({
        description:
          'Look up one synthetic listing by its exact stable listing ID. Returns null when the ID does not exist.',
        schema: lookupInputSchema,
        annotations: { effect: 'read' },
        execute: (input) => listingTools().lookup(input),
      }),
      compare_listings: tool({
        description:
          'Deterministically rank two to ten listing IDs by a stored numeric metric. Always use this for numeric comparisons instead of calculating or guessing.',
        schema: comparisonInputSchema,
        annotations: { effect: 'read' },
        execute: (input) => listingTools().compare(input),
      }),
    };
  },
});
