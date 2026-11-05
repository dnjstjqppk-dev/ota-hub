-- 0003 Partner Extranet: Partner onboarding, staff RBAC, inventory/pricing calendar,
-- cancellation dispute management, and settlement payout ledger.

-- 1. Partner Profile & Verification
CREATE TABLE IF NOT EXISTS partner_profiles (
    partner_id TEXT PRIMARY KEY REFERENCES partners(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED'
    representative_name TEXT,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_account_holder TEXT,
    tax_invoice_email TEXT,
    business_cert_url TEXT,
    settlement_rate_bps INTEGER NOT NULL DEFAULT 1000, -- 1000 bps = 10%
    approved_by TEXT,
    approved_at TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_profiles_status ON partner_profiles(status);

-- 2. Partner Staff & Permissions
CREATE TABLE IF NOT EXISTS partner_staff (
    id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF', -- 'OWNER', 'MANAGER', 'STAFF'
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_staff_partner ON partner_staff(partner_id, is_active);

-- 3. Partner Inventory & Pricing Calendar
CREATE TABLE IF NOT EXISTS partner_inventory (
    id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    unit_id TEXT,
    service_date TEXT NOT NULL,
    allocated_units INTEGER NOT NULL DEFAULT 10,
    booked_units INTEGER NOT NULL DEFAULT 0,
    price_override_minor INTEGER,
    is_closed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(partner_id, item_id, unit_id, service_date)
);
CREATE INDEX IF NOT EXISTS idx_partner_inv_date ON partner_inventory(partner_id, item_id, service_date);

-- 4. Partner Cancellation Requests & Disputes
CREATE TABLE IF NOT EXISTS partner_cancellations (
    id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    booking_id TEXT NOT NULL,
    requested_by TEXT NOT NULL DEFAULT 'CUSTOMER', -- 'CUSTOMER', 'PARTNER', 'ADMIN'
    reason TEXT NOT NULL,
    total_price_minor INTEGER NOT NULL,
    penalty_minor INTEGER NOT NULL DEFAULT 0,
    refund_minor INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    partner_notes TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_cancels ON partner_cancellations(partner_id, status);

-- 5. Partner Settlement Batches
CREATE TABLE IF NOT EXISTS partner_settlement_batches (
    id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    gross_minor INTEGER NOT NULL DEFAULT 0,
    commission_minor INTEGER NOT NULL DEFAULT 0,
    payout_minor INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'CONFIRMED', -- 'ESTIMATED', 'CONFIRMED', 'PAID', 'HELD'
    payout_date TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_settle ON partner_settlement_batches(partner_id, status);

-- 6. Ensure seed partners exist before referencing them
INSERT OR IGNORE INTO partners (id, email, password_hash, company_name, partner_type, business_number, contact_phone, settlement_rate, is_active) VALUES
('ptn_htl_01', 'hotel_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '(주)하얏트 코리아 호스피탈리티', 'HOTEL', '101-81-99281', '02-1234-5678', 0.90, 1),
('ptn_car_01', 'car_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '글로벌 모빌리티 & 렌터카 파트너스', 'CAR', '616-82-44102', '064-777-8899', 0.88, 1),
('ptn_tour_01', 'tour_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '(주)도쿄 익스플로러 투어스', 'ACTIVITY', '221-86-33910', '033-555-1122', 0.85, 1);

-- 7. Update seed partner password hash
UPDATE partners SET password_hash = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4' WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01');

-- 8. Seed partner profiles
INSERT OR IGNORE INTO partner_profiles (partner_id, status, representative_name, bank_name, bank_account_number, bank_account_holder, tax_invoice_email, settlement_rate_bps) VALUES
('ptn_htl_01', 'ACTIVE', '김하얏트', '신한은행', '110-123-456789', '(주)하얏트코리아', 'tax@hyatt.test', 1000),
('ptn_car_01', 'ACTIVE', '이제주', '국민은행', '441020-01-99812', '글로벌모빌리티(주)', 'tax@mobility.test', 1200),
('ptn_tour_01', 'ACTIVE', '박도쿄', '하나은행', '330-9102-11820', '(주)도쿄익스플로러', 'tax@tokyotour.test', 1500);

-- 9. Seed partner staff accounts
INSERT OR IGNORE INTO partner_staff (id, partner_id, email, password_hash, full_name, role, is_active) VALUES
('stf_hotel_01', 'ptn_htl_01', 'hotel_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '김하얏트 대표', 'OWNER', 1),
('stf_car_01', 'ptn_car_01', 'car_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '이제주 실장', 'OWNER', 1),
('stf_tour_01', 'ptn_tour_01', 'tour_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '박도쿄 팀장', 'OWNER', 1);
