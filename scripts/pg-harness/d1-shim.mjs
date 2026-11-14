// scripts/pg-harness/d1-shim.mjs
// TG-09: D1Database-compatible adapter over node-postgres for the LOCAL proof
// only (never bundled into the worker). Translates the exact SQLite subset
// the worker uses (see TG-09 inventory) into Postgres: ? -> $n, INSERT OR
// IGNORE -> ON CONFLICT DO NOTHING, GLOB hex -> ~ regex, CURRENT_TIMESTAMP
// -> gft_now() (TEXT ISO, SQLite semantics), rowid -> ctid, LIKE -> ILIKE.
// Unknown GLOB patterns fail loud. strftime() runs as a PG UDF (compat.sql).

// Split SQL into code vs verbatim (strings/comments) regions. Only code is
// rewritten; '?' or keywords inside literals pass through untouched.
export function splitRegions(sql) {
  const regions = [];
  let cur = '';
  let curCode = true;
  const flush = () => { if (cur) regions.push({ text: cur, code: curCode }); cur = ''; };
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next2 = sql.slice(i, i + 2);
    if (curCode && c === "'") {
      flush(); curCode = false; cur += c; i++;
      while (i < n) {
        cur += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { cur += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      flush(); curCode = true; continue;
    }
    if (curCode && c === '"') {
      flush(); curCode = false; cur += c; i++;
      while (i < n) {
        cur += sql[i];
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { cur += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      flush(); curCode = true; continue;
    }
    if (curCode && (next2 === '--' || next2 === '/*')) {
      flush(); curCode = false;
      if (next2 === '--') {
        while (i < n && sql[i] !== '\n') cur += sql[i++];
      } else {
        while (i < n && sql.slice(i, i + 2) !== '*/') cur += sql[i++];
        cur += sql.slice(i, i + 2); i += 2;
      }
      flush(); curCode = true; continue;
    }
    cur += c; i++;
  }
  flush();
  return regions;
}

export function translateSQL(sql) {
  const regions = splitRegions(sql);
  // GLOB spans code + literal regions (`GLOB '[0-9a-f]*'`): rewrite the pair.
  for (let k = 0; k < regions.length - 1; k++) {
    const a = regions[k];
    const b = regions[k + 1];
    if (a.code && !b.code && /\bGLOB\s*$/.test(a.text)) {
      if (b.text !== "'[0-9a-f]*'") throw new Error(`unsupported GLOB pattern: ${b.text.slice(0, 60)}`);
      a.text = a.text.replace(/\bGLOB\s*$/, '~ ');
      b.text = "'^[0-9a-f]*$'";
    }
  }
  let seq = 0;
  let ignoreConflict = false;
  const out = regions.map((r) => {
    if (!r.code) return r.text;
    let t = r.text;
    if (/^\s*insert\s+or\s+ignore\s+into\b/i.test(t)) {
      t = t.replace(/^\s*insert\s+or\s+ignore\s+into\b/i, (m) => m.replace(/or\s+ignore\s+/i, ''));
      ignoreConflict = true;
    }
    if (/\bGLOB\b/i.test(t)) throw new Error(`malformed GLOB in: ${sql.slice(0, 120)}`);
    t = t.replace(/\bCURRENT_TIMESTAMP\b/gi, 'gft_now()');
    t = t.replace(/\browid\b/gi, 'ctid');
    t = t.replace(/\bLIKE\b/gi, 'ILIKE');
    t = t.replace(/\?/g, () => `$${++seq}`);
    return t;
  }).join('');
  if (ignoreConflict) return out.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING';
  return out;
}

// Minimal D1Database shape over a pg Pool. first()/all()/run()/batch() only:
// the worker uses nothing else (verified TG-09 inventory — no raw/exec).
export function createD1Shim(pool) {
  const exec = (sql, args) => pool.query(translateSQL(sql), args);
  const bound = (sql, args) => ({
    sql,
    args,
    first: async (column) => {
      const r = await exec(sql, args);
      const row = r.rows[0] ?? null;
      if (row === null) return null;
      return column === undefined ? row : row[column] ?? null;
    },
    all: async () => ({ results: (await exec(sql, args)).rows }),
    run: async () => ({ success: true, meta: { changes: (await exec(sql, args)).rowCount ?? 0 } }),
    // Translated form for batch transactions (same statement, one client).
    _pg: () => ({ text: translateSQL(sql), params: args }),
  });
  return {
    // Like D1, first/all/run work with or without an explicit bind(), and
    // batch accepts both bound and unbound prepares.
    prepare: (sql) => {
      const direct = bound(sql, []);
      return { bind: (...args) => bound(sql, args), first: direct.first, all: direct.all, run: direct.run, _pg: direct._pg };
    },
    // Atomic like D1: one client, all-or-nothing. The worker's catch paths
    // (own-winner replay checks) depend on failed batches leaving no rows.
    batch: async (stmts) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = [];
        for (const s of stmts) {
          const { text, params } = s._pg();
          const r = await client.query(text, params);
          out.push({ success: true, meta: { changes: r.rowCount ?? 0 } });
        }
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
