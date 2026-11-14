#!/usr/bin/env node
// scripts/pg-harness/server.mjs
// TG-09: serve the REAL worker (worker/index.ts) over HTTP with Postgres
// behind it (D1 shim), static files for ASSETS, and a scratch dir for R2.
// The E2E suite runs unmodified against this server (BASE=... + E2E_PG_URL).
// Usage: E2E_PG_URL=... node scripts/pg-harness/server.mjs [port]
// Env parity with CI/local E2E: sandbox payments, simulator suppliers, draft
// entity, ephemeral JWT + PII keys, 127.0.0.1 ingest allowlist.
import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createD1Shim } from './d1-shim.mjs';
import { d1Ephemeral, withFallback } from '../../worker/src/lib/ephemeral.ts';
import { redisEphemeral } from '../redis-store/redis-ephemeral.mjs';
import worker from '../../worker/index.ts';

pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => parseFloat(v));

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const ASSETS_ROOT = join(root, 'frontend-user', '.output', 'public');
const UPLOADS_ROOT = process.env.E2E_UPLOADS_DIR || 'C:\\tmp\\pg-uploads';
rmSync(UPLOADS_ROOT, { recursive: true, force: true });
mkdirSync(UPLOADS_ROOT, { recursive: true });

// Single connection: advisory inventory locks are session-level, so the proof
// pool must not multiplex. statement_timeout fails loud instead of hanging.
const pool = new pg.Pool({
  connectionString: process.env.E2E_PG_URL || 'postgres://postgres:LocalPg2026%21x@127.0.0.1:55433/ota_pg',
  max: 1,
  statement_timeout: 15000,
});

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};

function safeJoin(rootDir, requestPath) {
  const p = normalize(join(rootDir, decodeURIComponent(requestPath.split('?')[0])));
  if (p !== rootDir && !p.startsWith(rootDir + sep)) return null;
  return p;
}

const ASSETS = {
  async fetch(req) {
    const url = new URL(req.url);
    let file = safeJoin(ASSETS_ROOT, url.pathname);
    if (!file) return new Response('forbidden', { status: 403 });
    try {
      if (statSync(file).isDirectory()) {
        const idx = join(file, 'index.html');
        if (!existsSync(idx)) return new Response('not found', { status: 404 });
        file = idx;
      }
    } catch {
      return new Response('not found', { status: 404 });
    }
    if (!existsSync(file)) return new Response('not found', { status: 404 });
    const body = readFileSync(file);
    const headers = { 'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream' };
    return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers });
  },
};

const UPLOADS = {
  async put(key, data) {
    const file = safeJoin(UPLOADS_ROOT, '/' + String(key));
    if (!file) throw new Error('bad key');
    mkdirSync(dirname(file), { recursive: true });
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data instanceof ArrayBuffer ? data : await data.arrayBuffer());
    writeFileSync(file, buf);
  },
  async get(key) {
    const file = safeJoin(UPLOADS_ROOT, '/' + String(key));
    if (!file || !existsSync(file)) return null;
    return { body: readFileSync(file) };
  },
};

const shim = createD1Shim(pool);
// TG-10: E2E_REDIS_URL injects Redis-first ephemeral state (D1 fallback);
// unset keeps the production-default D1 path. Both run the full suite.
let ephemeralStore = d1Ephemeral(shim);
if (process.env.E2E_REDIS_URL) {
  try {
    ephemeralStore = withFallback(await redisEphemeral(process.env.E2E_REDIS_URL), d1Ephemeral(shim));
    console.log('ephemeral store: redis (d1 fallback)');
  } catch {
    console.log('ephemeral store: redis unreachable at boot, d1 only (fallback proof mode)');
  }
} else {
  console.log('ephemeral store: d1');
}

const env = {
  DB: shim,
  EPHEMERAL: ephemeralStore,
  ASSETS,
  UPLOADS,
  APP_ENV: 'test',
  DB_DIALECT: 'pg',
  JWT_SECRET: randomBytes(32).toString('base64'),
  PII_ENC_KEY: randomBytes(32).toString('base64'),
  PAYMENT_PROVIDER: 'sandbox',
  ALLOW_SIMULATED_SUPPLIERS: 'true',
  ALLOW_DRAFT_ENTITY: 'true',
  ALLOWED_ORIGINS: '*',
  PUBLIC_SITE_URL: 'http://127.0.0.1:8798',
  PARTNER_SITE_URL: 'http://127.0.0.1:8798/partner/',
  INGEST_ALLOW_HOSTS: '127.0.0.1',
};

const port = parseInt(process.argv[2] || '8798', 10);
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = `http://127.0.0.1:${port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else headers.set(k, v);
    }
    headers.delete('content-length');
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method || 'GET') && body.length) init.body = body;
    const request = new Request(url, init);
    const ctx = { waitUntil: (p) => void Promise.resolve(p).catch(() => undefined), passThroughOnException: () => undefined };
    const out = await worker.fetch(request, env, ctx);
    const outHeaders = {};
    out.headers.forEach((v, k) => { outHeaders[k] = v; });
    // Set-Cookie must not collapse: forEach joins repeats with ", " but each
    // jar needs its own header line (node accepts an array).
    if (typeof out.headers.getSetCookie === 'function') {
      const jars = out.headers.getSetCookie();
      if (jars.length) outHeaders['set-cookie'] = jars;
    }
    delete outHeaders['content-encoding'];
    delete outHeaders['content-length'];
    const outBody = Buffer.from(await out.arrayBuffer());
    res.writeHead(out.status, outHeaders);
    res.end(outBody);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`harness error: ${e && e.message}`);
  }
});

server.listen(port, '127.0.0.1', () => console.log(`pg harness on http://127.0.0.1:${port}`));
