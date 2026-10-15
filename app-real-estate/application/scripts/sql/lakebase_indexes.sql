-- Run in Lakebase after the synced table is ONLINE. The table name can be
-- replaced via psql -v listings_table=...; no user input is interpolated.
CREATE UNIQUE INDEX IF NOT EXISTS listings_listing_id_idx ON compass.listings_synced (listing_id);
CREATE INDEX IF NOT EXISTS listings_filter_idx
  ON compass.listings_synced (status, property_type, price, bedrooms);
CREATE INDEX IF NOT EXISTS listings_neighborhood_idx ON compass.listings_synced (neighborhood);
CREATE INDEX IF NOT EXISTS listings_search_idx ON compass.listings_synced USING gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
    coalesce(neighborhood, '') || ' ' || coalesce(amenities, ''))
);

-- filter_idx supports equality predicates followed by price/bedroom ranges;
-- neighborhood_idx supports map-area filtering; the GIN expression supports
-- ranked full-text search over the user-facing listing content.
