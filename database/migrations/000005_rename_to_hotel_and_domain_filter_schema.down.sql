-- Down migration for 000005
DROP INDEX IF EXISTS idx_hotels_facet_filter;
DROP INDEX IF EXISTS idx_flights_facet_filter;

