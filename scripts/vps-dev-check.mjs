#!/usr/bin/env node
// scripts/vps-dev-check.mjs
// Connectivity + sanity check for the VPS dev database (or local docker —
// same URLs). Reads the EXISTING harness variables, nothing new:
//   E2E_PG_URL    (default postgres://postgres:LocalPg2026%21x@127.0.0.1:15433/ota_pg)
//   E2E_REDIS_URL (default redis://127.0.0.1:16381)
// Prints one JSON summary, exit 0 when both answer, exit 1 otherwise.
// URLs never print (they carry passwords). Fails loud within ~6s per backend.
import pg from 'pg';
import { connectRedis } from './redis-store/redis-ephemeral.mjs';

const PG_URL = process.env.E2E_PG_URL || process.env.DATABASE_URL || 'postgres://postgres:LocalPg2026%21x@127.0.0.1:15433/ota_pg';
const REDIS_URL = process.env.E2E_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:16381';

async function checkPg() {
  const pool = new pg.Pool({ connectionString: PG_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  const t0 = Date.now();
  try {
    const ver = await pool.query('SELECT version() AS v');
    const tables = await pool.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'");
    const fns = await pool.query("SELECT COUNT(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('gft_now', 'strftime')");
    return { ok: true, latencyMs: Date.now() - t0, version: String(ver.rows[0].v).split(' ').slice(0, 2).join(' '), tables: tables.rows[0].n, compatFns: fns.rows[0].n };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function checkRedis() {
  const t0 = Date.now();
  const client = await connectRedis(REDIS_URL);
  try {
    const pong = await client.ping();
    return { ok: true, latencyMs: Date.now() - t0, pong: String(pong) };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

const out = { pg: null, redis: null };
let failed = null;
try {
  out.pg = await checkPg();
} catch (e) {
  out.pg = { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  failed = 'pg';
}
try {
  out.redis = await checkRedis();
} catch (e) {
  out.redis = { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  failed = failed ? 'pg+redis' : 'redis';
}
console.log(JSON.stringify(failed ? { ok: false, failed, ...out } : { ok: true, ...out }, null, 2));
process.exit(failed ? 1 : 0);
