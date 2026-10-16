export type Listing = {
  id: string; title: string; price: number; beds: number; baths: number; sqft: number;
  propertyType: 'Condo' | 'Townhouse' | 'Single family' | 'Co-op';
  status: 'For sale' | 'Coming soon'; neighborhood: string; city: string;
  latitude: number; longitude: number; description: string;
};
export type ListingFilters = { query: string; maxPrice: string; minBeds: string; propertyType: string };
export type AdvisorCitation = { listingId: string; label?: string; snippet?: string; available?: boolean };
export type AdvisorStatus = 'completed' | 'no_match' | 'cancelled' | 'failed';
export type AdvisorErrorCode = 'TIMEOUT' | 'PERMISSION_DENIED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'MALFORMED_RESPONSE' | 'UNKNOWN';
export type AdvisorMessage = { id: string; role: 'user' | 'assistant'; content: string; citations?: AdvisorCitation[]; status?: AdvisorStatus };
export type AdvisorResponse = { message: AdvisorMessage; conversationId: string; messageId: string; mapAction?: { listingId: string } };
export class AdvisorApiError extends Error { readonly code: AdvisorErrorCode; readonly retryable: boolean; constructor(code: AdvisorErrorCode, message: string, retryable: boolean) { super(message); this.name = 'AdvisorApiError'; this.code = code; this.retryable = retryable; } }

type StoredListing = {
  listing_id: string; title: string; price: number; bedrooms: number; bathrooms: number;
  square_feet: number; property_type: string; status: string; neighborhood: string;
  city: string; latitude: number; longitude: number; description: string;
};
type ListingPage = { items: StoredListing[]; total: number; page: number; pageSize: number };
export type ListingResult = { items: Listing[]; total: number };
type AdvisorReply = {
  sessionId: string; conversationId?: string; messageId?: string; message: string;
  citations: Array<AdvisorCitation & { title?: string }>;
  actions?: Array<{ type: 'select_listing'; listingId: string }>;
  guardrailTriggered?: boolean;
};
type AdvisorErrorReply = {
  code?: string; message?: string; retryable?: boolean;
  error?: { code?: string; message?: string; retryable?: boolean };
};

const json = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
};
const displayPropertyType = (value: string): Listing['propertyType'] => value === 'townhouse'
  ? 'Townhouse' : value === 'single-family' ? 'Single family' : value === 'co-op' ? 'Co-op' : 'Condo';
const storedPropertyType = (value: string): string => value === 'Townhouse'
  ? 'townhouse' : value === 'Single family' ? 'single-family' : value === 'Co-op' ? 'co-op' : 'condo';
const toListing = (item: StoredListing): Listing => ({
  id: item.listing_id, title: item.title, price: item.price, beds: item.bedrooms,
  baths: item.bathrooms, sqft: item.square_feet, propertyType: displayPropertyType(item.property_type),
  status: item.status === 'active' ? 'For sale' : 'Coming soon', neighborhood: item.neighborhood,
  city: item.city, latitude: item.latitude, longitude: item.longitude, description: item.description,
});
let sessionId: string | undefined;

const advisorErrorCode = (code: string | undefined, status: number): AdvisorErrorCode => {
  if (code?.includes('TIMEOUT') || status === 408 || status === 504) return 'TIMEOUT';
  if (code?.includes('PERMISSION') || status === 401 || status === 403) return 'PERMISSION_DENIED';
  if (code?.includes('RATE') || status === 429) return 'RATE_LIMITED';
  if (code?.includes('INVALID') || code?.includes('VERIFICATION')) return 'MALFORMED_RESPONSE';
  if (code?.includes('UNAVAILABLE') || code?.includes('CONFIGURED') || status >= 500) return 'UNAVAILABLE';
  return 'UNKNOWN';
};

export const api = {
  async listings(filters: ListingFilters, signal?: AbortSignal): Promise<ListingResult> {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (filters.query.trim()) params.set('q', filters.query.trim());
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.minBeds) params.set('bedrooms', filters.minBeds);
    if (filters.propertyType) params.set('propertyType', storedPropertyType(filters.propertyType));
    const result = await json<ListingPage>(await fetch(`/api/listings?${params}`, { signal }));
    return { items: result.items.slice(0, 100).map(toListing), total: result.total };
  },
  async advise(prompt: string, signal?: AbortSignal): Promise<AdvisorResponse> {
    const response = await fetch('/api/home-advisor/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, sessionId }), signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as AdvisorErrorReply;
      const error = payload.error ?? payload;
      throw new AdvisorApiError(advisorErrorCode(error.code, response.status), error.message ?? `Request failed (${response.status})`, error.retryable ?? response.status >= 500);
    }
    const reply = await response.json() as AdvisorReply;
    sessionId = reply.sessionId;
    const citations = reply.citations.map((citation) => ({
      listingId: citation.listingId,
      label: citation.label ?? citation.title,
      snippet: citation.snippet,
      available: citation.available,
    }));
    const messageId = reply.messageId ?? crypto.randomUUID();
    const status: AdvisorStatus = /\b(no exact match|no match|no listings|none found)\b/i.test(reply.message) ? 'no_match' : 'completed';
    return {
      message: { id: messageId, role: 'assistant', content: reply.message, citations, status },
      conversationId: reply.sessionId,
      messageId,
      mapAction: reply.actions?.[0] ? { listingId: reply.actions[0].listingId } : undefined,
    };
  },
  async listing(listingId: string, signal?: AbortSignal): Promise<Listing | null> {
    const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, { signal });
    if (response.status === 404) return null;
    return toListing(await json<StoredListing>(response));
  },
  async cancel(messageId?: string): Promise<void> {
    if (!sessionId) return;
    void messageId;
    await json<unknown>(await fetch('/api/home-advisor/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }));
  },
  async reset(): Promise<void> {
    if (sessionId) await fetch('/api/home-advisor/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
    });
    sessionId = undefined;
  },
};
