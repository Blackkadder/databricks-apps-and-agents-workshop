import { expect, test } from 'vitest';
import { RealEstateAdvisor } from './advisor.js';
import { evaluateAgent } from './evaluation.js';
import { InMemoryListingRepository, sampleListing } from './testing.js';
import { AgentTools } from './tools.js';

test('evaluation baseline passes citation, disclosure, and guardrail checks', async () => {
  const advisor = new RealEstateAdvisor(
    new AgentTools(
      new InMemoryListingRepository([sampleListing('RE-0001'), sampleListing('RE-0002'), sampleListing('RE-0003')])
    )
  );
  const baseline = await evaluateAgent(advisor);
  expect(baseline.passed).toBe(true);
});
