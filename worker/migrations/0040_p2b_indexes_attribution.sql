-- 0040 (P2b #76-78, #80-82): query indexes, explicit partner attribution, slot upsert key.
--
-- #76: partner_inventory reads filter (item_id, service_date, unit_id) but the
-- only index leads with partner_id, so calendar/quote reads scan. Add the
-- item-first index (the partner-first one still serves the extranet list).
-- #77: payments reads by booking_id fall back to table scans (the only
-- booking_id index is the partial one-active unique, unusable without a
-- matching status predicate). Add the plain index.
-- #78: the price-alert sweep filters (is_active, item_id) with no supporting
-- index. Add it.
-- #81: 16 seeded flights carry partner_id 'ptn_flt_01', which names a supplier
-- row, not a partners row — a dangling partner reference. Supplier resolution
-- is unaffected (the 'ptn_flt_01' fallback in loadProduct stays); only the
-- partner attribution is cleared. (Intentional non-partner markers such as
-- transfers' 'unassigned_transfer' are NOT touched — see 6b #20.)
-- #80 backfill: bookings.partner_id historically stored supplier.id by
-- collision. Rows that name no real partner are cleared so the extranet shows
-- exactly each partner's own orders (creation-time attribution fixed in code).
-- (#82 needs no schema: slot upserts key on the UNIQUE(activity_id,
-- slot_date, start_time) that 0004 already declares.)

CREATE INDEX IF NOT EXISTS idx_partner_inventory_item_date_unit
  ON partner_inventory (item_id, service_date, unit_id);

CREATE INDEX IF NOT EXISTS idx_payments_booking
  ON payments (booking_id);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active_item
  ON price_alerts (is_active, item_id);

UPDATE flights SET partner_id = NULL
  WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners);

UPDATE bookings SET partner_id = NULL
  WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners);
