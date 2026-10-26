const { execFileSync } = require('child_process');

function runD1(sql) {
  const singleLine = sql.replace(/[\r\n]+/g, ' ').trim();
  const res = execFileSync('cmd.exe', [
    '/c', 'npx', 'wrangler', 'd1', 'execute', 'ota_production', '--remote', '--command', singleLine
  ], {
    encoding: 'utf8',
    cwd: 'c:/Users/dnjst/Desktop/project/ota'
  });
  return res;
}

const alterCommands = [
  // users
  "ALTER TABLE users ADD COLUMN birth_date TEXT;",
  "ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'MALE';",
  "ALTER TABLE users ADD COLUMN marketing_consent INTEGER DEFAULT 0;",

  // bookings
  "ALTER TABLE bookings ADD COLUMN partner_id TEXT DEFAULT 'ptn_htl_01';",
  "ALTER TABLE bookings ADD COLUMN base_amount_krw REAL DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN tax_amount_krw REAL DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN service_fee_krw REAL DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN discount_amount_krw REAL DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN trip_coins_used INTEGER DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN cancellation_fee_krw REAL DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN refund_amount_krw REAL DEFAULT 0;",
  "ALTER TABLE bookings ADD COLUMN inventory_lock_expires_at TEXT;",

  // wishlist
  "ALTER TABLE wishlist ADD COLUMN price_krw REAL DEFAULT 0;",
  "ALTER TABLE wishlist ADD COLUMN thumbnail_url TEXT;",

  // price_alerts
  "ALTER TABLE price_alerts ADD COLUMN domain_type TEXT;",
  "ALTER TABLE price_alerts ADD COLUMN item_id TEXT;",
  "ALTER TABLE price_alerts ADD COLUMN current_price_krw REAL DEFAULT 0;"
];

console.log("=== STEP 1: Running ALTER TABLE migrations (ignore errors if column exists) ===");
for (const sql of alterCommands) {
  try {
    process.stdout.write(`Running: ${sql.substring(0, 50)}... `);
    runD1(sql);
    console.log("✅ OK");
  } catch (err) {
    if (err.message && err.message.includes('duplicate column name')) {
      console.log("⏩ Already exists");
    } else {
      console.log(`⚠️ (Ignored): ${err.message?.split('\n')[0]}`);
    }
  }
}

const createTables = [
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip_address TEXT NOT NULL,
    email TEXT NOT NULL,
    attempted_at INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_address, attempted_at);`,

  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS saved_travelers (
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
  );`,
  `CREATE INDEX IF NOT EXISTS idx_saved_travelers_user ON saved_travelers (user_id);`,

  `CREATE TABLE IF NOT EXISTS user_coupons (
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
  );`,
  `CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons (user_id, is_used);`,

  `CREATE TABLE IF NOT EXISTS partners (
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
  );`,

  `CREATE TABLE IF NOT EXISTS hotels (
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
  );`,

  `CREATE TABLE IF NOT EXISTS flights (
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
  );`,

  `CREATE TABLE IF NOT EXISTS trains (
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
  );`,

  `CREATE TABLE IF NOT EXISTS cars (
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
  );`,

  `CREATE TABLE IF NOT EXISTS transfers (
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
  );`,

  `CREATE TABLE IF NOT EXISTS activities (
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
  );`,

  `CREATE TABLE IF NOT EXISTS packages (
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
  );`,

  `CREATE TABLE IF NOT EXISTS promotions (
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
  );`,

  `CREATE TABLE IF NOT EXISTS fx_rates (
    currency TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    rate_to_krw REAL NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS trip_moments (
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
  );`,

  `CREATE TABLE IF NOT EXISTS reviews (
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
  );`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (domain_type, target_id);`,

  `CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_emergency INTEGER DEFAULT 1,
    banner_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`
];

console.log("\n=== STEP 2: Creating new tables & indexes ===");
for (const sql of createTables) {
  try {
    const preview = sql.replace(/[\r\n]+/g, ' ').substring(0, 60);
    process.stdout.write(`Creating: ${preview}... `);
    runD1(sql);
    console.log("✅ OK");
  } catch (err) {
    console.error(`❌ Failed: ${err.message}`);
  }
}

const seedCommands = [
  // FX Rates
  `INSERT OR IGNORE INTO fx_rates (currency, symbol, rate_to_krw) VALUES
   ('KRW', '₩', 1.0),
   ('USD', '$', 1350.0),
   ('JPY', '¥', 9.10),
   ('EUR', '€', 1470.0),
   ('CNY', '¥', 188.0),
   ('GBP', '£', 1720.0);`,

  // Promotions
  `INSERT OR IGNORE INTO promotions (id, code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_from, valid_until, is_active) VALUES
   ('promo_welcome', 'WELCOME2026', '신규 회원 첫 예약 10% 웰컴 특별 할인', 'PERCENTAGE', 10, 50000, 30000, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 1),
   ('promo_hotel50', 'HOTEL50000', '5성급 럭셔리 호텔 ₩50,000 즉시 할인', 'FIXED_AMOUNT', 50000, 300000, 50000, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 1),
   ('promo_flight20', 'FLIGHT20000', '전 세계 국제선 항공권 ₩20,000 안심 할인', 'FIXED_AMOUNT', 20000, 200000, 20000, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 1),
   ('promo_global10', 'GLOBAL10', '동적 패키지 / 렌터카 / 공항픽업 10% 메가 할인', 'PERCENTAGE', 10, 80000, 40000, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 1);`,

  // B2B Partners
  `INSERT INTO partners (id, email, password_hash, company_name, partner_type, business_number, contact_phone, settlement_rate, api_key, webhook_url, is_active) VALUES
   ('ptn_htl_01', 'hotel_partner@getfortrip.com', 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5', '(주)하얏트 코리아 호스피탈리티', 'HOTEL', '101-81-99201', '02-797-1234', 0.90, 'ptn_live_key_htl_01', 'https://api.hyatt-korea.internal/v1/getfortrip/webhook', 1),
   ('ptn_tour_01', 'tour_partner@getfortrip.com', 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5', '(주)도쿄 익스플로러 투어스', 'TOUR', '202-86-33918', '02-333-8822', 0.88, 'ptn_live_key_tour_01', 'https://api.tokyo-explorer.internal/v1/getfortrip/webhook', 1),
   ('ptn_car_01', 'car_partner@getfortrip.com', 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5', '글로벌 모빌리티 & 렌터카 파트너스', 'CAR', '303-88-55410', '064-744-8899', 0.92, 'ptn_live_key_car_01', 'https://api.global-mobility.internal/v1/getfortrip/webhook', 1)
   ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash;`,

  // Notices
  `INSERT OR IGNORE INTO notices (id, title, content, is_emergency, banner_active) VALUES
   ('notice-01', '[긴급] 동남아 및 일본 태풍 예보에 따른 항공편 결항 시 수수료 100% 면제 안내', '기상 악화로 인한 항공사 결항/지연 통보 시 getfortrip 마이페이지에서 위약금 없이 100% 즉시 환불 및 일정 변경이 가능합니다.', 1, 1),
   ('notice-02', '유럽 유로스타(Eurostar) 노선 선로 개보수로 인한 일부 편수 출발 시각 변경 안내', '런던-파리 구간 일부 고속열차의 출발 시각이 15분 앞당겨졌으니 탑승 전 모바일 QR 티켓을 재확인해 주시기 바랍니다.', 0, 1);`
];

console.log("\n=== STEP 3: Seeding initial reference data ===");
for (const sql of seedCommands) {
  try {
    const preview = sql.replace(/[\r\n]+/g, ' ').substring(0, 60);
    process.stdout.write(`Seeding: ${preview}... `);
    runD1(sql);
    console.log("✅ OK");
  } catch (err) {
    console.error(`❌ Failed: ${err.message}`);
  }
}

console.log("\n✨ D1 schema migration & seeding complete!");

