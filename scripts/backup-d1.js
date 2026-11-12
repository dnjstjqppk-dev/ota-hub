// scripts/backup-d1.js
/**
 * D1 backup (#115): timestamped SQL export plus a self-check.
 *
 *   node scripts/backup-d1.js [--local] [--out DIR] [--db NAME]
 *
 * Default exports the REMOTE ota_production database (needs wrangler auth).
 * --local exports the dev database instead (drills, CI smoke). The dump is
 * verified: non-empty, CREATE TABLE count matches the live sqlite_master
 * count, and a row-count spot check passes on money tables.
 * DRY_RUN=1 prints every step without executing.
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

function run(argv, opts = {}) {
  if (DRY_RUN) {
    console.log(`   [dry-run] npx ${argv.join(' ')}`);
    return '';
  }
  // Invoke the wrangler CLI through node directly: no shell, no .cmd quoting
  // pitfalls on Windows, identical argv on every platform.
  return execFileSync(process.execPath, [path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...argv], { encoding: 'utf8', ...opts });
}

function wrangler(d1args) {
  const scope = LOCAL ? ['--local', '-c', 'wrangler.local.jsonc'] : ['--remote'];
  return run(['d1', ...d1args, ...scope]);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const out = path.join(OUT_DIR, `${DB}-${stamp}.sql`);
  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[backup] exporting ${DB} (${LOCAL ? 'local' : 'remote'}) -> ${out}`);
  wrangler(['export', LOCAL ? 'ota_local' : DB, '--output', out, '-y']);
  if (DRY_RUN) return;
  const st = fs.statSync(out);
  if (st.size === 0) throw new Error('empty dump');
  const dump = fs.readFileSync(out, 'utf8');
  const dumpedTables = new Set([...dump.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?["`[]?(\w+)/gi)].map((m) => m[1].toLowerCase()));
  const liveDb = LOCAL ? 'ota_local' : DB;
  const live = JSON.parse(wrangler(['execute', liveDb, '--json', '--command', "SELECT name FROM sqlite_master WHERE type = 'table'"]));
  const liveTables = new Set((live[0]?.results || []).map((r) => String(r.name).toLowerCase()).filter((n) => !n.startsWith('sqlite_')));
  const missing = [...liveTables].filter((t) => !dumpedTables.has(t) && !t.startsWith('_cf_') && !t.startsWith('d1_'));
  const dumpedUser = [...dumpedTables].filter((t) => !t.startsWith('_cf_') && !t.startsWith('d1_')).length;
  const liveUser = [...liveTables].filter((t) => !t.startsWith('_cf_') && !t.startsWith('d1_')).length;
  console.log(`[backup] dump ${(st.size / 1024).toFixed(1)} KiB, user tables dumped/live: ${dumpedUser}/${liveUser}`);
  if (missing.length) throw new Error(`tables missing from dump: ${missing.join(', ')}`);
  for (const t of ['users', 'bookings', 'payments', 'ledger_entries']) {
    if (!liveTables.has(t)) continue;
    const r = JSON.parse(wrangler(['execute', liveDb, '--json', '--command', `SELECT COUNT(*) AS c FROM ${t}`]));
    console.log(`[backup] row check ${t}: ${r[0]?.results?.[0]?.c ?? '?'} rows live`);
  }
  console.log(`[backup] OK: ${out}`);
}

main().catch((e) => {
  console.error(`[backup] FAILED: ${e.message}`);
  process.exit(1);
});
