import { createAgent, tool } from '@databricks/appkit/beta';
import { REAL_ESTATE_SYSTEM_PROMPT } from '../../agent/advisor.js';
import { getListingRepository } from '../../agent/repository-registry.js';
import { comparisonInputSchema, lookupInputSchema, searchInputSchema } from '../../agent/schemas.js';
import { AgentTools } from '../../agent/tools.js';

function tools() {
  return new AgentTools(getListingRepository());
}

export default createAgent({
  default: true,
  instructions: `${REAL_ESTATE_SYSTEM_PROMPT}

Use search_listings for discovery and never silently relax constraints. If its relaxedConstraints is non-empty, say that no exact match was found and list every relaxation before recommending anything.
Use lookup_listing for factual detail. Use compare_listings for every numeric ranking, including price per square foot.
Render every cited ID exactly as [RE-0001] so the application can make it clickable. Preserve the prior shortlist on follow-up turns.
If asked for safety, demographics, schools as a proxy, or protected-class preferences, refuse that part and offer objective filters.`,
  model: 'databricks-gpt-6-1-sol',
  maxSteps: 8,
  generationParams: { temperature: 0.1 },
  tools: {
    search_listings: tool({
      description:
        'Search the synthetic listing inventory using validated structured and text constraints. Returns stable listing IDs, applied constraints, explicit relaxed constraints, and total matches.',
      schema: searchInputSchema,
      annotations: { effect: 'read' },
      execute: (input) => tools().search(input),
    }),
    lookup_listing: tool({
      description:
        'Look up one synthetic listing by its exact stable listing ID. Returns null when the ID does not exist.',
      schema: lookupInputSchema,
      annotations: { effect: 'read' },
      execute: (input) => tools().lookup(input),
    }),
    compare_listings: tool({
      description:
        'Deterministically rank two to ten listing IDs by a stored numeric metric. Always use this for numeric comparisons instead of calculating or guessing.',
      schema: comparisonInputSchema,
      annotations: { effect: 'read' },
      execute: (input) => tools().compare(input),
    }),
  },
});
