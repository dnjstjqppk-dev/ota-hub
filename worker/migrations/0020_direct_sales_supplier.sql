-- 0020: seed the first-party (direct sales) supplier.
-- Products with partner_id = 'ptn_direct_01' are sold by getfortrip itself
-- (MERCHANT_OF_RECORD) and fulfilled by operator confirmation in the admin OMS.
-- NOT_INTEGRATED until an admin flips it LIVE via PATCH /admin/suppliers, so
-- seeding alone never makes anything bookable.
INSERT OR IGNORE INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps, notes) VALUES
('ptn_direct_01', 'getfortrip 직영', 'ALL', 'direct_contract', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 9000, 'First-party direct sales. Flip to LIVE only when the ACTIVE business entity is registered and PG is contracted.');

-- Self SUPPLIER contract for first-party sales. Seeded PENDING on purpose:
-- an admin must activate it (PATCH /admin/contracts) as the deliberate
-- go-live step, which the supplier LIVE switch then requires.
INSERT OR IGNORE INTO entity_contracts (id, entity_id, contract_type, counterparty, reference, status, notes) VALUES
('ect_direct_01', 'ent_primary', 'SUPPLIER', 'getfortrip (자사 직영)', 'SELF-1P', 'PENDING', 'First-party direct-sales self contract.');
UPDATE suppliers SET contract_id = 'ect_direct_01' WHERE id = 'ptn_direct_01' AND contract_id IS NULL;
