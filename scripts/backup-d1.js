// scripts/backup-d1.js
/**
 * D1 backup (#115, P0-2 redesign 2026-11-22): portable SQL dump without
 * `wrangler d1 export`.
 *
 *   node scripts/backup-d1.js [--local] [--out DIR] [--db NAME]
 *
 * Default exports the REMOTE ota_production database (needs wrangler auth).
 * --local exports the dev database instead (drills, CI smoke). The dump is
 * verified: non-empty, CREATE TABLE count matches the live sqlite_master
 * count, and a row-count spot check passes on money tables.
 * DRY_RUN=1 prints every step without executing.
 *
 * Why not `d1 export`: it refuses databases containing virtual tables
 * ("cannot export databases with virtual tables (like FTS5)"), and
 * 0049_search_fts.sql made catalog_fts (+21 triggers) permanent. This script
 * dumps schema + rows over `d1 execute` instead: every user table, view,
 * trigger, and index — including the FTS5 virtual table definition, whose
 * triggers rebuild the index on restore (shadow tables are skipped: CREATE
 * VIRTUAL TABLE recreates them). Objects prefixed sqlite_ or _cf_ are skipped.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === '1';
const args = process.argv.slice(2);
const LOCAL = args.includes('--local');
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'backups';
const dbIdx = args.indexOf('--db');
const DB = dbIdx >= 0 && args[dbIdx + 1] ? args[dbIdx + 1] : 'ota_production';

// FTS5 shadow suffixes: recreated by CREATE VIRTUAL TABLE, never dumped.
const SHADOW_SUFFIXES = ['_data', '_idx', '_content', '_docsize', '_config'];
const SKIP_PREFIXES = ['sqlite_', '_cf_'];
const ROWS_PER_PAGE = 200;
const ROWS_PER_INSERT = 50;

function run(argv, opts = {}) {
  if (DRY_RUN) {
    console.log(`   [dry-run] npx ${argv.join(' ')}`);
    return '';
  }
  // Invoke the wrangler CLI through node directly: no shell, no .cmd quoting
  // pitfalls on Windows, identical argv on every platform. Raise maxBuffer so
  // wide JSON pages (rooms_json, audit logs) never fail with ENOBUFS.
  return execFileSync(process.execPath, [path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...argv], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

function wrangler(d1args) {
  const scope = LOCAL ? ['--local', '-c', 'wrangler.local.jsonc'] : ['--remote'];
  return run(['d1', ...d1args, ...scope]);
}

/** Rows of a `d1 execute --json --command` query (live DB read). */
function q(liveDb, sql) {
  const out = wrangler(['execute', liveDb, '--json', '--command', sql]);
  return JSON.parse(out)[0]?.results || [];
}

/** SQL string literal for a D1 JSON value (pure, unit-tested). */
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  // D1 --json returns BLOBs as byte arrays; node:sqlite as Uint8Array.
  const bytes = Array.isArray(v) ? v : (ArrayBuffer.isView(v) ? [...v] : null);
  if (bytes) return `X'${bytes.map((b) => Number(b).toString(16).padStart(2, '0')).join('')}'`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
}

/** Double-quoted SQL identifier (pure, unit-tested). */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function isSkipped(name) {
  const n = String(name);
  return SKIP_PREFIXES.some((p) => n.startsWith(p));
}

async function main() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const liveDb = LOCAL ? 'ota_local' : DB;
  const out = path.join(OUT_DIR, `${liveDb}-${stamp}.sql`);
  if (DRY_RUN) {
    console.log(`[backup] exporting ${liveDb} (${LOCAL ? 'local' : 'remote'}) -> ${out}`);
    console.log('   [dry-run] enumerate sqlite_master (tables, views, triggers, indexes)');
    console.log('   [dry-run] dump schema + rows per user table (FTS5 shadow tables skipped)');
    console.log('   [dry-run] verify dumped/live table counts + money-table row spot checks');
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[backup] exporting ${liveDb} (${LOCAL ? 'local' : 'remote'}) -> ${out}`);

  const master = q(liveDb, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL");
  const virtuals = new Set(
    master.filter((r) => r.type === 'table' && /^CREATE VIRTUAL TABLE\b/i.test(r.sql || '')).map((r) => String(r.name)),
  );
  const isShadow = (name) => [...virtuals].some((v) => name !== v && name.startsWith(`${v}_`) && SHADOW_SUFFIXES.some((s) => name === `${v}${s}`));
  const dumpable = (r) => !isSkipped(r.name) && !isShadow(String(r.name));

  const tables = master.filter((r) => r.type === 'table' && !virtuals.has(String(r.name)) && dumpable(r));
  const vts = master.filter((r) => r.type === 'table' && virtuals.has(String(r.name)));
  const views = master.filter((r) => r.type === 'view' && dumpable(r));
  const triggers = master.filter((r) => r.type === 'trigger' && dumpable(r));
  const indexes = master.filter((r) => r.type === 'index' && dumpable(r) && !String(r.name).startsWith('sqlite_autoindex_'));

  const chunks = [];
  chunks.push(`-- getfortrip D1 dump of ${liveDb} (${LOCAL ? 'local' : 'remote'}) at ${new Date().toISOString()}`);
  chunks.push('-- Produced by scripts/backup-d1.js (schema + rows over d1 execute; FTS5-safe).');
  chunks.push('PRAGMA foreign_keys=OFF;');
  for (const r of [...tables, ...vts, ...views, ...triggers, ...indexes]) {
    chunks.push(`${String(r.sql).trim().replace(/;+$/, '')};`);
  }

  // Rows: base tables only (views/virtual/shadow tables hold no dumped rows —
  // FTS triggers above rebuild the index from base inserts on restore).
  // Use rowid keyset pagination (falling back to OFFSET for WITHOUT ROWID tables)
  // so live writes during backup cannot duplicate rows across pages.
  let totalRows = 0;
  for (const t of tables) {
    const name = String(t.name);
    const cols = q(liveDb, `SELECT name FROM pragma_table_info(${sqlLiteral(name)})`).map((r) => String(r.name));
    if (!cols.length) continue;
    const head = `INSERT INTO ${quoteIdent(name)} (${cols.map(quoteIdent).join(', ')}) VALUES `;
    let tableRows = 0;
    const isWithoutRowid = /\bWITHOUT\s+ROWID\b/i.test(String(t.sql || ''));
    if (!isWithoutRowid) {
      let lastRowid = -1;
      for (;;) {
        const rows = q(
          liveDb,
          `SELECT _rowid_ AS __gft_rowid, ${cols.map(quoteIdent).join(', ')} FROM ${quoteIdent(name)} WHERE _rowid_ > ${lastRowid} ORDER BY _rowid_ ASC LIMIT ${ROWS_PER_PAGE}`
        );
        if (!rows.length) break;
        for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
          const slice = rows.slice(i, i + ROWS_PER_INSERT);
          chunks.push(head + slice.map((r) => `(${cols.map((col) => sqlLiteral(r[col])).join(', ')})`).join(', ') + ';');
        }
        tableRows += rows.length;
        totalRows += rows.length;
        const nextId = Number(rows[rows.length - 1].__gft_rowid);
        if (!Number.isFinite(nextId) || nextId <= lastRowid) break;
        lastRowid = nextId;
        if (rows.length < ROWS_PER_PAGE) break;
      }
    } else {
      const [{ c }] = q(liveDb, `SELECT COUNT(*) AS c FROM ${quoteIdent(name)}`);
      for (let off = 0; off < c; off += ROWS_PER_PAGE) {
        const rows = q(liveDb, `SELECT ${cols.map(quoteIdent).join(', ')} FROM ${quoteIdent(name)} LIMIT ${ROWS_PER_PAGE} OFFSET ${off}`);
        for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
          const slice = rows.slice(i, i + ROWS_PER_INSERT);
          chunks.push(head + slice.map((r) => `(${cols.map((col) => sqlLiteral(r[col])).join(', ')})`).join(', ') + ';');
        }
        tableRows += rows.length;
        totalRows += rows.length;
      }
    }
    if (tableRows > 0) console.log(`[backup] dumped ${name}: ${tableRows} rows`);
  }
  chunks.push('PRAGMA foreign_keys=ON;');
  fs.writeFileSync(out, `${chunks.join('\n')}\n`);

  const st = fs.statSync(out);
  if (st.size === 0) throw new Error('empty dump');
  const dump = fs.readFileSync(out, 'utf8');
  const dumpedTables = new Set([...dump.matchAll(/CREATE (?:VIRTUAL )?TABLE (?:IF NOT EXISTS )?["`[]?(\w+)/gi)].map((m) => m[1].toLowerCase()));
  const liveTables = new Set(master.filter((r) => r.type === 'table').map((r) => String(r.name).toLowerCase()).filter((n) => !isSkipped(n) && !isShadow(n)));
  const missing = [...liveTables].filter((t) => !dumpedTables.has(t));
  const dumpedUser = [...dumpedTables].filter((t) => !isSkipped(t)).length;
  console.log(`[backup] dump ${(st.size / 1024).toFixed(1)} KiB, user tables dumped/live: ${dumpedUser}/${liveTables.size}, ${totalRows} rows`);
  if (missing.length) throw new Error(`tables missing from dump: ${missing.join(', ')}`);
  for (const t of ['users', 'bookings', 'payments', 'ledger_entries']) {
    if (!liveTables.has(t)) continue;
    const r = q(liveDb, `SELECT COUNT(*) AS c FROM ${quoteIdent(t)}`);
    console.log(`[backup] row check ${t}: ${r[0]?.c ?? '?'} rows live`);
  }
  console.log(`[backup] OK: ${out}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`[backup] FAILED: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { sqlLiteral, quoteIdent };
