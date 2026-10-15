import type { Listing, ListingRepository, SearchConstraints, SearchResult } from './types.js';
import { comparisonInputSchema, lookupInputSchema, searchInputSchema } from './schemas.js';

export class AgentTools {
  constructor(private readonly repository: ListingRepository) {}

  async search(input: unknown): Promise<SearchResult> {
    const constraints = searchInputSchema.parse(input) as SearchConstraints;
    return this.repository.search(constraints);
  }

  async lookup(input: unknown): Promise<Listing | null> {
    const { listingId } = lookupInputSchema.parse(input);
    return this.repository.getById(listingId);
  }

  async compare(input: unknown) {
    const parsed = comparisonInputSchema.parse(input);
    const listings = await Promise.all(parsed.listingIds.map((id) => this.repository.getById(id)));
    const missingIds = parsed.listingIds.filter((_, index) => listings[index] === null);
    if (missingIds.length) throw new Error(`Listings not found: ${missingIds.join(', ')}`);

    const foundListings = listings.filter((listing): listing is Listing => listing !== null);
    const rows = foundListings
      .map((listing) => ({ listing_id: listing.listing_id, value: listing[parsed.metric] }))
      .sort((a, b) => (parsed.direction === 'lowest' ? a.value - b.value : b.value - a.value));
    return { metric: parsed.metric, direction: parsed.direction, winner: rows[0], rows };
  }
}
