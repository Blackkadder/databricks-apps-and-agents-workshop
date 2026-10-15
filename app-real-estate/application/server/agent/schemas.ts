import { z } from 'zod';

const listingId = z.string().regex(/^RE-[A-Z0-9-]+$/i, 'Invalid listing ID');

export const searchInputSchema = z
  .object({
    query: z.string().trim().max(500).optional(),
    maxPrice: z.number().positive().max(100_000_000).optional(),
    minBedrooms: z.number().int().min(0).max(20).optional(),
    minBathrooms: z.number().min(0).max(20).optional(),
    propertyTypes: z.array(z.string().trim().min(1)).max(10).optional(),
    neighborhoods: z.array(z.string().trim().min(1)).max(20).optional(),
    amenities: z.array(z.string().trim().min(1)).max(20).optional(),
    hasOutdoorSpace: z.boolean().optional(),
    hasParking: z.boolean().optional(),
    minTransitScore: z.number().int().min(0).max(100).optional(),
    limit: z.number().int().min(1).max(25).default(5),
  })
  .strict();

export const lookupInputSchema = z.object({ listingId }).strict();

export const comparisonInputSchema = z
  .object({
    listingIds: z.array(listingId).min(2).max(10),
    metric: z.enum(['price_usd', 'square_feet', 'price_per_sqft', 'transit_score', 'walk_score', 'days_on_market']),
    direction: z.enum(['lowest', 'highest']).default('lowest'),
  })
  .strict();

export const chatInputSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const resetInputSchema = z.object({ sessionId: z.string().uuid() }).strict();
