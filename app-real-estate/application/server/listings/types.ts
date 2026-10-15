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

export const listingFiltersSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    neighborhood: z.string().min(1).optional(),
    propertyType: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    bedrooms: z.coerce.number().int().min(0).optional(),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice cannot exceed maxPrice',
  });
export type ListingFilters = z.infer<typeof listingFiltersSchema>;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
