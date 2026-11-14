#!/usr/bin/env node
// scripts/pg-harness/query.mjs
// TG-09: sync-query helper for the E2E suite's sql() PG branch. Reads one SQL
// statement on stdin, runs it against Postgres, prints {rows} as JSON.
// Applies the E2E-only rewrites (sqlite_master, WITH-first, OR REPLACE)
// then the shared d1-shim translator. int8/numeric parse to JS numbers so
// COUNT/SUM assertions match D1 value shapes.
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { translateSQL } from './d1-shim.mjs';

pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export function rewriteE2E(q) {
  let out = q;
  out = out.replace(
    /FROM sqlite_master WHERE type = 'index' AND name = '([^']+)'/,
    "FROM pg_indexes WHERE schemaname = 'public' AND indexname = '$1'",
  );
  if (/^INSERT\s+INTO\s+\S+\s*\([^)]*\)\s*WITH\s+RECURSIVE\b/i.test(out)) {
    const idx = out.lastIndexOf(') SELECT ');
    if (idx < 0) throw new Error(`unrecognized WITH shape: ${out.slice(0, 120)}`);
    const head = out.slice(0, idx + 1);
    const select = out.slice(idx + 2);
    const m = head.match(/^(INSERT\s+INTO\s+\S+\s*\([^)]*\))\s*(WITH\s+RECURSIVE\b[\s\S]*)$/i);
    if (!m) throw new Error(`unrecognized WITH shape: ${out.slice(0, 120)}`);
    out = `${m[2]} ${m[1]} ${select}`;
  }
  const rep = out.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\S+)\s*\(([^)]*)\)/i);
  if (rep) {
    if (rep[1] !== 'affiliate_partners_config') throw new Error(`OR REPLACE only ported for affiliate_partners_config: ${rep[1]}`);
    const list = rep[2].split(',').map((c) => c.trim()).filter(Boolean);
    const set = list.slice(1).map((c) => `${c}=excluded.${c}`).join(',');
    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO\b/i, 'INSERT INTO').replace(/;\s*$/, '')
      + ` ON CONFLICT(${list[0]}) DO UPDATE SET ${set}`;
  }
  return out;
}

async function main() {
  let sql = '';
  for await (const chunk of process.stdin) sql += chunk;
  sql = sql.trim();
  if (!sql) throw new Error('query.mjs: empty input');
  const pool = new pg.Pool({ connectionString: process.env.E2E_PG_URL || 'postgres://postgres:LocalPg2026%21x@127.0.0.1:55433/ota_pg' });
  try {
    const r = await pool.query(translateSQL(rewriteE2E(sql)));
    const rows = Array.isArray(r) ? r[r.length - 1].rows ?? [] : r.rows ?? [];
    process.stdout.write(JSON.stringify({ rows }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
