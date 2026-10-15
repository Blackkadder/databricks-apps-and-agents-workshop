import { describe, expect, it, vi } from 'vitest';
import {
  ListingService,
  ListingTimeoutError,
  ListingUnavailableError,
  type QueryClient,
} from './service.js';
import { listingFiltersSchema, listingSearchSchema } from './types.js';

describe('ListingService', () => {
  it('uses parameters for exact lookup', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await new ListingService({ query } as QueryClient).get("SYN-0001' OR true --");
    expect(query.mock.calls[0][0]).toContain('listing_id = $1');
    expect(query.mock.calls[0][1]).toEqual(["SYN-0001' OR true --"]);
  });

  it('returns an empty page', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const page = await new ListingService({ query } as QueryClient).list({ page: 1, pageSize: 25 });
    expect(page).toEqual({ items: [], page: 1, pageSize: 25, total: 0 });
  });

  it('pushes text search and every structured filter into one parameterized Lakebase query', async () => {
    const query = vi.fn(async (_sql: string, _parameters?: readonly unknown[]) => Promise.resolve({ rows: [] }));
    await new ListingService({ query } as QueryClient).search(
      listingSearchSchema.parse({
        q: "roof deck' OR true --",
        limit: '40',
        neighborhood: 'Chelsea',
        propertyType: 'condo',
        status: 'active',
        minPrice: '500000',
        maxPrice: '900000',
        bedrooms: '2',
        minBathrooms: '1.5',
        amenities: 'roof deck,doorman',
        hasOutdoorSpace: 'true',
        hasParking: 'false',
        minTransitScore: '75',
        minWalkScore: '80',
      })
    );

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("websearch_to_tsquery('english', $14)");
    expect(sql).toContain('neighborhood = $1');
    expect(sql).toContain('has_outdoor_space = $8');
    expect(sql).toContain('amenities ILIKE $12');
    expect(sql).toContain('LIMIT $15');
    expect(parameters).toEqual([
      'Chelsea',
      'condo',
      'active',
      500000,
      900000,
      2,
      1.5,
      true,
      false,
      75,
      80,
      '%roof deck%',
      '%doorman%',
      "roof deck' OR true --",
      40,
    ]);
    expect(sql).not.toContain("roof deck' OR true --");
  });

  it('caps one visible query to 100 records across pages', async () => {
    const rows = Array.from({ length: 75 }, (_, index) => ({ listing_id: `RE-${index}` }));
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 300 }] })
      .mockResolvedValueOnce({ rows });
    const page = await new ListingService({ query } as QueryClient).list({ page: 2, pageSize: 75 });

    expect(page.total).toBe(300);
    expect(page.items).toHaveLength(25);
    expect(query.mock.calls[1][1]).toEqual([25, 75]);

    query.mockClear();
    query.mockResolvedValueOnce({ rows: [{ total: 100 }] });
    const beyondWindow = await new ListingService({ query } as QueryClient).list({ page: 3, pageSize: 50 });
    expect(beyondWindow.items).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('validates the 100-row API boundary and boolean query values', () => {
    expect(() => listingFiltersSchema.parse({ pageSize: 101 })).toThrow();
    expect(() => listingFiltersSchema.parse({ hasParking: 'yes' })).toThrow();
    expect(listingFiltersSchema.parse({ amenities: ['balcony', 'parking'], hasParking: 'false' })).toMatchObject({
      amenities: ['balcony', 'parking'],
      hasParking: false,
    });
  });

  it('types unavailable errors', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection refused'));
    await expect(new ListingService({ query } as QueryClient).get('SYN-0001')).rejects.toBeInstanceOf(
      ListingUnavailableError
    );
  });

  it('types timeouts', async () => {
    const query = vi.fn(() => new Promise(() => {}));
    await expect(new ListingService({ query } as QueryClient, 1).get('SYN-0001')).rejects.toBeInstanceOf(
      ListingTimeoutError
    );
  });
});
