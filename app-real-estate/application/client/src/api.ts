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
type AdvisorReply = { text: string; status: AdvisorStatus; citations: AdvisorCitation[]; conversationId: string; messageId: string; mapAction?: { listingId: string }; error?: { code: AdvisorErrorCode; message: string; retryable?: boolean } };

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
    const response = await fetch('/api/home-advisor/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, conversationId: sessionId }), signal,
    });
    const reply = await response.json() as AdvisorReply;
    if (!response.ok || reply.error) throw new AdvisorApiError(reply.error?.code ?? 'UNKNOWN', reply.error?.message ?? `Request failed (${response.status})`, reply.error?.retryable ?? response.status >= 500);
    sessionId = reply.conversationId;
    return { message: { id: reply.messageId, role: 'assistant', content: reply.text, citations: reply.citations, status: reply.status }, conversationId: reply.conversationId, messageId: reply.messageId, mapAction: reply.mapAction };
  },
  async listing(listingId: string, signal?: AbortSignal): Promise<Listing | null> {
    const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, { signal });
    if (response.status === 404) return null;
    return toListing(await json<StoredListing>(response));
  },
  async cancel(messageId?: string): Promise<void> {
    if (!sessionId) return;
    await json<unknown>(await fetch('/api/home-advisor/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: sessionId, messageId }) }));
  },
  async reset(): Promise<void> {
    if (sessionId) await fetch('/api/home-advisor/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: sessionId }),
    });
    sessionId = undefined;
  },
};
