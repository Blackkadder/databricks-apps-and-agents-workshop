import { describe, expect, it, vi } from 'vitest';
import { ListingService, ListingTimeoutError, ListingUnavailableError, type QueryClient } from './service.js';

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
