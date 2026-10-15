export interface Listing {
  listing_id: string;
  title: string;
  description: string;
  property_type: string;
  status: string;
  price_usd: number;
  bedrooms: number;
  bathrooms: number;
  square_feet: number;
  price_per_sqft: number;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  amenities: string[];
  transit_score: number;
  walk_score: number;
  days_on_market: number;
  has_outdoor_space: boolean;
  has_parking: boolean;
}

export interface SearchConstraints {
  query?: string;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  propertyTypes?: string[];
  neighborhoods?: string[];
  amenities?: string[];
  hasOutdoorSpace?: boolean;
  hasParking?: boolean;
  minTransitScore?: number;
  limit?: number;
}

export interface SearchResult {
  listings: Listing[];
  appliedConstraints: SearchConstraints;
  relaxedConstraints: string[];
  total: number;
}

export interface ListingRepository {
  search(constraints: SearchConstraints): Promise<SearchResult>;
  getById(listingId: string): Promise<Listing | null>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}

export interface AgentReply {
  message: string;
  listingIds: string[];
  relaxedConstraints: string[];
  sessionId: string;
  traceId: string;
  guardrailTriggered: boolean;
}
