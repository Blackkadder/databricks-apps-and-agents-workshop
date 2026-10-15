import type { ListingRepository } from './types.js';

let configuredRepository: ListingRepository | undefined;

/** Configure once during server startup before AppKit initializes its plugins. */
export function configureListingRepository(repository: ListingRepository) {
  configuredRepository = repository;
}

export function getListingRepository(): ListingRepository {
  if (!configuredRepository) throw new Error('Listing repository is not configured');
  return configuredRepository;
}

export function listingRepositoryHealth() {
  return (
    configuredRepository?.health() ?? Promise.resolve({ ok: false, detail: 'Listing repository is not configured' })
  );
}
