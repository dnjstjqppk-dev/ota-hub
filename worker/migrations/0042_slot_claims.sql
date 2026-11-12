-- 0042 (P2e #104): slot claim linkage on booking items.
-- slot_id records which time slot a booking claimed; slot_released_at marks
-- the claim returned (cancels/releases) so a periodic sweep can reconcile
-- booked_count back to the sum of live claims after crashes.
ALTER TABLE booking_items ADD COLUMN slot_id TEXT NULL REFERENCES activity_time_slots(id);
ALTER TABLE booking_items ADD COLUMN slot_released_at TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_items_slot ON booking_items (slot_id) WHERE slot_id IS NOT NULL;
-- Last booked_count mutation: the maintenance sweep only reconciles slots
-- untouched for 10+ minutes, so it can never race an in-flight claim.
ALTER TABLE activity_time_slots ADD COLUMN booked_count_updated_at TEXT NULL;
