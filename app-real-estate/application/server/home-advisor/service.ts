import { FAIR_HOUSING_RESPONSE, isSteeringRequest } from '../agent/guardrails.js';
import type { ListingRepository } from '../agent/types.js';
import { HomeAdvisorError, normalizeHomeAdvisorError } from './errors.js';
import { groundedQuestion } from './policy.js';
import { HomeAdvisorSessions } from './sessions.js';
import type { GenieClient, GenieStreamEvent, HomeAdvisorCitation, HomeAdvisorResponse } from './types.js';

export const MAX_HOME_ADVISOR_LISTINGS = 100;

export interface HomeAdvisorOptions {
  alias?: string;
  timeoutMs?: number;
}

function listingIdsFromText(content: string): string[] {
  return [...content.matchAll(/\bRE-\d{4}\b/gi)].map((match) => match[0].toUpperCase());
}

function listingIdsFromQuery(event: Extract<GenieStreamEvent, { type: 'query_result' }>): string[] {
  const columns = event.data.manifest.schema.columns;
  const index = columns.findIndex((column) => column.name.toLowerCase() === 'listing_id');
  if (index < 0) return [];
  return event.data.result.data_array
    .map((row) => row[index])
    .filter((value): value is string => typeof value === 'string' && /^RE-\d{4}$/i.test(value))
    .map((value) => value.toUpperCase());
}

function stripUnverifiedCitations(message: string, verified: Set<string>): string {
  return message.replace(/\[?(RE-\d{4})\]?/gi, (full, id: string) =>
    verified.has(id.toUpperCase()) ? `[${id.toUpperCase()}]` : full.replace(id, `${id.toUpperCase()} (unverified)`)
  );
}

export class HomeAdvisorService {
  readonly alias: string;
  readonly timeoutMs: number;

  constructor(
    private readonly genie: () => GenieClient,
    private readonly listings: () => ListingRepository,
    private readonly sessions = new HomeAdvisorSessions(),
    options: HomeAdvisorOptions = {}
  ) {
    this.alias = options.alias ?? process.env.HOME_ADVISOR_GENIE_ALIAS ?? 'listings';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.HOME_ADVISOR_GENIE_TIMEOUT_MS ?? 120_000);
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1) {
      throw new HomeAdvisorError(
        'HOME_ADVISOR_NOT_CONFIGURED',
        'HOME_ADVISOR_GENIE_TIMEOUT_MS must be a positive number.',
        503,
        false
      );
    }
  }

  async chat(message: string, sessionId?: string, signal?: AbortSignal): Promise<HomeAdvisorResponse> {
    if (isSteeringRequest(message)) {
      return this.guardrailReply(message, sessionId);
    }

    const session = this.sessions.acquire(sessionId);
    const abort = session.active!;
    const relayAbort = () => abort.abort(signal?.reason);
    signal?.addEventListener('abort', relayAbort, { once: true });
    let content = '';
    let messageId: string | undefined;
    const statuses: string[] = [];
    const candidateIds: string[] = [];
    let candidateCount = 0;

    try {
      const stream = this.genie().sendMessage(this.alias, groundedQuestion(message), session.genieConversationId, {
        timeout: this.timeoutMs,
        signal: abort.signal,
      });
      for await (const event of stream) {
        if (event.type === 'message_start') {
          session.genieConversationId = event.conversationId;
          messageId = event.messageId;
        } else if (event.type === 'status') {
          if (!statuses.includes(event.status)) statuses.push(event.status);
        } else if (event.type === 'message_result') {
          if (event.message.error) throw new Error(event.message.error);
          content = event.message.content;
          candidateIds.push(...listingIdsFromText(content));
        } else if (event.type === 'query_result') {
          const ids = listingIdsFromQuery(event);
          candidateCount += ids.length;
          candidateIds.push(...ids.slice(0, MAX_HOME_ADVISOR_LISTINGS));
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      }
      if (abort.signal.aborted) {
        throw new DOMException('Home Advisor request canceled', 'AbortError');
      }
      if (!content.trim()) {
        throw new HomeAdvisorError(
          'GENIE_RESPONSE_INVALID',
          'Genie completed without a usable text response.',
          502,
          true
        );
      }

      const uniqueCandidates = [...new Set(candidateIds)].slice(0, MAX_HOME_ADVISOR_LISTINGS);
      let verifiedRows;
      try {
        verifiedRows = await Promise.all(uniqueCandidates.map((id) => this.listings().getById(id)));
      } catch (error) {
        throw new HomeAdvisorError(
          'LISTING_VERIFICATION_UNAVAILABLE',
          'Lakebase listing verification is unavailable; no unverified citations were returned.',
          503,
          true,
          error
        );
      }
      const verified = verifiedRows.filter((row) => row !== null);
      const verifiedIds = new Set(verified.map((row) => row.listing_id));
      const citations: HomeAdvisorCitation[] = verified.map((row) => ({
        listingId: row.listing_id,
        title: row.title,
        latitude: row.latitude,
        longitude: row.longitude,
      }));
      const invalid = uniqueCandidates.filter((id) => !verifiedIds.has(id));
      const warnings: string[] = [];
      if (invalid.length) warnings.push(`${invalid.length} unverified listing reference(s) were omitted.`);
      if (candidateCount > MAX_HOME_ADVISOR_LISTINGS || candidateIds.length > MAX_HOME_ADVISOR_LISTINGS) {
        warnings.push(`Results were limited to ${MAX_HOME_ADVISOR_LISTINGS} listings.`);
      }
      return {
        sessionId: session.id,
        conversationId: session.genieConversationId,
        messageId,
        message: stripUnverifiedCitations(content, verifiedIds),
        listingIds: citations.map((citation) => citation.listingId),
        citations,
        actions: citations.map((citation) => ({ type: 'select_listing', listingId: citation.listingId })),
        statuses,
        warnings,
        synthetic: true,
        guardrailTriggered: false,
      };
    } catch (error) {
      throw normalizeHomeAdvisorError(error);
    } finally {
      signal?.removeEventListener('abort', relayAbort);
      this.sessions.release(session);
    }
  }

  cancel(sessionId: string) {
    return this.sessions.cancel(sessionId);
  }

  reset(sessionId: string) {
    return this.sessions.reset(sessionId);
  }

  async health(genieBound: boolean) {
    const repository = await this.listings().health();
    return {
      ok: genieBound && repository.ok,
      genie: { ok: genieBound, alias: this.alias, detail: genieBound ? 'bound' : 'AppKit Genie plugin is not bound' },
      repository,
      conversations: this.sessions.stats(),
      maxListings: MAX_HOME_ADVISOR_LISTINGS,
    };
  }

  private guardrailReply(message: string, sessionId?: string): HomeAdvisorResponse {
    // Do not create remote/local conversation state for a request that must never reach Genie.
    const session = this.sessions.acquire(sessionId);
    this.sessions.release(session);
    return {
      sessionId: session.id,
      message: FAIR_HOUSING_RESPONSE,
      listingIds: [],
      citations: [],
      actions: [],
      statuses: [],
      warnings: [`The request was blocked before querying Genie (${message.length} characters).`],
      synthetic: true,
      guardrailTriggered: true,
    };
  }
}
