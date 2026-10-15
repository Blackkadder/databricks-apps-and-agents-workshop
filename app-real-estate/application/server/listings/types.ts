import { z } from 'zod';

export const listingSchema = z.object({
  listing_id: z.string(),
  title: z.string(),
  description: z.string(),
  property_type: z.string(),
  status: z.string(),
  price: z.number(),
  bedrooms: z.number(),
  bathrooms: z.number(),
  square_feet: z.number(),
  price_per_sqft: z.number(),
  year_built: z.number(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  postal_code: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  amenities: z.string(),
  transit_score: z.number(),
  walk_score: z.number(),
  days_on_market: z.number(),
  listed_at: z.coerce.date(),
  has_outdoor_space: z.boolean(),
  has_parking: z.boolean(),
});
export type Listing = z.infer<typeof listingSchema>;

const booleanQueryParam = z.enum(['true', 'false']).transform((value) => value === 'true');

const stringListQueryParam = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
  z.array(z.string().trim().min(1)).min(1).max(20)
);

export const listingFilterFields = {
  q: z.string().trim().min(1).max(500).optional(),
  neighborhood: z.string().trim().min(1).optional(),
  propertyType: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  minBathrooms: z.coerce.number().nonnegative().optional(),
  amenities: stringListQueryParam.optional(),
  hasOutdoorSpace: booleanQueryParam.optional(),
  hasParking: booleanQueryParam.optional(),
  minTransitScore: z.coerce.number().int().min(0).max(100).optional(),
  minWalkScore: z.coerce.number().int().min(0).max(100).optional(),
} as const;

const validPriceRange = <T extends { minPrice?: number; maxPrice?: number }>(value: T) =>
  value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice;

export const listingFiltersSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    ...listingFilterFields,
  })
  .refine(validPriceRange, {
    message: 'minPrice cannot exceed maxPrice',
  });
export type ListingFilters = z.infer<typeof listingFiltersSchema>;

export const listingSearchSchema = z
  .object({
    ...listingFilterFields,
    q: z.string().trim().min(1).max(500),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(validPriceRange, { message: 'minPrice cannot exceed maxPrice' });
export type ListingSearchFilters = z.infer<typeof listingSearchSchema>;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
