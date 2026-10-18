-- ==============================================================================
-- ✈️ getforTrip Production Database Schema (Cloudflare D1 / SQLite Engine)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    preferred_currency TEXT DEFAULT 'KRW',
    preferred_language TEXT DEFAULT 'ko',
    tier TEXT DEFAULT 'SILVER',
    trip_coins INTEGER DEFAULT 0,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
    click_id TEXT PRIMARY KEY,
    user_id TEXT,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_title TEXT,
    partner_name TEXT NOT NULL,
    outlink_url TEXT NOT NULL,
    sub_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    status TEXT DEFAULT 'REDIRECTED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
    id TEXT PRIMARY KEY,
    click_id TEXT NOT NULL,
    partner_name TEXT NOT NULL,
    order_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    commission REAL DEFAULT 0,
    status TEXT DEFAULT 'CONFIRMED',
    signature TEXT,
    raw_payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    booking_number TEXT UNIQUE NOT NULL,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_price REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    details_json TEXT,
    voucher_code TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wishlist (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_title TEXT NOT NULL,
    item_data_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT NOT NULL,
    route_or_hotel TEXT NOT NULL,
    target_price REAL NOT NULL,
    currency TEXT DEFAULT 'KRW',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS affiliate_partners_config (
    partner_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    deep_link_template TEXT NOT NULL,
    affiliate_id TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial affiliate partners
INSERT OR IGNORE INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active)
VALUES 
('trip', 'Global Partner', 'https://kr.ctrip.com/sale/4283/foodiefly.html?Allianceid=49321&SID=92183&sub={click_id}&custom={item_id}', 'AID-TRIP-49321', 'trip_hmac_secret_2026', 1),
('agoda', 'Agoda', 'https://www.agoda.com/partners/partnersearch.aspx?cid=19283&hid={item_id}&sub={click_id}', 'CID-AGODA-19283', 'agoda_hmac_secret_2026', 1),
('klook', 'Klook', 'https://www.klook.com/ko/activity/{item_id}/?aid=38291&aff_sub={click_id}', 'AID-KLOOK-38291', 'klook_hmac_secret_2026', 1),
('myrealtrip', 'MyRealTrip', 'https://www.myrealtrip.com/offers/{item_id}?aff_id=getfortrip&click_id={click_id}', 'AID-MRT-7721', 'mrt_hmac_secret_2026', 1);

-- Seed initial admin user if not exists
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, phone_number, tier, trip_coins)
VALUES (
    'usr-admin-001',
    'admin@getfortrip.com',
    '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', -- sha256 of 'admin1234!'
    '총괄 관리자',
    '010-1234-5678',
    'DIAMOND_PLUS',
    100000
);

-- Seed sample initial verified conversion & booking for verification
INSERT OR IGNORE INTO bookings (id, user_id, booking_number, domain_type, item_id, title, total_price, currency, status, customer_name, customer_email, voucher_code, details_json)
VALUES (
    'bkg-init-001',
    'usr-admin-001',
    'GFT-20261018-0001',
    'HOTEL',
    'hotel-101',
    '신라호텔 서울 (The Shilla Seoul) - 디럭스 더블룸',
    420000,
    'KRW',
    'CONFIRMED',
    '김여행',
    'vip@getfortrip.com',
    'VCHR-SHILLA-9921',
    '{"checkIn":"2026-11-01","checkOut":"2026-11-03","rooms":1,"guests":2,"breakfast":true}'
);
