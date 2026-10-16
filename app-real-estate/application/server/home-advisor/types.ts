import type { Listing } from '../agent/types.js';

export type GenieStreamEvent =
  | { type: 'message_start'; conversationId: string; messageId: string; spaceId: string }
  | { type: 'status'; status: string }
  | {
      type: 'message_result';
      message: {
        content: string;
        status: string;
        attachments?: Array<{ text?: { content?: string } }>;
        error?: string;
      };
    }
  | {
      type: 'query_result';
      attachmentId: string;
      statementId: string;
      data: {
        manifest: { schema: { columns: Array<{ name: string; type_name: string }> } };
        result: { data_array: (string | null)[][] };
      };
    }
  | { type: 'error'; error: string }
  | {
      type: 'history_info';
      conversationId: string;
      spaceId: string;
      nextPageToken: string | null;
      loadedCount: number;
    };

export interface GenieClient {
  sendMessage(
    alias: string,
    content: string,
    conversationId?: string,
    options?: { timeout?: number; signal?: AbortSignal }
  ): AsyncIterable<GenieStreamEvent>;
}

export interface HomeAdvisorCitation {
  listingId: string;
  title: string;
  latitude: number;
  longitude: number;
}

export interface HomeAdvisorResponse {
  sessionId: string;
  conversationId?: string;
  messageId?: string;
  message: string;
  listingIds: string[];
  citations: HomeAdvisorCitation[];
  actions: Array<{ type: 'select_listing'; listingId: string }>;
  statuses: string[];
  warnings: string[];
  synthetic: true;
  guardrailTriggered: boolean;
}

export interface HomeAdvisorSession {
  id: string;
  genieConversationId?: string;
  active?: AbortController;
  touchedAt: number;
}

export type ListingVerifier = Pick<Listing, 'listing_id' | 'title' | 'latitude' | 'longitude'>;
