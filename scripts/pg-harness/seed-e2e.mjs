#!/usr/bin/env node
// scripts/pg-harness/seed-e2e.mjs
// TG-09: E2E bootstrap seed for Postgres ??mirrors scripts/seed-isolated.mjs
// part 2/3 (catalog SQL already applied): simulator suppliers, partner dev
// passwords, local admin (known password), test promotions.
// Usage: E2E_PG_URL=... node scripts/pg-harness/seed-e2e.mjs [adminPassword]
import pg from 'pg';
import { webcrypto as crypto } from 'node:crypto';

const pool = new pg.Pool({ connectionString: process.env.E2E_PG_URL || 'postgres://postgres:LocalPg2026%21x@127.0.0.1:55433/ota_pg' });

async function pbkdf2Hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256);
  const hex = (u) => Buffer.from(u).toString('hex');
  return `pbkdf2:sha256:100000:${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

const adminPassword = process.argv[2] || 'LocalAdmin2026!x';
const hash = await pbkdf2Hash(adminPassword);
// Same dev hash as seed-isolated.mjs (partner/staff fixtures log in with it).
const PARTNER_DEV_HASH = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4';

await pool.query(`UPDATE suppliers SET adapter = 'simulator', integration_status = 'NOT_INTEGRATED', notes = 'LOCAL DEV: simulator adapter' WHERE id IN ('ptn_htl_01', 'ptn_flt_01', 'ptn_car_01', 'ptn_tour_01')`);
await pool.query(`UPDATE partners SET password_hash = $1, is_active = 1 WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01')`, [PARTNER_DEV_HASH]);
await pool.query(`UPDATE partner_staff SET password_hash = $1 WHERE id IN ('stf_hotel_01', 'stf_car_01', 'stf_tour_01')`, [PARTNER_DEV_HASH]);
await pool.query(
  `INSERT INTO users (id, email, password_hash, full_name, role, tier, trip_coins)
   VALUES ('usr_local_admin', 'admin@local.test', $1, '로컬 관리자', 'ADMIN', 'SILVER', 0)
   ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, role = 'ADMIN'`,
  [hash],
);
await pool.query(
  `INSERT INTO promotions (id, code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_from, valid_until, is_active) VALUES
  ('promo_test10', 'TEST10', '[?�스?? 10% ?�인 (최�? 30,000??', 'PERCENTAGE', 10, 50000, 30000, '2026-01-01T00:00:00Z', '2027-12-31T23:59:59Z', 1),
  ('promo_expired', 'EXPIRED', '[?�스?? 만료 쿠폰', 'FIXED_AMOUNT', 10000, 0, 10000, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z', 1)
  ON CONFLICT(id) DO NOTHING`,
);
console.log(`seeded pg E2E bootstrap (admin: admin@local.test / ${adminPassword})`);
await pool.end();
