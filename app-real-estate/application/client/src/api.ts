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
type AgentReply = { message: string; listingIds: string[]; sessionId: string };

const json = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
};
const displayPropertyType = (value: string): Listing['propertyType'] => value === 'townhouse'
  ? 'Townhouse' : value === 'single-family' ? 'Single family' : value === 'co-op' ? 'Co-op' : 'Condo';
let sessionId: string | undefined;

export const api = {
  async listings(signal?: AbortSignal): Promise<Listing[]> {
    const first = await json<ListingPage>(await fetch('/api/listings?pageSize=100', { signal }));
    const pages = [first];
    for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
      pages.push(await json<ListingPage>(await fetch(`/api/listings?page=${page}&pageSize=100`, { signal })));
    }
    return pages.flatMap((result) => result.items.map((item) => ({
      id: item.listing_id, title: item.title, price: item.price, beds: item.bedrooms,
      baths: item.bathrooms, sqft: item.square_feet, propertyType: displayPropertyType(item.property_type),
      status: item.status === 'active' ? 'For sale' : 'Coming soon', neighborhood: item.neighborhood,
      city: item.city, latitude: item.latitude, longitude: item.longitude, description: item.description,
    })));
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
