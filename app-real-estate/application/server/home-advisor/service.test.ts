import { describe, expect, test, vi } from 'vitest';
import { InMemoryListingRepository, sampleListing } from '../agent/testing.js';
import { HOME_ADVISOR_GROUNDING_POLICY } from './policy.js';
import { HomeAdvisorService, MAX_HOME_ADVISOR_LISTINGS } from './service.js';
import type { GenieClient, GenieStreamEvent } from './types.js';

function clientFrom(events: GenieStreamEvent[] | ((signal?: AbortSignal) => AsyncIterable<GenieStreamEvent>)) {
  const sendMessage = vi.fn(
    (_alias: string, _content: string, _conversationId?: string, options?: { signal?: AbortSignal }) =>
      typeof events === 'function'
        ? events(options?.signal)
        : (async function* () {
            await Promise.resolve();
            yield* events;
          })()
  );
  return { client: { sendMessage } satisfies GenieClient, sendMessage };
}

function normalEvents(content = 'Consider [RE-0001] and [RE-9999].'): GenieStreamEvent[] {
  return [
    { type: 'message_start', conversationId: 'conversation-1', messageId: 'message-1', spaceId: 'space-1' },
    { type: 'status', status: 'EXECUTING_QUERY' },
    { type: 'message_result', message: { content, status: 'COMPLETED' } },
  ];
}

describe('HomeAdvisorService', () => {
  test('continues Genie conversations and returns only Lakebase-verified structured citations', async () => {
    const { client, sendMessage } = clientFrom(normalEvents());
    const repository = new InMemoryListingRepository([sampleListing('RE-0001')]);
    const service = new HomeAdvisorService(
      () => client,
      () => repository,
      undefined,
      {
        alias: 'homes',
        timeoutMs: 5_000,
      }
    );

    const first = await service.chat('Find two homes');
    expect(first).toMatchObject({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      listingIds: ['RE-0001'],
      synthetic: true,
      guardrailTriggered: false,
    });
    expect(first.citations[0]).toMatchObject({ listingId: 'RE-0001', title: 'Synthetic home RE-0001' });
    expect(first.actions).toEqual([{ type: 'select_listing', listingId: 'RE-0001' }]);
    expect(first.message).toContain('RE-9999 (unverified)');
    expect(first.warnings).toContain('1 unverified listing reference(s) were omitted.');
    expect(sendMessage.mock.calls[0]?.[0]).toBe('homes');
    expect(sendMessage.mock.calls[0]?.[1]).toContain(HOME_ADVISOR_GROUNDING_POLICY);

    await service.chat('Compare those', first.sessionId);
    expect(sendMessage.mock.calls[1]?.[2]).toBe('conversation-1');
  });

  test('extracts listing IDs from Genie query results and hard-caps the visible result at 100', async () => {
    const ids = Array.from({ length: 105 }, (_, index) => `RE-${String(index + 1).padStart(4, '0')}`);
    const repository = new InMemoryListingRepository(ids.map((id) => sampleListing(id)));
    const events: GenieStreamEvent[] = [
      { type: 'message_start', conversationId: 'c', messageId: 'm', spaceId: 's' },
      {
        type: 'query_result',
        attachmentId: 'a',
        statementId: 'st',
        data: {
          manifest: { schema: { columns: [{ name: 'listing_id', type_name: 'STRING' }] } },
          result: { data_array: ids.map((id) => [id]) },
        },
      },
      {
        type: 'message_result',
        message: { content: 'Here are the matching synthetic listings.', status: 'COMPLETED' },
      },
    ];
    const { client } = clientFrom(events);
    const reply = await new HomeAdvisorService(
      () => client,
      () => repository
    ).chat('Show all matches');

    expect(reply.listingIds).toHaveLength(MAX_HOME_ADVISOR_LISTINGS);
    expect(reply.actions).toHaveLength(MAX_HOME_ADVISOR_LISTINGS);
    expect(reply.warnings).toContain('Results were limited to 100 listings.');
  });

  test('uses the Genie text answer attachment instead of echoing the submitted question', async () => {
    const { client } = clientFrom([
      { type: 'message_start', conversationId: 'c', messageId: 'm', spaceId: 's' },
      {
        type: 'message_result',
        message: {
          content: 'User question: show a home',
          status: 'COMPLETED',
          attachments: [{ text: { content: 'The verified answer is [RE-0001].' } }],
        },
      },
    ]);
    const reply = await new HomeAdvisorService(
      () => client,
      () => new InMemoryListingRepository([sampleListing('RE-0001')])
    ).chat('Show a home');

    expect(reply.message).toBe('The verified answer is [RE-0001].');
    expect(reply.listingIds).toEqual(['RE-0001']);
  });

  test('blocks fair-housing steering before any Genie call and preserves the session', async () => {
    const { client, sendMessage } = clientFrom(normalEvents());
    const repository = new InMemoryListingRepository([sampleListing('RE-0001')]);
    const service = new HomeAdvisorService(
      () => client,
      () => repository
    );

    const blocked = await service.chat('Find the safest neighborhood for Christian families');
    expect(blocked.guardrailTriggered).toBe(true);
    expect(blocked.listingIds).toEqual([]);
    expect(sendMessage).not.toHaveBeenCalled();

    await service.chat('Show objective listing attributes', blocked.sessionId);
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  test('cancels an active follow-up and reset removes local conversation state', async () => {
    let call = 0;
    const { client } = clientFrom((signal) => {
      call += 1;
      if (call === 1) {
        return (async function* () {
          await Promise.resolve();
          yield* normalEvents('[RE-0001]');
        })();
      }
      return (async function* () {
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('canceled', 'AbortError')), { once: true });
        });
        yield normalEvents()[0];
      })();
    });
    const repository = new InMemoryListingRepository([sampleListing('RE-0001')]);
    const service = new HomeAdvisorService(
      () => client,
      () => repository
    );
    const first = await service.chat('Find a listing');
    const pending = service.chat('Keep working', first.sessionId);
    await vi.waitFor(() => expect(service.cancel(first.sessionId)).toBe(true));

    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELED', status: 499 });
    expect(service.reset(first.sessionId)).toBe(true);
    await expect(service.chat('Continue', first.sessionId)).rejects.toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    });
  });

  test.each([
    ['AppKit Genie plugin is not bound', 'HOME_ADVISOR_NOT_CONFIGURED', 503],
    ['request timed out', 'GENIE_TIMEOUT', 504],
    ['403 forbidden', 'GENIE_PERMISSION_DENIED', 403],
    ['connection failed', 'GENIE_UNAVAILABLE', 503],
  ])('maps Genie failure %s to a typed error', async (failure, code, status) => {
    const client: GenieClient = {
      sendMessage() {
        return (async function* () {
          const event = await Promise.reject<GenieStreamEvent>(new Error(failure));
          yield event;
        })();
      },
    };
    const service = new HomeAdvisorService(
      () => client,
      () => new InMemoryListingRepository([])
    );
    await expect(service.chat('Show homes')).rejects.toMatchObject({ code, status });
  });

  test('health validates Genie binding, Lakebase verification, and the result boundary', async () => {
    const { client } = clientFrom([]);
    const service = new HomeAdvisorService(
      () => client,
      () => new InMemoryListingRepository([]),
      undefined,
      { alias: 'listings' }
    );
    await expect(service.health(true)).resolves.toMatchObject({
      ok: true,
      genie: { ok: true, alias: 'listings' },
      repository: { ok: true },
      maxListings: 100,
    });
  });
});
