import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Home Advisor client contract', () => {
  it('sends a prompt and preserves structured citations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'Two governed matches.', status: 'completed',
      citations: [{ listingId: 'RE-0042', label: 'Downtown condo' }],
      conversationId: 'conversation-1', messageId: 'message-1',
      mapAction: { listingId: 'RE-0042' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.advise('Show two condos');

    expect(result.message.citations).toEqual([{ listingId: 'RE-0042', label: 'Downtown condo' }]);
    expect(result.mapAction).toEqual({ listingId: 'RE-0042' });
    expect(fetchMock).toHaveBeenCalledWith('/api/home-advisor/messages', expect.objectContaining({ method: 'POST' }));
  });

  it('exposes typed retryable service errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Try later', retryable: true },
    }), { status: 429, headers: { 'Content-Type': 'application/json' } })));

    await expect(api.advise('Retry me')).rejects.toMatchObject({
      name: 'AdvisorApiError', code: 'RATE_LIMITED', retryable: true,
    });
  });

  it('returns null for an unavailable citation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(api.listing('RE-9999')).resolves.toBeNull();
  });
});
