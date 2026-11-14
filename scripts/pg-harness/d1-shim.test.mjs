import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { splitRegions, translateSQL, createD1Shim } from './d1-shim.mjs'

// TG-09: SQL translation is pure and covered without a database.

test('shim: ? placeholders become $n in order', () => {
  assert.equal(
    translateSQL('SELECT * FROM t WHERE a = ? AND b = ?'),
    'SELECT * FROM t WHERE a = $1 AND b = $2',
  )
})

test('shim: literals, comments, and quoted idents pass through untouched', () => {
  assert.equal(
    translateSQL(`SELECT 'what?' AS "we?ird" FROM t -- trailing ?\nWHERE a = ? /* ? */`),
    `SELECT 'what?' AS "we?ird" FROM t -- trailing ?\nWHERE a = $1 /* ? */`,
  )
  assert.equal(
    translateSQL(`SELECT 'it''s ? ok' FROM t WHERE a = ?`),
    `SELECT 'it''s ? ok' FROM t WHERE a = $1`,
  )
})

test('shim: INSERT OR IGNORE becomes ON CONFLICT DO NOTHING', () => {
  assert.equal(
    translateSQL('INSERT OR IGNORE INTO t (a) VALUES (?)'),
    'INSERT INTO t (a) VALUES ($1) ON CONFLICT DO NOTHING',
  )
  assert.equal(
    translateSQL('insert or ignore into t (a) select a from u;'),
    'insert into t (a) select a from u ON CONFLICT DO NOTHING',
  )
})

test('shim: legacy-hex GLOB becomes a regex, unknown GLOB fails loud', () => {
  assert.equal(
    translateSQL(`SELECT COUNT(*) FROM u WHERE password_hash GLOB '[0-9a-f]*'`),
    `SELECT COUNT(*) FROM u WHERE password_hash ~ '^[0-9a-f]*$'`,
  )
  assert.throws(() => translateSQL(`SELECT * FROM u WHERE x GLOB 'a*'`), /unsupported GLOB/)
})

test('shim: CURRENT_TIMESTAMP, rowid, and LIKE map to PG semantics', () => {
  assert.equal(
    translateSQL('SELECT CURRENT_TIMESTAMP, rowid FROM t WHERE name LIKE ? ORDER BY created_at, rowid'),
    'SELECT gft_now(), ctid FROM t WHERE name ILIKE $1 ORDER BY created_at, ctid',
  )
  assert.equal(
    translateSQL(`SELECT * FROM t WHERE note NOT LIKE '%x%'`),
    `SELECT * FROM t WHERE note NOT ILIKE '%x%'`,
  )
})

test('shim: strftime passes through to the PG UDF untouched', () => {
  const q = `DELETE FROM t WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')`
  assert.equal(translateSQL(q), q)
})

test('shim: adapter maps D1 shapes over a fake pool', async () => {
  const seen = []
  const pool = { query: async (text, params) => { seen.push({ text, params }); return { rows: [{ ok: 1 }], rowCount: 1 } } }
  const db = createD1Shim(pool)
  assert.deepEqual(await db.prepare('SELECT 1 AS ok WHERE 1 = ?').bind(1).first(), { ok: 1 })
  assert.deepEqual(await db.prepare('SELECT ?').bind('x').all(), { results: [{ ok: 1 }] })
  assert.deepEqual(await db.prepare('DELETE FROM t WHERE a = ?').bind(2).run(), { success: true, meta: { changes: 1 } })
  assert.equal(seen[0].text, 'SELECT 1 AS ok WHERE 1 = $1')
  assert.deepEqual(seen[1].params, ['x'])
})

function txnPool(seen, failOn) {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => ({
      query: async (text) => {
        seen.push(text)
        if (failOn && text.includes(failOn)) throw new Error('boom')
        return { rows: [], rowCount: 1 }
      },
      release: () => seen.push('release'),
    }),
  }
}

test('shim: batch runs atomically on one client and maps changes', async () => {
  const seen = []
  const db = createD1Shim(txnPool(seen))
  const b = await db.batch([db.prepare('DELETE FROM a').bind(), db.prepare('DELETE FROM b WHERE x = ?').bind(7)])
  assert.deepEqual(b, [{ success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 1 } }])
  assert.deepEqual(seen, ['BEGIN', 'DELETE FROM a', 'DELETE FROM b WHERE x = $1', 'COMMIT', 'release'])
})

test('shim: batch accepts unbound prepares like D1', async () => {
  const seen = []
  const db = createD1Shim(txnPool(seen))
  const b = await db.batch([db.prepare('DELETE FROM t')])
  assert.deepEqual(b, [{ success: true, meta: { changes: 1 } }])
  assert.deepEqual(seen, ['BEGIN', 'DELETE FROM t', 'COMMIT', 'release'])
})

test('shim: batch failure rolls back and releases', async () => {
  const seen = []
  const db = createD1Shim(txnPool(seen, 'DELETE FROM b'))
  await assert.rejects(db.batch([db.prepare('DELETE FROM a').bind(), db.prepare('DELETE FROM b').bind()]), /boom/)
  assert.deepEqual(seen, ['BEGIN', 'DELETE FROM a', 'DELETE FROM b', 'ROLLBACK', 'release'])
})

test('shim: batch rejects foreign statements instead of misfiring', async () => {
  const seen = []
  const db = createD1Shim(txnPool(seen))
  const foreign = { first: async () => null, all: async () => ({ results: [] }), run: async () => ({ changes: 0 }) }
  await assert.rejects(db.batch([foreign]))
});

test('shim: first/all/run work with or without an explicit bind', async () => {
  const seen = []
  const pool = { query: async (text, params) => { seen.push({ text, params }); return { rows: [{ ok: 1 }], rowCount: 1 } } }
  const db = createD1Shim(pool)
  assert.deepEqual(await db.prepare('SELECT 1 AS ok').first(), { ok: 1 })
  assert.deepEqual(await db.prepare('SELECT 1 AS ok').all(), { results: [{ ok: 1 }] })
  assert.deepEqual(seen[0].params, [])
})
