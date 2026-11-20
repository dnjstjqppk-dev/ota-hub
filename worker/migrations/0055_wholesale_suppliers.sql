-- 0055: wholesale fulfilment (eSIM + voucher B2B).
--
-- suppliers.adapter gains 'wholesale'; wholesale_vendor names the connector
-- (roamify/redteago/airalo/tiqets/bemyguest/klook/kkday) and
-- wholesale_margin_bps the contracted margin band value. CHECK constraints
-- are immutable, so the table is rebuilt (0051 precedent). No vendor sells
-- without integration_status='LIVE' + env base/key + SKU wiring (fail-closed).
-- wholesale_skus maps catalog items to supplier product codes (no guessing).

CREATE TABLE suppliers_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_domain TEXT NOT NULL,
    adapter TEXT NOT NULL DEFAULT 'none' CHECK (adapter IN ('none', 'direct_contract', 'simulator', 'api', 'ndc', 'gds', 'wholesale')),
    integration_status TEXT NOT NULL DEFAULT 'NOT_INTEGRATED' CHECK (integration_status IN (
        'LIVE', 'SANDBOX_VERIFIED', 'DEV_DONE_CONTRACT_PENDING', 'CONTRACTED_IN_DEV',
        'EXTERNAL_LINK_ONLY', 'NOT_INTEGRATED', 'BLOCKED')),
    transaction_model TEXT NOT NULL DEFAULT 'MERCHANT_OF_RECORD' CHECK (transaction_model IN ('MERCHANT_OF_RECORD', 'AGENCY', 'AFFILIATE')),
    settlement_rate_bps INTEGER NOT NULL DEFAULT 9000 CHECK (settlement_rate_bps BETWEEN 0 AND 10000),
    settlement_currency TEXT NOT NULL DEFAULT 'KRW',
    contract_id TEXT REFERENCES entity_contracts(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    outlink_partner_id TEXT NULL REFERENCES affiliate_partners_config(partner_id),
    wholesale_vendor TEXT NULL,
    wholesale_margin_bps INTEGER NULL
);

INSERT INTO suppliers_new
    (id, name, product_domain, adapter, integration_status, transaction_model,
     settlement_rate_bps, settlement_currency, contract_id, notes,
     created_at, updated_at, outlink_partner_id, wholesale_vendor, wholesale_margin_bps)
SELECT id, name, product_domain, adapter, integration_status, transaction_model,
       settlement_rate_bps, settlement_currency, contract_id, notes,
       created_at, updated_at, outlink_partner_id, NULL, NULL
FROM suppliers;

DROP TABLE suppliers;
ALTER TABLE suppliers_new RENAME TO suppliers;

CREATE INDEX IF NOT EXISTS idx_suppliers_outlink ON suppliers (outlink_partner_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_wholesale ON suppliers (wholesale_vendor);

CREATE TABLE IF NOT EXISTS wholesale_skus (
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  domain_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  PRIMARY KEY (supplier_id, domain_type, item_id)
);
