import { describe, expect, test } from 'vitest';
import { AgentTools } from './tools.js';
import { InMemoryListingRepository, sampleListing } from './testing.js';

describe('AgentTools', () => {
  const tools = new AgentTools(
    new InMemoryListingRepository([
      sampleListing('RE-0001'),
      sampleListing('RE-0002', { price_usd: 750_000, price_per_sqft: 625, square_feet: 1_200 }),
    ])
  );

  test('validates search inputs and returns stable IDs', async () => {
    await expect(tools.search({ minBedrooms: -1 })).rejects.toThrow();
    const result = await tools.search({ maxPrice: 900_000, limit: 3 });
    expect(result.listings.map((x) => x.listing_id)).toEqual(['RE-0001', 'RE-0002']);
  });

  test('returns null for an exact lookup miss', async () => {
    await expect(tools.lookup({ listingId: 'RE-9999' })).resolves.toBeNull();
  });

  test('computes a deterministic numeric comparison', async () => {
    const result = await tools.compare({
      listingIds: ['RE-0001', 'RE-0002'],
      metric: 'price_per_sqft',
      direction: 'lowest',
    });
    expect(result.winner).toEqual({ listing_id: 'RE-0002', value: 625 });
  });
});
