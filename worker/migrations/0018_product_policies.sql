-- 0018: structured per-product cancellation/change policy.
-- tiers_json: [{ "hours_before": 48, "refund_bps": 10000, "note": "..." }] ordered
-- by hours_before DESC; the first tier with hours_before <= hours-until-start wins.
-- A product without a row follows the domain default published in refund-policy.
CREATE TABLE IF NOT EXISTS product_policies (
  domain_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  free_cancel_hours INTEGER,
  change_allowed INTEGER NOT NULL DEFAULT 0,
  no_show_fee_bps INTEGER,
  tiers_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (domain_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_product_policies_item ON product_policies(domain_type, item_id);
