-- ==============================================================================
-- ✈️ getfortrip Trip-Style Full UX/UI Facets & Filter Schema - Migration 000004 (DOWN)
-- ==============================================================================

DROP TABLE IF EXISTS hotel_rate_plans CASCADE;

ALTER TABLE activities
DROP COLUMN IF EXISTS packages,
DROP COLUMN IF EXISTS how_to_use,
DROP COLUMN IF EXISTS exclusions,
DROP COLUMN IF EXISTS inclusions,
DROP COLUMN IF EXISTS itinerary,
DROP COLUMN IF EXISTS highlights,
DROP COLUMN IF EXISTS voucher_type,
DROP COLUMN IF EXISTS guide_language,
DROP COLUMN IF EXISTS duration_type,
DROP COLUMN IF EXISTS free_cancellation;

ALTER TABLE flights
DROP COLUMN IF EXISTS refund_fee_krw,
DROP COLUMN IF EXISTS is_changeable,
DROP COLUMN IF EXISTS is_refundable,
DROP COLUMN IF EXISTS departure_time_slot,
DROP COLUMN IF EXISTS stops;

ALTER TABLE hotel_rooms
DROP COLUMN IF EXISTS is_smoking,
DROP COLUMN IF EXISTS has_window,
DROP COLUMN IF EXISTS has_bathtub,
DROP COLUMN IF EXISTS view_type;

ALTER TABLE hotels
DROP COLUMN IF EXISTS policies,
DROP COLUMN IF EXISTS check_out_time,
DROP COLUMN IF EXISTS check_in_time,
DROP COLUMN IF EXISTS distance_to_center_km,
DROP COLUMN IF EXISTS subway_nearby,
DROP COLUMN IF EXISTS neighborhood,
DROP COLUMN IF EXISTS facilities_score,
DROP COLUMN IF EXISTS service_score,
DROP COLUMN IF EXISTS location_score,
DROP COLUMN IF EXISTS cleanliness_score,
DROP COLUMN IF EXISTS property_type;

