-- Migration 000008: Rollback booking orders and payments schema
DROP TABLE IF EXISTS customer_vouchers;
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS booking_itinerary_items;
DROP TABLE IF EXISTS booking_orders;

