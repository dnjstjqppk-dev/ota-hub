#!/usr/bin/env node
// scripts/pg-harness/extract-dml.mjs
// TG-09: collect migration DML (INSERT/UPDATE/DELETE) into one PG seed file.
// DDL is skipped (schema.sql already builds the final shape); DML is
// translated with the tested d1-shim translator. OR IGNORE/OR REPLACE become
// plain writes + ON CONFLICT DO NOTHING — identical on a fresh build.
// Usage: node scripts/pg-harness/extract-dml.mjs  (writes seed-data.sql)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitRegions, translateSQL } from './d1-shim.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', '..', 'worker', 'migrations');

// Quote-aware statement split (semicolons inside literals don't count).
function splitStatements(sql) {
  const regions = splitRegions(sql);
  const stmts = [];
  let cur = '';
  for (const r of regions) {
    if (!r.code) { cur += r.text; continue; }
    const parts = r.text.split(';');
    for (let i = 0; i < parts.length; i++) {
      cur += parts[i];
      if (i < parts.length - 1) {
        if (cur.trim()) stmts.push(cur.trim());
        cur = '';
      }
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
const out = [];
const counts = { insert: 0, update: 0, delete: 0, skipped: 0 };
for (const f of files) {
  const sql = readFileSync(join(migDir, f), 'utf8');
  for (const s of splitStatements(sql)) {
    const head = s.replace(/^(--[^\n]*\n|\s*)+/, '').trim().split(/\s+/)[0].toUpperCase();
    if (/^(INSERT|UPDATE|DELETE)$/.test(head)) {
      // Rebuild scaffolding (0034 *_new tables): empty on fresh builds, and the
      // final schema already carries the rebuilt shape. Skip loudly, not silently.
      if (/_new\b/.test(s)) {
        console.log(`skip rebuild scaffolding in ${f}: ${s.trim().split('\n')[0].slice(0, 80)}`);
        counts.skipped++;
        continue;
      }
      // Fresh build: OR REPLACE/OR IGNORE never conflict — plain writes.
      // (translateSQL would append ON CONFLICT DO NOTHING for IGNORE, which is
      // equally correct; plain form keeps the seed readable.) Code regions only.
      let ported = splitRegions(s).map((r) => r.code
        ? r.text.replace(/INSERT\s+OR\s+REPLACE\s+INTO\b/gi, 'INSERT INTO')
          .replace(/INSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO')
        : r.text).join('');
      // 0033 one-off: SQLite json_set on a TEXT JSON doc -> jsonb round-trip.
      // Runtime code uses no json_* functions (verified), so this stays here.
      ported = ported.replace(
        /json_set\(\s*(details_json)\s*,\s*'\$\.gallery'\s*,\s*json\('\[\]'\)\s*\)/g,
        "(jsonb_set($1::jsonb, '{gallery}', '[]'::jsonb)::text)",
      );
      out.push(`-- ${f}\n${translateSQL(ported)};`);
      counts[head.toLowerCase()]++;
    } else {
      counts.skipped++;
    }
  }
}
const header = `-- TG-09 migration DML seed (generated — do not hand-edit).
-- Regenerate: node scripts/pg-harness/extract-dml.mjs
`;
writeFileSync(join(here, 'seed-data.sql'), header + '\nBEGIN;\n\n' + out.join('\n\n') + '\n\nCOMMIT;\n');
console.log(`dml: ${JSON.stringify(counts)} -> seed-data.sql`);
