-- 0022: record where each settlement row's commercial terms came from.
-- 'CATALOG' = marketplace_catalog_items row (exact terms).
-- 'SUPPLIER_FALLBACK' = derived from the booking's supplier row
-- (real supplier id/name + settlement_rate_bps) because no catalog
-- attribution exists. Never synthesized sellers again (2026-11-09 audit [M]).
-- Pre-existing rows predate the distinction and are marked 'LEGACY'.
ALTER TABLE marketplace_order_settlements ADD COLUMN attribution_source TEXT NOT NULL DEFAULT 'LEGACY';
