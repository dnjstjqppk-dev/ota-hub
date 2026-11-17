-- TG-18: NDC/GDS supplier fulfilment groundwork.
--
-- (a) suppliers.adapter CHECK gains 'ndc' + 'gds'. SQLite CHECK constraints
-- are immutable, so the table is rebuilt (0034 precedent): copy -> drop ->
-- rename, then recreate the outlink index. All 12 live columns are copied
-- (0002 base + 0036 outlink_partner_id).
-- (b) airport/airline mapping tables (IATA reference data, seeded).
-- (c) fare_cache: shared D1 layer for NDC/GDS offer caching (TTL 15 min).
-- The hot layer is per-isolate (fare-cache.ts); Redis waits on a generic
-- cache API in EphemeralStore (same note as TG-16 search hot cache).

CREATE TABLE suppliers_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_domain TEXT NOT NULL,
    adapter TEXT NOT NULL DEFAULT 'none' CHECK (adapter IN ('none', 'direct_contract', 'simulator', 'api', 'ndc', 'gds')),
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
    outlink_partner_id TEXT NULL REFERENCES affiliate_partners_config(partner_id)
);

INSERT INTO suppliers_new
    (id, name, product_domain, adapter, integration_status, transaction_model,
     settlement_rate_bps, settlement_currency, contract_id, notes,
     created_at, updated_at, outlink_partner_id)
SELECT id, name, product_domain, adapter, integration_status, transaction_model,
       settlement_rate_bps, settlement_currency, contract_id, notes,
       created_at, updated_at, outlink_partner_id
FROM suppliers;

DROP TABLE suppliers;
ALTER TABLE suppliers_new RENAME TO suppliers;

CREATE INDEX IF NOT EXISTS idx_suppliers_outlink ON suppliers (outlink_partner_id);

CREATE TABLE IF NOT EXISTS airport_mappings (
  code TEXT PRIMARY KEY CHECK (code = UPPER(code) AND LENGTH(code) = 3),
  city_ko TEXT NOT NULL,
  city_en TEXT NOT NULL,
  country_code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS airline_mappings (
  code TEXT PRIMARY KEY CHECK (code = UPPER(code) AND LENGTH(code) <= 3),
  name_ko TEXT NOT NULL,
  name_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fare_cache (
  cache_key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fare_cache_expires ON fare_cache (expires_at);

INSERT OR IGNORE INTO airport_mappings (code, city_ko, city_en, country_code) VALUES
  ('ICN', '서울/인천', 'Seoul/Incheon', 'KR'),
  ('GMP', '서울/김포', 'Seoul/Gimpo', 'KR'),
  ('PUS', '부산/김해', 'Busan/Gimhae', 'KR'),
  ('CJU', '제주', 'Jeju', 'KR'),
  ('NRT', '도쿄/나리타', 'Tokyo/Narita', 'JP'),
  ('HND', '도쿄/하네다', 'Tokyo/Haneda', 'JP'),
  ('KIX', '오사카/간사이', 'Osaka/Kansai', 'JP'),
  ('FUK', '후쿠오카', 'Fukuoka', 'JP'),
  ('CTS', '삿포로', 'Sapporo/Chitose', 'JP'),
  ('TPE', '타이베이', 'Taipei/Taoyuan', 'TW'),
  ('HKG', '홍콩', 'Hong Kong', 'HK'),
  ('SIN', '싱가포르', 'Singapore', 'SG'),
  ('BKK', '방콕', 'Bangkok/Suvarnabhumi', 'TH'),
  ('HAN', '하노이', 'Hanoi/Noi Bai', 'VN'),
  ('SGN', '호치민', 'Ho Chi Minh City', 'VN'),
  ('KUL', '쿠알라룸푸르', 'Kuala Lumpur', 'MY'),
  ('SYD', '시드니', 'Sydney', 'AU'),
  ('HNL', '호놀룰루', 'Honolulu', 'US'),
  ('LAX', '로스앤젤레스', 'Los Angeles', 'US'),
  ('JFK', '뉴욕', 'New York/Kennedy', 'US');

INSERT OR IGNORE INTO airline_mappings (code, name_ko, name_en) VALUES
  ('KE', '대한항공', 'Korean Air'),
  ('OZ', '아시아나항공', 'Asiana Airlines'),
  ('7C', '제주항공', 'Jeju Air'),
  ('BX', '에어부산', 'Air Busan'),
  ('TW', '티웨이항공', 'T''way Air'),
  ('LJ', '진에어', 'Jin Air'),
  ('NH', '전일본공수', 'ANA'),
  ('JL', '일본항공', 'JAL'),
  ('CX', '캐세이퍼시픽', 'Cathay Pacific'),
  ('SQ', '싱가포르항공', 'Singapore Airlines');
