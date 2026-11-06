-- 0009: route residual legacy partner-decision statuses to manual review.
-- Partner confirm/reject used to write raw statuses outside the booking state
-- machine (fixed: it now runs the same decision flow as the operator console).
-- A leftover 'CONFIRMED' row may or may not have a captured payment and never went
-- through fulfilment (no voucher / PNR / refund wiring), so trusting it as a
-- completed sale would invent fulfilment. Following 0002's precedent for legacy
-- CONFIRMED rows, these go to MANUAL_REVIEW_REQUIRED, where an operator (or the
-- partner, via the fixed endpoint with a supplier reference) completes them
-- through the real flow. Idempotent data fix.
UPDATE bookings SET status = 'MANUAL_REVIEW_REQUIRED', status_reason = 'LEGACY_PARTNER_CONFIRM_NEEDS_REVIEW'
WHERE status = 'CONFIRMED';
