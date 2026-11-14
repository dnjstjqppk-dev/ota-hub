import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { rewriteE2E } from './query.mjs'

// TG-09: E2E-only rewrites (the suite's direct probes bypass the worker, so
// its 3 SQLite-only shapes are ported here, not in product code).

test('query: sqlite_master index probe becomes pg_indexes', () => {
  assert.equal(
    rewriteE2E(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_x'`),
    `SELECT COUNT(*) AS c FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_x'`,
  )
})

test('query: WITH-after-INSERT moves to front for PG', () => {
  assert.equal(
    rewriteE2E(`INSERT INTO t (a) WITH RECURSIVE c(x) AS (SELECT 1) SELECT * FROM c`),
    `WITH RECURSIVE c(x) AS (SELECT 1) INSERT INTO t (a) SELECT * FROM c`,
  )
  assert.throws(() => rewriteE2E(`INSERT INTO t (a) WITH RECURSIVE nonsense`), /WITH shape/)
})

test('query: affiliate OR REPLACE becomes a targeted upsert', () => {
  assert.equal(
    rewriteE2E(`INSERT OR REPLACE INTO affiliate_partners_config (partner_id, name) VALUES ('e', 'n')`),
    `INSERT INTO affiliate_partners_config (partner_id, name) VALUES ('e', 'n') ON CONFLICT(partner_id) DO UPDATE SET name=excluded.name`,
  )
  assert.throws(
    () => rewriteE2E(`INSERT OR REPLACE INTO other_tbl (a) VALUES (1)`),
    /only ported for affiliate_partners_config/,
  )
})

test('query: portable probes pass through untouched', () => {
  const q = `SELECT COUNT(*) AS c FROM bookings WHERE id = 'x'`
  assert.equal(rewriteE2E(q), q)
})
