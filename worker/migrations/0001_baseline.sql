-- 0001 baseline: legacy GetForTrip D1 schema (tables only).
-- Generated from database/d1_schema.sql WITHOUT the unsafe seeds (shared admin/partner password hash,
-- impersonating partner company names, hardcoded affiliate secrets). Idempotent on existing databases.

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    birth_date TEXT,
    gender TEXT DEFAULT 'MALE',
    role TEXT DEFAULT 'USER',
    preferred_currency TEXT DEFAULT 'KRW',
    preferred_language TEXT DEFAULT 'ko-kr',
    tier TEXT DEFAULT 'SILVER',
    trip_coins INTEGER DEFAULT 0 CHECK (trip_coins >= 0),
    marketing_consent INTEGER DEFAULT 0,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_attempts (
    ip_address TEXT NOT NULL,
    email TEXT NOT NULL,
    attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_address, attempted_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_travelers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name_ko TEXT NOT NULL,
    last_name_en TEXT NOT NULL,
    first_name_en TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    gender TEXT DEFAULT 'MALE',
    passport_number TEXT NOT NULL,
    passport_expiry TEXT NOT NULL,
    nationality TEXT DEFAULT 'KOR',
    is_primary INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_saved_travelers_user ON saved_travelers (user_id);

CREATE TABLE IF NOT EXISTS user_coupons (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    coupon_code TEXT NOT NULL,
    title TEXT NOT NULL,
    discount_type TEXT DEFAULT 'FIXED_AMOUNT',
    discount_value REAL NOT NULL,
    min_order_amount_krw REAL DEFAULT 50000,
    max_discount_krw REAL DEFAULT 50000,
    valid_until TEXT NOT NULL,
    is_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons (user_id, is_used);

CREATE TABLE IF NOT EXISTS partners (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    company_name TEXT NOT NULL,
    partner_type TEXT NOT NULL,
    business_number TEXT NOT NULL,
    contact_phone TEXT,
    settlement_rate REAL DEFAULT 0.90,
    api_key TEXT,
    webhook_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hotels (
    id TEXT PRIMARY KEY,
    partner_id TEXT DEFAULT 'ptn_htl_01',
    name_ko TEXT NOT NULL,
    name_en TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL DEFAULT 37.5665,
    longitude REAL DEFAULT 126.9780,
    star_rating INTEGER DEFAULT 5,
    property_type TEXT DEFAULT 'HOTEL',
    review_score REAL DEFAULT 4.8,
    review_count INTEGER DEFAULT 100,
    neighborhood TEXT,
    subway_nearby TEXT,
    free_cancellation INTEGER DEFAULT 1,
    free_breakfast INTEGER DEFAULT 0,
    base_price_krw REAL NOT NULL,
    thumbnail_url TEXT,
    images_json TEXT DEFAULT '[]',
    amenities_json TEXT DEFAULT '[]',
    rooms_json TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flights (
    id TEXT PRIMARY KEY,
    partner_id TEXT DEFAULT 'ptn_flt_01',
    flight_number TEXT NOT NULL,
    airline_name TEXT NOT NULL,
    airline_code TEXT NOT NULL,
    departure_airport TEXT NOT NULL,
    arrival_airport TEXT NOT NULL,
    departure_city TEXT NOT NULL,
    arrival_city TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    stops INTEGER DEFAULT 0,
    departure_time_slot TEXT DEFAULT 'MORNING',
    cabin_class TEXT DEFAULT 'ECONOMY',
    base_price_krw REAL NOT NULL,
    free_baggage_kg INTEGER DEFAULT 23,
    available_seats INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trains (
    id TEXT PRIMARY KEY,
    train_number TEXT NOT NULL,
    train_type TEXT NOT NULL,
    departure_station TEXT NOT NULL,
    arrival_station TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    seat_class TEXT DEFAULT '일반실',
    price_krw REAL NOT NULL,
    available_seats INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cars (
    id TEXT PRIMARY KEY,
    partner_id TEXT DEFAULT 'ptn_car_01',
    company_name TEXT NOT NULL,
    vehicle_model TEXT NOT NULL,
    vehicle_type TEXT DEFAULT 'SEDAN',
    seats INTEGER DEFAULT 5,
    transmission TEXT DEFAULT 'AUTO',
    daily_price_krw REAL NOT NULL,
    pickup_location TEXT NOT NULL,
    insurance_included INTEGER DEFAULT 1,
    image_url TEXT,
    available_stock INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY,
    partner_id TEXT DEFAULT 'ptn_car_01',
    service_title TEXT NOT NULL,
    airport_code TEXT NOT NULL,
    destination_area TEXT NOT NULL,
    vehicle_class TEXT DEFAULT 'BUSINESS_VAN',
    max_passengers INTEGER DEFAULT 6,
    max_luggage INTEGER DEFAULT 6,
    price_krw REAL NOT NULL,
    flight_tracking INTEGER DEFAULT 1,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    partner_id TEXT DEFAULT 'ptn_tour_01',
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    price_krw REAL NOT NULL,
    review_score REAL DEFAULT 4.9,
    review_count INTEGER DEFAULT 500,
    instant_confirmation INTEGER DEFAULT 1,
    free_cancellation INTEGER DEFAULT 1,
    duration_type TEXT DEFAULT 'FULL_DAY',
    guide_language TEXT DEFAULT 'KO',
    voucher_type TEXT DEFAULT 'QR_CODE',
    thumbnail_url TEXT,
    description TEXT,
    packages_json TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    destination_city TEXT NOT NULL,
    hotel_id TEXT,
    flight_id TEXT,
    package_discount_rate REAL DEFAULT 15,
    total_original_krw REAL NOT NULL,
    total_package_krw REAL NOT NULL,
    thumbnail_url TEXT,
    details_json TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    discount_type TEXT DEFAULT 'FIXED_AMOUNT',
    discount_value REAL NOT NULL,
    min_order_amount_krw REAL DEFAULT 50000,
    max_discount_krw REAL DEFAULT 50000,
    valid_from TEXT,
    valid_until TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fx_rates (
    currency TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    rate_to_krw REAL NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trip_moments (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    city TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    photos_json TEXT DEFAULT '[]',
    likes_count INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    is_blinded INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    domain_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    booking_id TEXT,
    rating REAL NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    verified_stay INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (domain_type, target_id);

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    partner_id TEXT DEFAULT 'ptn_htl_01',
    booking_number TEXT UNIQUE NOT NULL,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    title TEXT NOT NULL,
    base_amount_krw REAL DEFAULT 0,
    tax_amount_krw REAL DEFAULT 0,
    service_fee_krw REAL DEFAULT 0,
    discount_amount_krw REAL DEFAULT 0,
    trip_coins_used INTEGER DEFAULT 0,
    total_price REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    details_json TEXT,
    voucher_code TEXT,
    cancellation_fee_krw REAL DEFAULT 0,
    refund_amount_krw REAL DEFAULT 0,
    inventory_lock_expires_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_partner ON bookings (partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wishlist (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_title TEXT NOT NULL,
    price_krw REAL DEFAULT 0,
    thumbnail_url TEXT,
    item_data_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, domain_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist (user_id);

CREATE TABLE IF NOT EXISTS price_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT NOT NULL,
    domain_type TEXT DEFAULT 'HOTEL',
    item_id TEXT,
    route_or_hotel TEXT NOT NULL,
    current_price_krw REAL DEFAULT 0,
    target_price REAL NOT NULL,
    currency TEXT DEFAULT 'KRW',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts (user_id, email);

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

CREATE TABLE IF NOT EXISTS affiliate_partners_config (
    partner_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    deep_link_template TEXT NOT NULL,
    affiliate_id TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_emergency INTEGER DEFAULT 1,
    banner_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Display-only FX reference rates (NOT used for charging; charge currency is KRW). Must be refreshed from an FX source.
INSERT OR IGNORE INTO fx_rates (currency, symbol, rate_to_krw) VALUES
('KRW', '₩', 1.0),
('USD', '$', 1350.0),
('JPY', '¥', 9.10),
('EUR', '€', 1470.0),
('CNY', '¥', 188.0),
('GBP', '£', 1720.0);
