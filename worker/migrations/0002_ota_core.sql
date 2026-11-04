-- ==============================================================================
-- 0002 OTA core: business entities, supplier registry, server-side quotes,
-- booking state machine, payments, refunds, double-entry ledger, idempotency,
-- inventory holds, notification outbox.
--
-- Money columns are INTEGER minor units (*_minor). Legacy REAL *_krw columns on
-- `bookings` are retained for backward compatibility but are no longer written
-- as a source of truth.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- Operating entity (individual business now, corporation later). Every booking
-- records the entity that was the seller of record at the time of sale, so a
-- future change of operator never rewrites historical transactions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_entities (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('INDIVIDUAL', 'CORPORATION')),
    legal_name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'KR',
    business_registration_no TEXT,
    corporate_registration_no TEXT,
    tax_id TEXT,
    travel_agency_license_no TEXT,
    ecommerce_registration_no TEXT,
    representative_name TEXT,
    address TEXT,
    cs_phone TEXT,
    cs_email TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED')),
    effective_from TEXT,
    effective_to TEXT,
    predecessor_entity_id TEXT REFERENCES business_entities(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS entity_contracts (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES business_entities(id),
    contract_type TEXT NOT NULL CHECK (contract_type IN ('PG', 'SUPPLIER', 'SETTLEMENT_ACCOUNT', 'INSURANCE', 'OTHER')),
    counterparty TEXT NOT NULL,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED')),
    effective_from TEXT,
    effective_to TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_entity_contracts_entity ON entity_contracts (entity_id, contract_type, status);

CREATE TABLE IF NOT EXISTS entity_change_log (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES business_entities(id),
    changed_by TEXT NOT NULL,
    change_type TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Placeholder operator: DRAFT until real registration numbers are entered by an admin.
-- While no entity is ACTIVE, the platform refuses to take payments in production.
INSERT OR IGNORE INTO business_entities (id, entity_type, legal_name, country, status)
VALUES ('ent_primary', 'INDIVIDUAL', 'GetForTrip (사업자 등록 정보 미입력)', 'KR', 'DRAFT');

-- ---------------------------------------------------------------------------
-- Supplier / provider registry with an explicit integration status.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_domain TEXT NOT NULL,
    adapter TEXT NOT NULL DEFAULT 'none' CHECK (adapter IN ('none', 'direct_contract', 'simulator', 'api')),
    integration_status TEXT NOT NULL DEFAULT 'NOT_INTEGRATED' CHECK (integration_status IN (
        'LIVE', 'SANDBOX_VERIFIED', 'DEV_DONE_CONTRACT_PENDING', 'CONTRACTED_IN_DEV',
        'EXTERNAL_LINK_ONLY', 'NOT_INTEGRATED', 'BLOCKED')),
    transaction_model TEXT NOT NULL DEFAULT 'MERCHANT_OF_RECORD' CHECK (transaction_model IN ('MERCHANT_OF_RECORD', 'AGENCY', 'AFFILIATE')),
    settlement_rate_bps INTEGER NOT NULL DEFAULT 9000 CHECK (settlement_rate_bps BETWEEN 0 AND 10000),
    settlement_currency TEXT NOT NULL DEFAULT 'KRW',
    contract_id TEXT REFERENCES entity_contracts(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Catalog rows reference these ids through their partner_id column. None of the
-- legacy catalog content is backed by a signed supplier contract.
INSERT OR IGNORE INTO suppliers (id, name, product_domain, adapter, integration_status, notes) VALUES
('ptn_htl_01', '호텔 공급사 (미계약)', 'HOTEL', 'none', 'NOT_INTEGRATED', 'Legacy seed catalog; prices/inventory are not supplier-verified.'),
('ptn_flt_01', '항공 공급사 (미계약)', 'FLIGHT', 'none', 'NOT_INTEGRATED', 'No GDS/NDC/consolidator contract.'),
('ptn_car_01', '렌터카/이동 공급사 (미계약)', 'CAR', 'none', 'NOT_INTEGRATED', 'Legacy seed catalog.'),
('ptn_tour_01', '투어/액티비티 공급사 (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'Legacy seed catalog.'),
('unassigned_train', '철도 공급사 (미계약)', 'TRAIN', 'none', 'NOT_INTEGRATED', 'No rail supplier contract.'),
('unassigned_transfer', '공항이동 공급사 (미계약)', 'TRANSFER', 'none', 'NOT_INTEGRATED', NULL),
('unassigned_package', '패키지 (미계약)', 'PACKAGE', 'none', 'NOT_INTEGRATED', 'Package = multi-supplier bundle; requires each component supplier.');

CREATE TABLE IF NOT EXISTS supplier_api_calls (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL,
    booking_id TEXT,
    operation TEXT NOT NULL,
    outcome TEXT NOT NULL,
    latency_ms INTEGER,
    request_summary TEXT,
    response_summary TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_calls ON supplier_api_calls (supplier_id, created_at);

-- ---------------------------------------------------------------------------
-- Server-side price quotes (price snapshot). A booking can only be created
-- from an ACTIVE, unexpired quote owned by the same user.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    unit_id TEXT,
    supplier_id TEXT NOT NULL,
    title TEXT NOT NULL,
    currency TEXT NOT NULL,
    base_minor INTEGER NOT NULL CHECK (base_minor >= 0),
    tax_minor INTEGER NOT NULL CHECK (tax_minor >= 0),
    fee_minor INTEGER NOT NULL CHECK (fee_minor >= 0),
    discount_minor INTEGER NOT NULL CHECK (discount_minor >= 0),
    total_minor INTEGER NOT NULL CHECK (total_minor > 0),
    display_currency TEXT NOT NULL DEFAULT 'KRW',
    display_total_minor INTEGER,
    fx_rate_snapshot REAL,
    promotion_code TEXT,
    lines_json TEXT NOT NULL,
    params_json TEXT NOT NULL,
    cancellation_policy_json TEXT NOT NULL,
    service_start TEXT NOT NULL,
    service_end TEXT NOT NULL,
    priced_units INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED')),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Booking (common entity) — extend the legacy table.
-- ---------------------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN quote_id TEXT;
ALTER TABLE bookings ADD COLUMN entity_id TEXT;
ALTER TABLE bookings ADD COLUMN supplier_id TEXT;
ALTER TABLE bookings ADD COLUMN total_minor INTEGER;
ALTER TABLE bookings ADD COLUMN paid_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN refunded_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN cancellation_fee_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE bookings ADD COLUMN supplier_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE bookings ADD COLUMN supplier_reference TEXT;
ALTER TABLE bookings ADD COLUMN idempotency_key TEXT;
ALTER TABLE bookings ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN status_reason TEXT;
ALTER TABLE bookings ADD COLUMN service_start TEXT;
ALTER TABLE bookings ADD COLUMN service_end TEXT;
ALTER TABLE bookings ADD COLUMN cancellation_policy_json TEXT;
ALTER TABLE bookings ADD COLUMN payment_mode TEXT;
ALTER TABLE bookings ADD COLUMN transaction_model TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_idempotency ON bookings (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_quote ON bookings (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status, inventory_lock_expires_at);

-- Legacy rows: the old /pay endpoint always returned 403, so legacy
-- PENDING_PAYMENT rows can never be paid. Legacy CONFIRMED rows could only be
-- produced by the (now removed) affiliate postback side effect, so they are
-- routed to manual review instead of being trusted.
UPDATE bookings SET status = 'EXPIRED', status_reason = 'LEGACY_UNPAYABLE_PENDING' WHERE status = 'PENDING_PAYMENT';
UPDATE bookings SET status = 'MANUAL_REVIEW_REQUIRED', status_reason = 'LEGACY_CONFIRMED_WITHOUT_PAYMENT_RECORD' WHERE status = 'CONFIRMED';

CREATE TABLE IF NOT EXISTS booking_items (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    unit_id TEXT,
    supplier_id TEXT NOT NULL,
    title TEXT NOT NULL,
    service_start TEXT NOT NULL,
    service_end TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    params_json TEXT NOT NULL,
    supplier_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    supplier_reference TEXT,
    pnr TEXT,
    ticket_numbers_json TEXT,
    voucher_code TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items (booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_items_voucher ON booking_items (voucher_code) WHERE voucher_code IS NOT NULL;

-- Traveler PII. Passport numbers are stored AES-GCM encrypted (passport_enc).
CREATE TABLE IF NOT EXISTS booking_travelers (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    traveler_type TEXT NOT NULL CHECK (traveler_type IN ('ADULT', 'CHILD', 'INFANT')),
    last_name_en TEXT NOT NULL,
    first_name_en TEXT NOT NULL,
    birth_date TEXT,
    gender TEXT,
    nationality TEXT,
    passport_enc TEXT,
    passport_expiry TEXT,
    is_lead INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_travelers_booking ON booking_travelers (booking_id);

CREATE TABLE IF NOT EXISTS booking_status_history (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER', 'SYSTEM', 'ADMIN', 'SUPPLIER', 'PAYMENT_PROVIDER', 'MIGRATION')),
    actor_id TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_history ON booking_status_history (booking_id, created_at);

-- Direct-contract inventory holds (sellable capacity per item/unit/date).
CREATE TABLE IF NOT EXISTS inventory_holds (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    unit_key TEXT NOT NULL,
    service_date TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL CHECK (status IN ('HELD', 'COMMITTED', 'RELEASED')),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_lookup ON inventory_holds (item_id, unit_key, service_date, status);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_booking ON inventory_holds (booking_id);

-- ---------------------------------------------------------------------------
-- Payments / refunds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    provider TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('LIVE', 'SANDBOX')),
    order_id TEXT NOT NULL,
    provider_payment_key TEXT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'CAPTURED', 'FAILED', 'UNKNOWN', 'PARTIALLY_REFUNDED', 'REFUNDED')),
    refunded_minor INTEGER NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
    method TEXT,
    failure_code TEXT,
    failure_message TEXT,
    approved_at TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (refunded_minor <= amount_minor)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_key ON payments (provider, provider_payment_key) WHERE provider_payment_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order ON payments (provider, order_id);
-- At most one captured (or in-flight) payment per booking: prevents double charging.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_active ON payments (booking_id) WHERE status IN ('PROCESSING', 'CAPTURED', 'UNKNOWN', 'PARTIALLY_REFUNDED');

CREATE TABLE IF NOT EXISTS payment_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    outcome TEXT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    payment_id TEXT NOT NULL REFERENCES payments(id),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
    provider_refund_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds (booking_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds (status);

-- ---------------------------------------------------------------------------
-- Append-only double-entry ledger. Every financial event writes balanced
-- DEBIT/CREDIT lines sharing a journal_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    journal_id TEXT NOT NULL,
    booking_id TEXT,
    entity_id TEXT NOT NULL,
    supplier_id TEXT,
    account TEXT NOT NULL CHECK (account IN (
        'PG_CLEARING', 'CUSTOMER_DEPOSITS', 'SUPPLIER_PAYABLE', 'COMMISSION_REVENUE',
        'CANCELLATION_FEE_REVENUE', 'PROMOTION_EXPENSE')),
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL,
    event_type TEXT NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_booking ON ledger_entries (booking_id);
CREATE INDEX IF NOT EXISTS idx_ledger_journal ON ledger_entries (journal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_event_once ON ledger_entries (booking_id, event_type, reference_id, account, direction) WHERE booking_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_ledger_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'LEDGER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'LEDGER_APPEND_ONLY'); END;

-- Compare-and-set guard: a batch inserts COUNT(matching rows) here first; the
-- CHECK aborts (and rolls back) the whole D1 batch if the precondition fails.
CREATE TABLE IF NOT EXISTS txn_guards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ok INTEGER NOT NULL CHECK (ok = 1),
    label TEXT
);

-- ---------------------------------------------------------------------------
-- Idempotency + notification outbox + coin ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope TEXT NOT NULL,
    idem_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER,
    response_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (scope, idem_key)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'KAKAO')),
    recipient TEXT NOT NULL,
    template TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'BLOCKED_NO_PROVIDER')),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox (status, created_at);

CREATE TABLE IF NOT EXISTS coin_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger (user_id, created_at);

-- Reset tokens: store only a SHA-256 hash of the token from now on.
ALTER TABLE password_reset_tokens ADD COLUMN token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens (token_hash) WHERE token_hash IS NOT NULL;
-- Invalidate any legacy plaintext tokens (they were returned in API responses).
UPDATE password_reset_tokens SET used = 1 WHERE token_hash IS NULL;

-- Coupons may be claimed once per user. Remove unused duplicate claims first
-- (the legacy endpoint allowed unlimited re-claims of the same code).
DELETE FROM user_coupons WHERE is_used = 0 AND rowid NOT IN (SELECT MIN(rowid) FROM user_coupons GROUP BY user_id, coupon_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupons_once ON user_coupons (user_id, coupon_code);

-- Affiliate outlinks: deactivate partners whose affiliate ids / secrets were placeholders.
UPDATE affiliate_partners_config SET is_active = 0, secret_key = '' WHERE secret_key LIKE 'SET_VIA_%' OR secret_key = 'gft_sec_trip_partner_2026';
