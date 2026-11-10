-- 0037 (6e): per-product suppliers for TRAIN/PACKAGE, pause unsellable 1P
-- marketplace rows, and turn off automation flags that advertise rails
-- which do not exist.
--
-- #43: trains/packages had no partner_id, so every row resolved to one shared
-- unassigned_* supplier — a single LIVE flip would sell the whole domain.
-- Nullable columns keep unassigned_* until an operator wires a real supplier.
ALTER TABLE trains ADD COLUMN partner_id TEXT NULL REFERENCES suppliers(id);
ALTER TABLE packages ADD COLUMN partner_id TEXT NULL REFERENCES suppliers(id);
CREATE INDEX IF NOT EXISTS idx_trains_partner ON trains (partner_id);
CREATE INDEX IF NOT EXISTS idx_packages_partner ON packages (partner_id);

-- #39/#40/#43: 1P rows for domains with no production sales path (quote 409s)
-- must not sit ACTIVE in the public catalog. PAUSED hides them from the
-- public ACTIVE listing; settlement attribution reads by domain+item with no
-- status filter, so fulfilled-booking accounting is unaffected.
UPDATE marketplace_catalog_items SET status = 'PAUSED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN ('mkt_esim_jp_01', 'mkt_ins_standard', 'mkt_flt_ke723', 'mkt_trn_ktx_025');

-- #46: these flags advertised ON+ACTIVE capabilities with no implementation
-- (no eSIM purchase path, no realtime inventory sync, no auto-confirmation
-- rail, no supplier API integration). Off + PENDING_CONTRACT until built.
-- None of them is enforced anywhere (money gates check only the *_BOOKING /
-- TRANSIT_TICKETS domain flags), so this changes advertising, not behavior.
UPDATE feature_flags SET is_enabled = 0, default_enabled = 0, external_contract_status = 'PENDING_CONTRACT', updated_by = 'migration_0037'
  WHERE key IN ('ESIM', 'REALTIME_INVENTORY_SYNC', 'AUTO_BOOKING_CONFIRMATION', 'SUPPLIER_API_INTEGRATION');
