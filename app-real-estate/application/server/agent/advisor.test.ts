import { describe, expect, test } from 'vitest';
import { RealEstateAdvisor } from './advisor.js';
import { AgentTools } from './tools.js';
import { InMemoryListingRepository, sampleListing } from './testing.js';

function advisor() {
  return new RealEstateAdvisor(
    new AgentTools(
      new InMemoryListingRepository([sampleListing('RE-0001'), sampleListing('RE-0002', { price_per_sqft: 700 })])
    )
  );
}

describe('RealEstateAdvisor', () => {
  test('honors a result count written as a word', async () => {
    const listings = Array.from({ length: 5 }, (_, index) => sampleListing(`RE-000${index + 1}`));
    const instance = new RealEstateAdvisor(new AgentTools(new InMemoryListingRepository(listings)));

    const reply = await instance.chat(undefined, 'Show me three homes under $900K');

    expect(reply.listingIds).toHaveLength(3);
  });

  test('cites every search result and preserves shortlist for a follow-up', async () => {
    const first = await advisor().chat(
      undefined,
      'Show me two 2+ bedroom homes under $900K near transit with outdoor space'
    );
    expect(first.message).toContain('[RE-0001]');
    const instance = advisor();
    const discovery = await instance.chat(undefined, 'Show me two homes under $900K');
    const comparison = await instance.chat(discovery.sessionId, 'Which one is the best value per square foot?');
    expect(comparison.message).toContain('RE-0002');
    expect(comparison.listingIds).toHaveLength(2);
  });

  test('does not silently relax a no-match query', async () => {
    const reply = await advisor().chat(undefined, 'Show me a 2 bedroom home under $1');
    expect(reply.listingIds).toEqual([]);
    expect(reply.message).toContain('did not relax');
  });

  test('blocks protected-class steering requests', async () => {
    const reply = await advisor().chat(undefined, 'Which neighborhood is best for Christian families with children?');
    expect(reply.guardrailTriggered).toBe(true);
    expect(reply.listingIds).toEqual([]);
  });
});
