import { Plugin, toPlugin, type PluginManifest } from '@databricks/appkit';
import { configureListingRepository } from './agent/repository-registry.js';
import type {
  Listing as AgentListing,
  ListingRepository,
  SearchConstraints,
  SearchResult,
} from './agent/types.js';
import { createListingsRouter } from './listings/router.js';
import { ListingService, type QueryClient, type QueryResult } from './listings/service.js';
import type { Listing as StoredListing } from './listings/types.js';

type LakebaseApi = {
  query(sql: string, parameters?: unknown[]): Promise<QueryResult<unknown>>;
};

let lakebase: LakebaseApi | undefined;

const database: QueryClient = {
  query<Row>(sql: string, parameters: readonly unknown[] = []) {
    if (!lakebase) throw new Error('Lakebase is still initializing');
    return lakebase.query(sql, [...parameters]) as Promise<QueryResult<Row>>;
  },
};

export function bindLakebase(api: unknown): void {
  lakebase = api as LakebaseApi;
}

const listingService = new ListingService(database);

function toAgentListing(row: StoredListing): AgentListing {
  return {
    listing_id: row.listing_id,
    title: row.title,
    description: row.description,
    property_type: row.property_type,
    status: row.status,
    price_usd: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    square_feet: row.square_feet,
    price_per_sqft: row.price_per_sqft,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
    amenities: row.amenities.split('|'),
    transit_score: row.transit_score,
    walk_score: row.walk_score,
    days_on_market: row.days_on_market,
    has_outdoor_space: row.has_outdoor_space,
    has_parking: row.has_parking,
  };
}

const agentColumns = `listing_id, title, description, property_type, status, price, bedrooms,
  bathrooms, square_feet, price_per_sqft, year_built, neighborhood, city, state, postal_code,
  latitude, longitude, amenities, transit_score, walk_score, days_on_market, listed_at,
  has_outdoor_space, has_parking`;

class LakebaseListingRepository implements ListingRepository {
  async search(constraints: SearchConstraints): Promise<SearchResult> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(`${sql} $${values.length}`);
    };
    if (constraints.maxPrice !== undefined) add('price <=', constraints.maxPrice);
    if (constraints.minBedrooms !== undefined) add('bedrooms >=', constraints.minBedrooms);
    if (constraints.minBathrooms !== undefined) add('bathrooms >=', constraints.minBathrooms);
    if (constraints.minTransitScore !== undefined) add('transit_score >=', constraints.minTransitScore);
    if (constraints.hasOutdoorSpace !== undefined) add('has_outdoor_space =', constraints.hasOutdoorSpace);
    if (constraints.hasParking !== undefined) add('has_parking =', constraints.hasParking);
    if (constraints.propertyTypes?.length) add('property_type = ANY(', constraints.propertyTypes);
    if (constraints.propertyTypes?.length) clauses[clauses.length - 1] += ')';
    if (constraints.neighborhoods?.length) add('neighborhood = ANY(', constraints.neighborhoods);
    if (constraints.neighborhoods?.length) clauses[clauses.length - 1] += ')';
    if (constraints.amenities?.length) {
      for (const amenity of constraints.amenities) add('amenities ILIKE', `%${amenity}%`);
    }
    if (constraints.query) {
      values.push(constraints.query);
      clauses.push(`to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
        coalesce(neighborhood,'') || ' ' || coalesce(amenities,'')) @@ websearch_to_tsquery('english', $${values.length})`);
    }
    values.push(Math.min(Math.max(constraints.limit ?? 5, 1), 10));
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await database.query<StoredListing>(
      `SELECT ${agentColumns} FROM compass.listings_synced ${where} ORDER BY price_per_sqft, listing_id LIMIT $${values.length}`,
      values
    );
    const listings = result.rows.map(toAgentListing);
    return {
      listings,
      appliedConstraints: constraints,
      relaxedConstraints: [],
      total: listings.length,
    };
  }

  async getById(listingId: string): Promise<AgentListing | null> {
    const row = await listingService.get(listingId);
    return row ? toAgentListing(row) : null;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const result = await database.query<{ count: number }>('SELECT count(*)::int AS count FROM compass.listings_synced');
      return { ok: result.rows[0]?.count === 300, detail: `${result.rows[0]?.count ?? 0} listings available` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'Lakebase unavailable' };
    }
  }
}

configureListingRepository(new LakebaseListingRepository());

class ListingsPlugin extends Plugin {
  static manifest = {
    name: 'listings',
    displayName: 'Listing Search API',
    description: 'Parameterized Lakebase listing filters, search, and detail lookup',
    resources: { required: [], optional: [] },
  } as PluginManifest<'listings'>;

  injectRoutes(router: Parameters<Plugin['injectRoutes']>[0]): void {
    router.use('/', createListingsRouter(listingService));
  }
}

export const listings = toPlugin(ListingsPlugin);
