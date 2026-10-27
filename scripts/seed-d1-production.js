// scripts/seed-d1-production.js
/**
 * getfortrip Platform - Production D1 Catalog Seeder
 * Converts Master Catalogs into D1 SQLite Schema & Executes Remote Seed
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

// 1. Hotels
const hotels = hotelData.MASTER_HOTEL_CATALOG || [];
console.log(`  - Hotels: ${hotels.length} items`);
hotels.forEach(h => {
  const minPrice = Array.isArray(h.rooms) && h.rooms.length > 0
    ? Math.min(...h.rooms.map(r => r.base_price_krw || 999999))
    : 150000;
  sqlStatements.push(`INSERT OR REPLACE INTO hotels (
    id, partner_id, name_ko, name_en, city, country, address, latitude, longitude,
    star_rating, property_type, review_score, review_count, neighborhood, subway_nearby,
    free_cancellation, free_breakfast, base_price_krw, thumbnail_url,
    images_json, amenities_json, rooms_json
  ) VALUES (
    ${escapeSql(h.id)},
    'ptn_htl_01',
    ${escapeSql(h.name_ko || h.name)},
    ${escapeSql(h.name_en || h.name)},
    ${escapeSql(h.city)},
    ${escapeSql(h.country)},
    ${escapeSql(h.address)},
    ${h.latitude || 35.6599},
    ${h.longitude || 139.7292},
    ${h.star_rating || 5},
    ${escapeSql(h.property_type || 'HOTEL')},
    ${h.review_score || 4.8},
    ${h.review_count || 500},
    ${escapeSql(h.neighborhood || '')},
    ${escapeSql(h.subway_nearby || '')},
    ${h.free_cancellation ? 1 : 0},
    ${h.free_breakfast ? 1 : 0},
    ${minPrice},
    ${escapeSql(h.thumbnail_url || (h.images?.[0] ?? ''))},
    ${escapeSql(JSON.stringify(h.images || []))},
    ${escapeSql(JSON.stringify(h.amenities || []))},
    ${escapeSql(JSON.stringify(h.rooms || []))}
  );`);
});

// 2. Flights
const flights = flightData.MASTER_FLIGHT_SCHEDULES || [];
console.log(`  - Flights: ${flights.length} items`);
flights.forEach(f => {
  sqlStatements.push(`INSERT OR REPLACE INTO flights (
    id, partner_id, flight_number, airline_name, airline_code, departure_airport,
    arrival_airport, departure_city, arrival_city, departure_time, arrival_time,
    duration_minutes, stops, departure_time_slot, cabin_class, base_price_krw,
    free_baggage_kg, available_seats
  ) VALUES (
    ${escapeSql(f.id)},
    'ptn_flt_01',
    ${escapeSql(f.flight_number)},
    ${escapeSql(f.airline_name)},
    ${escapeSql(f.airline_code)},
    ${escapeSql(f.origin_code)},
    ${escapeSql(f.dest_code)},
    ${escapeSql(f.origin_name)},
    ${escapeSql(f.dest_name)},
    ${escapeSql(f.departure_time)},
    ${escapeSql(f.arrival_time)},
    ${f.duration_minutes || 120},
    ${f.stops || 0},
    ${escapeSql(f.time_slot || 'MORNING')},
    ${escapeSql(f.cabin_class || 'ECONOMY')},
    ${f.base_price_krw || 250000},
    ${f.free_baggage_kg || 23},
    ${f.available_seats || 30}
  );`);
});

// 3. Trains
const trains = trainData.MASTER_TRAIN_SCHEDULES || [];
console.log(`  - Trains: ${trains.length} items`);
trains.forEach(t => {
  sqlStatements.push(`INSERT OR REPLACE INTO trains (
    id, train_number, train_type, departure_station, arrival_station,
    departure_time, arrival_time, duration_minutes, seat_class, price_krw, available_seats
  ) VALUES (
    ${escapeSql(t.id)},
    ${escapeSql(t.train_number)},
    ${escapeSql(t.train_type)},
    ${escapeSql(t.departure_station)},
    ${escapeSql(t.arrival_station)},
    ${escapeSql(t.departure_time)},
    ${escapeSql(t.arrival_time)},
    ${t.duration_minutes || 150},
    ${escapeSql(t.seat_class || '일반실')},
    ${t.price_krw || 59800},
    ${t.available_seats || 50}
  );`);
});

// 4. Cars
const cars = carData.MASTER_CAR_CATALOG || [];
console.log(`  - Cars: ${cars.length} items`);
cars.forEach(c => {
  sqlStatements.push(`INSERT OR REPLACE INTO cars (
    id, partner_id, company_name, vehicle_model, vehicle_type, seats,
    transmission, daily_price_krw, pickup_location, insurance_included,
    image_url, available_stock
  ) VALUES (
    ${escapeSql(c.id)},
    'ptn_car_01',
    ${escapeSql(c.company_name)},
    ${escapeSql(c.vehicle_model)},
    ${escapeSql(c.vehicle_category || 'SEDAN')},
    ${c.seats || 5},
    ${escapeSql(c.transmission || 'AUTO')},
    ${c.daily_price_krw || 45000},
    ${escapeSql(c.pickup_location_name || c.pickup_city)},
    ${c.insurance_super_cdw ? 1 : 0},
    ${escapeSql(c.image_url)},
    10
  );`);
});

// 5. Activities
const activities = activityData.MASTER_ACTIVITY_CATALOG || [];
console.log(`  - Activities: ${activities.length} items`);
activities.forEach(a => {
  sqlStatements.push(`INSERT OR REPLACE INTO activities (
    id, partner_id, title, category, city, country, price_krw, review_score,
    review_count, instant_confirmation, free_cancellation, duration_type,
    guide_language, voucher_type, thumbnail_url, description, packages_json
  ) VALUES (
    ${escapeSql(a.id)},
    'ptn_tour_01',
    ${escapeSql(a.title)},
    ${escapeSql(a.category || 'ATTRACTION')},
    ${escapeSql(a.city)},
    ${escapeSql(a.country)},
    ${a.price_krw || 50000},
    ${a.review_score || 4.9},
    ${a.review_count || 500},
    ${a.instant_confirmation ? 1 : 0},
    ${a.free_cancellation ? 1 : 0},
    ${escapeSql(a.duration_type || 'FULL_DAY')},
    ${escapeSql(a.guide_language || 'KO')},
    'QR_CODE',
    ${escapeSql(a.image_url)},
    ${escapeSql(Array.isArray(a.highlights) ? a.highlights.join('; ') : '')},
    ${escapeSql(JSON.stringify(a.included || []))}
  );`);
});

// 6. Packages
const packages = packageData.MASTER_PACKAGE_CATALOG || [];
console.log(`  - Packages: ${packages.length} items`);
packages.forEach(p => {
  sqlStatements.push(`INSERT OR REPLACE INTO packages (
    id, title, destination_city, hotel_id, flight_id, package_discount_rate,
    total_original_krw, total_package_krw, thumbnail_url, details_json
  ) VALUES (
    ${escapeSql(p.id)},
    ${escapeSql(p.title)},
    ${escapeSql(p.city)},
    ${escapeSql(p.hotel_id)},
    ${escapeSql(p.flight_offer_id)},
    ${p.savings_percentage || 15},
    ${p.original_price_krw || 1200000},
    ${p.bundle_price_krw || 990000},
    ${escapeSql(p.hero_image_url)},
    ${escapeSql(JSON.stringify({ features: p.features || [], gallery: p.gallery || [] }))}
  );`);
});

fs.writeFileSync(outSqlPath, sqlStatements.join('\n\n'), 'utf8');
console.log(`\n💾 Generated SQL file with ${sqlStatements.length} statements at: ${outSqlPath}`);
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

