import type { Listing, ListingFilters, ListingSearchFilters, Page } from './types.js';

export interface QueryResult<Row> {
  rows: Row[];
}
export interface QueryClient {
  query<Row>(sql: string, parameters?: readonly unknown[]): Promise<QueryResult<Row>>;
}

export class ListingUnavailableError extends Error {
  readonly code = 'LISTINGS_UNAVAILABLE';
}
export class ListingTimeoutError extends Error {
  readonly code = 'LISTINGS_TIMEOUT';
}

const COLUMNS = `listing_id, title, description, property_type, status, price, bedrooms,
  bathrooms, square_feet, price_per_sqft, year_built, neighborhood, city, state, postal_code,
  latitude, longitude, amenities, transit_score, walk_score, days_on_market, listed_at,
  has_outdoor_space, has_parking`;

export const MAX_VISIBLE_RESULTS = 100;

type FilterValues = Omit<ListingFilters, 'page' | 'pageSize'>;

function buildPredicate(filters: FilterValues): { predicate: string; values: unknown[]; rank: string } {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, operator: string, value: unknown) => {
    values.push(value);
    where.push(`${column} ${operator} $${values.length}`);
  };
  if (filters.neighborhood) add('neighborhood', '=', filters.neighborhood);
  if (filters.propertyType) add('property_type', '=', filters.propertyType);
  if (filters.status) add('status', '=', filters.status);
  if (filters.minPrice !== undefined) add('price', '>=', filters.minPrice);
  if (filters.maxPrice !== undefined) add('price', '<=', filters.maxPrice);
  if (filters.bedrooms !== undefined) add('bedrooms', '>=', filters.bedrooms);
  if (filters.minBathrooms !== undefined) add('bathrooms', '>=', filters.minBathrooms);
  if (filters.hasOutdoorSpace !== undefined) add('has_outdoor_space', '=', filters.hasOutdoorSpace);
  if (filters.hasParking !== undefined) add('has_parking', '=', filters.hasParking);
  if (filters.minTransitScore !== undefined) add('transit_score', '>=', filters.minTransitScore);
  if (filters.minWalkScore !== undefined) add('walk_score', '>=', filters.minWalkScore);
  for (const amenity of filters.amenities ?? []) add('amenities', 'ILIKE', `%${amenity.replace(/[%_\\]/g, '\\$&')}%`);

  let rank = '';
  if (filters.q) {
    values.push(filters.q);
    const vector = `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
      coalesce(neighborhood,'') || ' ' || coalesce(amenities,''))`;
    const query = `websearch_to_tsquery('english', $${values.length})`;
    where.push(`${vector} @@ ${query}`);
    rank = `ts_rank(${vector}, ${query}) DESC, `;
  }
  return { predicate: where.length ? `WHERE ${where.join(' AND ')}` : '', values, rank };
}

export class ListingService {
  constructor(
    private readonly db: QueryClient,
    private readonly timeoutMs = 5_000
  ) {}

  private async run<Row>(sql: string, parameters: readonly unknown[] = []): Promise<QueryResult<Row>> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ListingTimeoutError('Lakebase query timed out')), this.timeoutMs);
    });
    try {
      return await Promise.race([this.db.query<Row>(sql, parameters), timeout]);
    } catch (error) {
      if (error instanceof ListingTimeoutError) throw error;
      throw new ListingUnavailableError(
        `Lakebase query failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    } finally {
      clearTimeout(timer!);
    }
  }

  async get(listingId: string): Promise<Listing | null> {
    const result = await this.run<Listing>(`SELECT ${COLUMNS} FROM compass.listings_synced WHERE listing_id = $1`, [
      listingId,
    ]);
    return result.rows[0] ?? null;
  }

  async list(filters: ListingFilters): Promise<Page<Listing>> {
    const { predicate, values, rank } = buildPredicate(filters);
    const count = await this.run<{ total: number }>(
      `SELECT count(*)::int AS total FROM compass.listings_synced ${predicate}`,
      values
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const pageLimit = Math.max(0, Math.min(filters.pageSize, MAX_VISIBLE_RESULTS - offset));
    if (pageLimit === 0) {
      return {
        items: [],
        page: filters.page,
        pageSize: filters.pageSize,
        total: count.rows[0]?.total ?? 0,
      };
    }
    const dataValues = [...values, pageLimit, offset];
    const data = await this.run<Listing>(
      `SELECT ${COLUMNS} FROM compass.listings_synced ${predicate} ORDER BY ${rank}listing_id LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues
    );
    return {
      items: data.rows.slice(0, pageLimit),
      page: filters.page,
      pageSize: filters.pageSize,
      total: count.rows[0]?.total ?? 0,
    };
  }

  async search(filters: ListingSearchFilters): Promise<Listing[]> {
    const { predicate, values, rank } = buildPredicate(filters);
    const limit = Math.min(filters.limit, MAX_VISIBLE_RESULTS);
    const queryValues = [...values, limit];
    const result = await this.run<Listing>(
      `SELECT ${COLUMNS} FROM compass.listings_synced ${predicate}
      ORDER BY ${rank}listing_id LIMIT $${queryValues.length}`,
      queryValues
    );
    return result.rows.slice(0, limit);
  }
}
