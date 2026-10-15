-- ==============================================================================
-- ✈️ getfortrip Full-Scale Production Platform - Migration 000001 (DOWN)
-- ==============================================================================

DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS settlement_ledgers CASCADE;
DROP TABLE IF EXISTS notices CASCADE;
DROP TABLE IF EXISTS cs_tickets CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS trip_moments CASCADE;
DROP TABLE IF EXISTS refunds CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS booking_items CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS airport_transfers CASCADE;
DROP TABLE IF EXISTS car_rentals CASCADE;
DROP TABLE IF EXISTS trains CASCADE;
DROP TABLE IF EXISTS flights CASCADE;
DROP TABLE IF EXISTS hotel_rooms CASCADE;
DROP TABLE IF EXISTS hotels CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;
DROP TABLE IF EXISTS trip_coin_ledgers CASCADE;
DROP TABLE IF EXISTS saved_travelers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS ticket_status_enum CASCADE;
DROP TYPE IF EXISTS currency_enum CASCADE;
DROP TYPE IF EXISTS payment_method_enum CASCADE;
DROP TYPE IF EXISTS booking_status_enum CASCADE;
DROP TYPE IF EXISTS domain_type_enum CASCADE;
DROP TYPE IF EXISTS user_tier_enum CASCADE;

