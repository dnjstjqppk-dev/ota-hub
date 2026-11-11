// scripts/smoke-production.js
/**
 * Post-deploy smoke probe (#52, 6f). CI runs this right after deploy; the full
 * authenticated suite (scripts/verify-production.js) stays a manual step
 * because it needs TEST_ADMIN_PASSWORD and writes QA rows.
 *
 * Deliberately unauthenticated and read-only: a broken deploy (5xx, missing
 * DB, missing assets, dead routes) fails here with exit 1, while a healthy
 * one passes in seconds without touching any data.
 *
 *   BASE_URL / ADMIN_URL / PARTNER_URL override the three portal roots.
 */

const HUB = (process.env.BASE_URL || 'https://ota-hub.dnjstjqppk.workers.dev').replace(/\/+$/, '');
const ADMIN = (process.env.ADMIN_URL || 'https://ota-admin.dnjstjqppk.workers.dev').replace(/\/+$/, '');
const PARTNER = (process.env.PARTNER_URL || 'https://ota-partner.dnjstjqppk.workers.dev').replace(/\/+$/, '');

let failed = 0;

async function check(name, fn) {
  process.stdout.write(`[SMOKE] ${name}... `);
  try {
    await fn();
    console.log('PASS');
  } catch (err) {
    failed++;
    console.log('FAIL');
    console.error(`   -> ${err.message}`);
  }
}

async function get(url, { allow = [200] } = {}) {
  const res = await fetch(url);
  if (!allow.includes(res.status)) throw new Error(`${url} -> HTTP ${res.status}, want ${allow.join('/')}`);
  return res;
}

async function main() {
  console.log(`Smoke-probing hub ${HUB}`);

  await check('GET /api/v1/health reports a live database', async () => {
    const res = await get(`${HUB}/api/v1/health`);
    const data = await res.json();
    if (data.checks?.database !== true) throw new Error(`database not live: ${JSON.stringify(data.checks)}`);
    if (data.checks?.jwtSecret !== true) throw new Error('jwtSecret missing: auth cannot work');
  });

  for (const [label, url] of [['hub root', HUB], ['admin root', ADMIN], ['partner root', PARTNER], ['hub /admin/ fallback', `${HUB}/admin/`], ['hub /partner/ fallback', `${HUB}/partner/`]]) {
    await check(`${label} serves HTTP 200`, async () => { await get(url); });
  }

  await check('GET /sitemap.xml renders the catalog index', async () => {
    const xml = await (await get(`${HUB}/sitemap.xml`)).text();
    if (!xml.includes('<urlset')) throw new Error('missing <urlset> payload');
  });

  await check('GET /api/v1/feature-flags carries enforced keys', async () => {
    const data = await (await get(`${HUB}/api/v1/feature-flags`)).json();
    for (const k of ['FLIGHT_BOOKING', 'HOTEL_BOOKING', 'URL_PRODUCT_INGESTION']) {
      if (!(k in (data.flags || {}))) throw new Error(`missing flag key ${k}`);
    }
  });

  await check('GET /api/v1/payments/config answers', async () => {
    const data = await (await get(`${HUB}/api/v1/payments/config`)).json();
    if (data.success !== true) throw new Error(JSON.stringify(data));
  });

  await check('GET /api/v1/esim/plans answers', async () => {
    const data = await (await get(`${HUB}/api/v1/esim/plans`)).json();
    if (data.success !== true || !Array.isArray(data.plans) || data.plans.length === 0) throw new Error('empty plan list');
  });

  await check('GET /api/v1/suppliers/registry stays non-public (404)', async () => {
    await get(`${HUB}/api/v1/suppliers/registry`, { allow: [404] });
  });

  if (failed > 0) {
    console.error(`\nSMOKE RESULT: ${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\nSMOKE RESULT: all checks passed');
}

main().catch((err) => {
  console.error('Fatal smoke error:', err);
  process.exit(1);
});
