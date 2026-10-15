import { Router, type Response } from 'express';
import { z } from 'zod';
import { ListingService, ListingTimeoutError, ListingUnavailableError } from './service.js';
import { listingFiltersSchema, listingSearchSchema } from './types.js';

export function createListingsRouter(service: ListingService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    try {
      res.json(await service.list(listingFiltersSchema.parse(req.query)));
    } catch (error) {
      sendError(res, error);
    }
  });
  router.get('/search', async (req, res) => {
    try {
      const input = listingSearchSchema.parse(req.query);
      res.json({ items: await service.search(input) });
    } catch (error) {
      sendError(res, error);
    }
  });
  router.get('/:listingId', async (req, res) => {
    try {
      const item = await service.get(
        z
          .string()
          .regex(/^RE-\d{4}$/)
          .parse(req.params.listingId)
      );
      if (item) res.json(item);
      else res.status(404).json({ code: 'NOT_FOUND' });
    } catch (error) {
      sendError(res, error);
    }
  });
  return router;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ code: 'INVALID_REQUEST', issues: error.issues });
    return;
  }
  if (error instanceof ListingTimeoutError) {
    res.status(504).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof ListingUnavailableError) {
    res.status(503).json({ code: error.code, message: error.message });
    return;
  }
  res.status(500).json({ code: 'INTERNAL_ERROR' });
}
