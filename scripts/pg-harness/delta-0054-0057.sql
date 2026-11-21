-- scripts/pg-harness/delta-0054-0057.sql
-- Hybrid catch-up for the TG-21 PG snapshot (schema.sql: 90 tables).
-- Apply AFTER schema.sql on a fresh dev database. Re-runnable.
-- Porter rules applied: FK clauses dropped (D1 never enforced them),
-- CURRENT_TIMESTAMP defaults become gft_now().

-- 0054: activity voucher flag (existing rows keep the legacy direct path).
ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_voucher_only INTEGER NOT NULL DEFAULT 1;

-- 0055: wholesale fulfilment (eSIM + voucher B2B).
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_adapter_check;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_adapter_check CHECK (adapter IN ('none', 'direct_contract', 'simulator', 'api', 'ndc', 'gds', 'wholesale'));
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS wholesale_vendor TEXT NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS wholesale_margin_bps INTEGER NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_outlink ON suppliers (outlink_partner_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_wholesale ON suppliers (wholesale_vendor);
CREATE TABLE IF NOT EXISTS wholesale_skus (
  supplier_id TEXT NOT NULL,
  domain_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  PRIMARY KEY (supplier_id, domain_type, item_id)
);

-- 0056: affiliate deeplinks (row ships INACTIVE).
INSERT INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active) VALUES
('travelpayouts', 'Travelpayouts', 'https://search.hotellook.com/?marker={affiliate_id}&sub_id={sub_id}&destination={item_id}', 'SET_VIA_WRANGLER_D1_MARKER', 'SET_VIA_WRANGLER_D1_SECRET_TRAVELPAYOUTS', 0)
ON CONFLICT (partner_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_aff_clicks_partner_day ON affiliate_clicks (partner_name, created_at);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_sub ON affiliate_clicks (sub_id);
CREATE INDEX IF NOT EXISTS idx_aff_conv_status ON affiliate_conversions (status);

-- 0057: IndexNow submission queue.
CREATE TABLE IF NOT EXISTS indexnow_queue (
  url TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT gft_now(),
  updated_at TEXT NOT NULL DEFAULT gft_now()
);
CREATE INDEX IF NOT EXISTS idx_indexnow_due ON indexnow_queue (status, created_at);
