// scripts/seed-d1-production.js
/**
 * getfortrip Platform - Production D1 Catalog Seeder
 * Converts Master Catalogs into D1 SQLite Schema & Executes Remote Seed
 *
 * #19: statements are INSERT ... ON CONFLICT(id) DO UPDATE with a
 * content-only SET list. Re-running the seed refreshes catalog content
 * (names, schedules, images, descriptions) but NEVER overwrites operational
 * columns owned by other writers: is_active, prices (*_price_krw,
 * total_*_krw, package_discount_rate), inventory (daily_capacity,
 * available_seats, available_stock), and review aggregates (review_score,
 * review_count). INSERT OR REPLACE would reset all of those — it is banned.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'frontend-user', 'data');
const outSqlPath = path.join(rootDir, 'database', 'seed_catalogs_remote.sql');

function loadTsCatalog(filename) {
  const filePath = path.join(dataDir, filename);
  const result = esbuild.buildSync({
    entryPoints: [filePath],
    bundle: false,
    format: 'cjs',
    write: false,
    platform: 'node',
    target: 'node18'
  });
  const code = result.outputFiles[0].text;
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', code);
  fn(m, m.exports, require);
  return m.exports;
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

console.log('🔄 Loading TypeScript catalogs...');

const hotelData = loadTsCatalog('hotelCatalog.ts');
const flightData = loadTsCatalog('flightCatalog.ts');
const trainData = loadTsCatalog('trainCatalog.ts');
const carData = loadTsCatalog('carCatalog.ts');
const activityData = loadTsCatalog('activityCatalog.ts');
const packageData = loadTsCatalog('packageCatalog.ts');

const sqlStatements = [];

/**
 * #19: content-only upsert. `cols` covers the INSERT branch (new products get
 * complete seed values); `updateCols` covers the conflict branch (only
 * seed-owned content — operational columns are never in this list).
 */
function upsert(table, cols, updateCols, values) {
  return `INSERT INTO ${table} (\n    ${cols.join(', ')}\n  ) VALUES (\n    ${values.join(',\n    ')}\n  ) ON CONFLICT(id) DO UPDATE SET\n    ${updateCols.map((c) => `${c} = excluded.${c}`).join(',\n    ')};`;
}

// 1. Hotels (operational: is_active, base_price_krw, review_score/count, daily_capacity)
const hotels = hotelData.MASTER_HOTEL_CATALOG || [];
console.log(`  - Hotels: ${hotels.length} items`);
hotels.forEach(h => {
  const minPrice = Array.isArray(h.rooms) && h.rooms.length > 0
    ? Math.min(...h.rooms.map(r => r.base_price_krw || 999999))
    : 150000;
  sqlStatements.push(upsert('hotels',
    ['id', 'partner_id', 'name_ko', 'name_en', 'city', 'country', 'address', 'latitude', 'longitude',
     'star_rating', 'property_type', 'review_score', 'review_count', 'neighborhood', 'subway_nearby',
     'free_cancellation', 'free_breakfast', 'base_price_krw', 'thumbnail_url',
     'images_json', 'amenities_json', 'rooms_json'],
    ['name_ko', 'name_en', 'city', 'country', 'address', 'latitude', 'longitude',
     'star_rating', 'property_type', 'neighborhood', 'subway_nearby',
     'free_cancellation', 'free_breakfast', 'thumbnail_url',
     'images_json', 'amenities_json', 'rooms_json'],
    [escapeSql(h.id),
    "'ptn_htl_01'",
    escapeSql(h.name_ko || h.name),
    escapeSql(h.name_en || h.name),
    escapeSql(h.city),
    escapeSql(h.country),
    escapeSql(h.address),
    String(h.latitude || 35.6599),
    String(h.longitude || 139.7292),
    String(h.star_rating || 5),
    escapeSql(h.property_type || 'HOTEL'),
    h.review_score ?? 'NULL',
    String(h.review_count ?? 0),
    escapeSql(h.neighborhood || ''),
    escapeSql(h.subway_nearby || ''),
    h.free_cancellation ? '1' : '0',
    h.free_breakfast ? '1' : '0',
    String(minPrice),
    escapeSql(h.thumbnail_url ?? h.images?.[0] ?? null),
    escapeSql(JSON.stringify(h.images || [])),
    escapeSql(JSON.stringify(h.amenities || [])),
    escapeSql(JSON.stringify(h.rooms || []))]));
});

// 2. Flights (operational: base_price_krw, available_seats)
const flights = flightData.MASTER_FLIGHT_SCHEDULES || [];
console.log(`  - Flights: ${flights.length} items`);
flights.forEach(f => {
  sqlStatements.push(upsert('flights',
    ['id', 'partner_id', 'flight_number', 'airline_name', 'airline_code', 'departure_airport',
     'arrival_airport', 'departure_city', 'arrival_city', 'departure_time', 'arrival_time',
     'duration_minutes', 'stops', 'departure_time_slot', 'cabin_class', 'base_price_krw',
     'free_baggage_kg', 'available_seats'],
    ['flight_number', 'airline_name', 'airline_code', 'departure_airport',
     'arrival_airport', 'departure_city', 'arrival_city', 'departure_time', 'arrival_time',
     'duration_minutes', 'stops', 'departure_time_slot', 'cabin_class', 'free_baggage_kg'],
    [escapeSql(f.id),
    "'ptn_flt_01'",
    escapeSql(f.flight_number),
    escapeSql(f.airline_name),
    escapeSql(f.airline_code),
    escapeSql(f.origin_code),
    escapeSql(f.dest_code),
    escapeSql(f.origin_name),
    escapeSql(f.dest_name),
    escapeSql(f.departure_time),
    escapeSql(f.arrival_time),
    String(f.duration_minutes || 120),
    String(f.stops || 0),
    escapeSql(f.time_slot || 'MORNING'),
    escapeSql(f.cabin_class || 'ECONOMY'),
    String(f.base_price_krw || 250000),
    String(f.free_baggage_kg || 23),
    String(f.available_seats || 30)]));
});

// 3. Trains (operational: price_krw, available_seats)
const trains = trainData.MASTER_TRAIN_SCHEDULES || [];
console.log(`  - Trains: ${trains.length} items`);
trains.forEach(t => {
  sqlStatements.push(upsert('trains',
    ['id', 'train_number', 'train_type', 'departure_station', 'arrival_station',
     'departure_time', 'arrival_time', 'duration_minutes', 'seat_class', 'price_krw', 'available_seats'],
    ['train_number', 'train_type', 'departure_station', 'arrival_station',
     'departure_time', 'arrival_time', 'duration_minutes', 'seat_class'],
    [escapeSql(t.id),
    escapeSql(t.train_number),
    escapeSql(t.train_type),
    escapeSql(t.departure_station),
    escapeSql(t.arrival_station),
    escapeSql(t.departure_time),
    escapeSql(t.arrival_time),
    String(t.duration_minutes || 150),
    escapeSql(t.seat_class || '일반실'),
    String(t.price_krw || 59800),
    String(t.available_seats || 50)]));
});

// 4. Cars (operational: daily_price_krw, available_stock)
const cars = carData.MASTER_CAR_CATALOG || [];
console.log(`  - Cars: ${cars.length} items`);
cars.forEach(c => {
  sqlStatements.push(upsert('cars',
    ['id', 'partner_id', 'company_name', 'vehicle_model', 'vehicle_type', 'seats',
     'transmission', 'daily_price_krw', 'pickup_location', 'insurance_included',
     'image_url', 'available_stock'],
    ['company_name', 'vehicle_model', 'vehicle_type', 'seats',
     'transmission', 'pickup_location', 'insurance_included', 'image_url'],
    [escapeSql(c.id),
    "'ptn_car_01'",
    escapeSql(c.company_name),
    escapeSql(c.vehicle_model),
    escapeSql(c.vehicle_category || 'SEDAN'),
    String(c.seats || 5),
    escapeSql(c.transmission || 'AUTO'),
    String(c.daily_price_krw || 45000),
    escapeSql(c.pickup_location_name || c.pickup_city),
    c.insurance_super_cdw ? '1' : '0',
    escapeSql(c.image_url),
    '10']));
});

// 5. Activities (operational: price_krw, review_score/count, daily_capacity)
const activities = activityData.MASTER_ACTIVITY_CATALOG || [];
console.log(`  - Activities: ${activities.length} items`);
activities.forEach(a => {
  sqlStatements.push(upsert('activities',
    ['id', 'partner_id', 'title', 'category', 'city', 'country', 'price_krw', 'review_score',
     'review_count', 'instant_confirmation', 'free_cancellation', 'duration_type',
     'guide_language', 'voucher_type', 'thumbnail_url', 'description', 'packages_json', 'daily_capacity'],
    ['title', 'category', 'city', 'country', 'instant_confirmation', 'free_cancellation', 'duration_type',
     'guide_language', 'voucher_type', 'thumbnail_url', 'description', 'packages_json'],
    [escapeSql(a.id),
    "'ptn_tour_01'",
    escapeSql(a.title),
    escapeSql(a.category || 'ATTRACTION'),
    escapeSql(a.city),
    escapeSql(a.country),
    String(a.price_krw || 50000),
    a.review_score ?? 'NULL',
    String(a.review_count ?? 0),
    a.instant_confirmation ? '1' : '0',
    a.free_cancellation ? '1' : '0',
    escapeSql(a.duration_type || 'FULL_DAY'),
    escapeSql(a.guide_language || 'KO'),
    "'QR_CODE'",
    escapeSql(a.image_url),
    escapeSql(Array.isArray(a.highlights) ? a.highlights.join('; ') : ''),
    escapeSql(JSON.stringify(a.included || [])),
    String(a.daily_capacity || 30)]));
});

// 6. Packages (operational: package_discount_rate, total_*_krw, daily_capacity)
const packages = packageData.MASTER_PACKAGE_CATALOG || [];
console.log(`  - Packages: ${packages.length} items`);
packages.forEach(p => {
  sqlStatements.push(upsert('packages',
    ['id', 'title', 'destination_city', 'hotel_id', 'flight_id', 'package_discount_rate',
     'total_original_krw', 'total_package_krw', 'thumbnail_url', 'details_json', 'daily_capacity'],
    ['title', 'destination_city', 'hotel_id', 'flight_id', 'thumbnail_url', 'details_json'],
    [escapeSql(p.id),
    escapeSql(p.title),
    escapeSql(p.city),
    escapeSql(p.hotel_id),
    escapeSql(p.flight_offer_id),
    String(p.savings_percentage || 15),
    String(p.original_price_krw || 1200000),
    String(p.bundle_price_krw || 990000),
    escapeSql(p.hero_image_url),
    escapeSql(JSON.stringify({ features: p.features || [], gallery: p.gallery || [] })),
    String(p.daily_capacity || 16)]));
});

fs.writeFileSync(outSqlPath, sqlStatements.join('\n\n'), 'utf8');
console.log(`\n💾 Generated SQL file with ${sqlStatements.length} statements at: ${outSqlPath}`);
if (!process.argv.includes('--execute')) {
  console.log('ℹ️ SQL generated only. Pass --execute to run the remote D1 seed.');
  process.exit(0);
}
console.log('🚀 Executing D1 remote seed...');

try {
  execSync(`npx wrangler d1 execute ota_production --remote --file=${outSqlPath}`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('\n✅ Remote D1 catalogs seeded successfully!');
} catch (e) {
  console.error('\n❌ Seeding failed:', e.message);
  process.exit(1);
}

