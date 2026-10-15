import type { Listing, ListingFilters, Page } from './types.js';

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
    const result = await this.run<Listing>(`SELECT ${COLUMNS} FROM compass.listings_synced WHERE listing_id = $1`, [listingId]);
    return result.rows[0] ?? null;
  }

  async list(filters: ListingFilters): Promise<Page<Listing>> {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(`${clause} $${values.length}`);
    };
    if (filters.neighborhood) add('neighborhood =', filters.neighborhood);
    if (filters.propertyType) add('property_type =', filters.propertyType);
    if (filters.status) add('status =', filters.status);
    if (filters.minPrice !== undefined) add('price >=', filters.minPrice);
    if (filters.maxPrice !== undefined) add('price <=', filters.maxPrice);
    if (filters.bedrooms !== undefined) add('bedrooms >=', filters.bedrooms);
    const predicate = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.run<{ total: number }>(`SELECT count(*)::int AS total FROM compass.listings_synced ${predicate}`, values);
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const data = await this.run<Listing>(
      `SELECT ${COLUMNS} FROM compass.listings_synced ${predicate} ORDER BY listing_id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    return { items: data.rows, page: filters.page, pageSize: filters.pageSize, total: count.rows[0]?.total ?? 0 };
  }

  async search(query: string, limit = 20): Promise<Listing[]> {
    const result = await this.run<Listing>(
      `SELECT ${COLUMNS} FROM compass.listings_synced
      WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
        coalesce(neighborhood,'') || ' ' || coalesce(amenities,'')) @@ websearch_to_tsquery('english', $1)
      ORDER BY ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
        coalesce(neighborhood,'') || ' ' || coalesce(amenities,'')), websearch_to_tsquery('english', $1)) DESC,
        listing_id LIMIT $2`,
      [query, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows;
  }
}
