-- =========================================================================
-- Rollback for Migration 000009: Trip-Style All-Domains Faceted Filter Schema
-- =========================================================================

DROP TABLE IF EXISTS domain_filter_facets CASCADE;
DROP TABLE IF EXISTS domain_filter_definitions CASCADE;

-- Drop Indexes
DROP INDEX IF EXISTS idx_hotel_facilities_gin;
DROP INDEX IF EXISTS idx_hotel_stay_themes_gin;
DROP INDEX IF EXISTS idx_hotel_bed_types_gin;
DROP INDEX IF EXISTS idx_flights_alliance;
DROP INDEX IF EXISTS idx_flights_amenities_gin;
DROP INDEX IF EXISTS idx_trains_amenities_gin;
DROP INDEX IF EXISTS idx_cars_features_gin;
DROP INDEX IF EXISTS idx_cars_insurance_tier;
DROP INDEX IF EXISTS idx_transfers_perks_gin;
DROP INDEX IF EXISTS idx_activity_admission_ticket;
DROP INDEX IF EXISTS idx_packages_perks_gin;

