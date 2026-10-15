import type { Listing, ListingRepository, SearchConstraints, SearchResult } from './types.js';

export class InMemoryListingRepository implements ListingRepository {
  constructor(readonly listings: Listing[]) {}
  getById(id: string) {
    return Promise.resolve(this.listings.find((item) => item.listing_id === id) ?? null);
  }
  health() {
    return Promise.resolve({ ok: true, detail: `${this.listings.length} listings ready` });
  }
  search(c: SearchConstraints): Promise<SearchResult> {
    const matches = this.listings.filter(
      (item) =>
        (c.maxPrice === undefined || item.price_usd <= c.maxPrice) &&
        (c.minBedrooms === undefined || item.bedrooms >= c.minBedrooms) &&
        (c.minBathrooms === undefined || item.bathrooms >= c.minBathrooms) &&
        (c.hasOutdoorSpace === undefined || item.has_outdoor_space === c.hasOutdoorSpace) &&
        (c.hasParking === undefined || item.has_parking === c.hasParking) &&
        (c.minTransitScore === undefined || item.transit_score >= c.minTransitScore) &&
        (!c.propertyTypes?.length || c.propertyTypes.includes(item.property_type)) &&
        (!c.neighborhoods?.length || c.neighborhoods.includes(item.neighborhood)) &&
        (!c.amenities?.length || c.amenities.every((a) => item.amenities.includes(a)))
    );
    return Promise.resolve({
      listings: matches.slice(0, c.limit ?? 5),
      appliedConstraints: c,
      relaxedConstraints: [],
      total: matches.length,
    });
  }
}

export function sampleListing(id: string, overrides: Partial<Listing> = {}): Listing {
  return {
    listing_id: id,
    title: `Synthetic home ${id}`,
    description: 'Synthetic demonstration listing.',
    property_type: 'condo',
    status: 'active',
    price_usd: 800_000,
    bedrooms: 2,
    bathrooms: 2,
    square_feet: 1_000,
    price_per_sqft: 800,
    neighborhood: 'Harbor Point',
    city: 'Boston',
    state: 'MA',
    latitude: 42.35,
    longitude: -71.06,
    amenities: ['balcony'],
    transit_score: 85,
    walk_score: 90,
    days_on_market: 12,
    has_outdoor_space: true,
    has_parking: false,
    ...overrides,
  };
}
