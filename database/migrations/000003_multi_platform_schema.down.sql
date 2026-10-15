-- ==============================================================================
-- ✈️ getfortrip Multi-Platform Normalized Architecture - Migration 000003 (DOWN)
-- ==============================================================================

DROP TABLE IF EXISTS myrealtrip_terms CASCADE;
DROP TABLE IF EXISTS myrealtrip_itineraries CASCADE;
DROP TABLE IF EXISTS myrealtrip_guides CASCADE;
DROP TABLE IF EXISTS myrealtrip_tours CASCADE;

DROP TABLE IF EXISTS kkday_charter_specs CASCADE;
DROP TABLE IF EXISTS kkday_pickup_points CASCADE;
DROP TABLE IF EXISTS kkday_packages CASCADE;
DROP TABLE IF EXISTS kkday_products CASCADE;

DROP TABLE IF EXISTS klook_time_slots CASCADE;
DROP TABLE IF EXISTS klook_unit_tiers CASCADE;
DROP TABLE IF EXISTS klook_packages CASCADE;
DROP TABLE IF EXISTS klook_activities CASCADE;

DROP TABLE IF EXISTS tripcom_trains CASCADE;
DROP TABLE IF EXISTS tripcom_flight_segments CASCADE;
DROP TABLE IF EXISTS tripcom_flights CASCADE;

DROP TABLE IF EXISTS agoda_rate_plans CASCADE;
DROP TABLE IF EXISTS agoda_room_types CASCADE;
DROP TABLE IF EXISTS agoda_properties CASCADE;

DROP TABLE IF EXISTS travel_checkin_webhooks CASCADE;
DROP TABLE IF EXISTS affiliate_referrals CASCADE;
DROP TABLE IF EXISTS curated_contents CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_raw_scrapes CASCADE;

DROP TYPE IF EXISTS sync_status_enum CASCADE;
DROP TYPE IF EXISTS curation_status_enum CASCADE;
DROP TYPE IF EXISTS product_domain_enum CASCADE;
DROP TYPE IF EXISTS ota_platform_enum CASCADE;

