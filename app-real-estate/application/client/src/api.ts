export type Listing = {
  id: string; title: string; price: number; beds: number; baths: number; sqft: number;
  propertyType: 'Condo' | 'Townhouse' | 'Single family' | 'Co-op';
  status: 'For sale' | 'Coming soon'; neighborhood: string; city: string;
  latitude: number; longitude: number; description: string;
};
export type ListingFilters = { query: string; maxPrice: string; minBeds: string; propertyType: string };
export type AdvisorMessage = { id: string; role: 'user' | 'assistant'; content: string; citations?: string[] };
export type AdvisorResponse = { message: AdvisorMessage; listingIds: string[] };

type StoredListing = {
  listing_id: string; title: string; price: number; bedrooms: number; bathrooms: number;
  square_feet: number; property_type: string; status: string; neighborhood: string;
  city: string; latitude: number; longitude: number; description: string;
};
type ListingPage = { items: StoredListing[]; total: number; page: number; pageSize: number };
type ListingSearchPage = { items: StoredListing[] };
export type ListingResult = { items: Listing[]; total: number };
type AgentReply = { message: string; listingIds: string[]; sessionId: string };

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
    const query = filters.query.trim();
    if (query) {
      const params = new URLSearchParams({ q: query, limit: '100' });
      const result = await json<ListingSearchPage>(await fetch(`/api/listings/search?${params}`, { signal }));
      // The full-text endpoint does not expose a total. Apply any additional structured
      // constraints to its bounded response while retaining server-side text search.
      const items = result.items.map(toListing).filter((item) =>
        (!filters.maxPrice || item.price <= Number(filters.maxPrice)) &&
        (!filters.minBeds || item.beds >= Number(filters.minBeds)) &&
        (!filters.propertyType || item.propertyType === filters.propertyType)
      ).slice(0, 100);
      return { items, total: items.length };
    }
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.minBeds) params.set('bedrooms', filters.minBeds);
    if (filters.propertyType) params.set('propertyType', storedPropertyType(filters.propertyType));
    const result = await json<ListingPage>(await fetch(`/api/listings?${params}`, { signal }));
    return { items: result.items.slice(0, 100).map(toListing), total: result.total };
  },
  async advise(prompt: string, signal?: AbortSignal): Promise<AdvisorResponse> {
    const reply = await json<AgentReply>(await fetch('/api/real-estate-agent/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, sessionId }), signal,
    }));
    sessionId = reply.sessionId;
    return { message: { id: crypto.randomUUID(), role: 'assistant', content: reply.message, citations: reply.listingIds }, listingIds: reply.listingIds };
  },
  async reset(): Promise<void> {
    if (sessionId) await fetch('/api/real-estate-agent/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
    });
    sessionId = undefined;
  },
};
