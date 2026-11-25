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
 *   BASE_URL / USER_URL / ADMIN_URL / PARTNER_URL override the portal roots.
 *   TG-15: the user portal rides ota-user (SSR+ISR); the hub root is an API
 *   landing and the hub keeps the /admin/ + /partner/ fallbacks.
 *
 *   M2: SITE_URL (default https://getfortrip.com) adds the real-domain
 *   checks (apex root, www 301, admin/partner roots, apex health + sitemap).
 *   An empty SITE_URL ('') skips them (staging has no custom domain); an
 *   empty USER_URL ('') skips the user-portal checks the same way.
 */

const HUB = (process.env.BASE_URL || 'https://ota-hub.dnjstjq0824.workers.dev').replace(/\/+$/, '');
const USER = process.env.USER_URL === '' ? '' : (process.env.USER_URL || 'https://ota-user.dnjstjq0824.workers.dev').replace(/\/+$/, '');
const ADMIN = (process.env.ADMIN_URL || 'https://ota-admin.dnjstjq0824.workers.dev').replace(/\/+$/, '');
const PARTNER = (process.env.PARTNER_URL || 'https://ota-partner.dnjstjq0824.workers.dev').replace(/\/+$/, '');
const SITE = process.env.SITE_URL === '' ? '' : (process.env.SITE_URL || 'https://getfortrip.com').replace(/\/+$/, '');

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

function skip(name) {
  console.log(`[SMOKE] ${name}... SKIP`);
}

async function get(url, { allow = [200], redirect } = {}) {
  const res = await fetch(url, redirect ? { redirect } : undefined);
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

  const roots = [['hub root (API landing)', HUB]];
  if (USER) roots.push(['user root (SSR)', USER]);
  else skip('user root (SSR) serves HTTP 200 (USER_URL empty)');
  roots.push(['admin root', ADMIN], ['partner root', PARTNER], ['hub /admin/ fallback', `${HUB}/admin/`], ['hub /partner/ fallback', `${HUB}/partner/`]);
  for (const [label, url] of roots) {
    await check(`${label} serves HTTP 200`, async () => { await get(url); });
  }

  if (USER) {
    await check('user catalog renders on demand (ISR)', async () => {
      const html = await (await get(`${USER}/hotels`)).text();
      if (!html.includes('getfortrip')) throw new Error('SSR shell missing brand marker');
    });
  } else {
    skip('user catalog renders on demand (ISR) (USER_URL empty)');
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

  // M2: real-domain checks (read-only GET, no redirect following).
  if (!SITE) {
    skip('site domain checks (apex, www 301, admin, partner, health, sitemap) (SITE_URL empty)');
  } else {
    const siteHost = SITE.replace(/^https?:\/\//, '');
    console.log(`Smoke-probing site ${SITE}`);
    await check('apex root serves HTTP 200 HTML', async () => {
      const res = await get(SITE, { redirect: 'manual' });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) throw new Error(`apex root content-type is ${ct}, want text/html`);
    });
    await check('www keeps path+query and 301s to apex', async () => {
      const res = await get(`https://www.${siteHost}/hotels?probe=1`, { allow: [301], redirect: 'manual' });
      const loc = res.headers.get('location') || '';
      if (loc !== `${SITE}/hotels?probe=1`) throw new Error(`Location is ${loc}, want ${SITE}/hotels?probe=1`);
    });
    for (const [label, url] of [['admin', `https://admin.${siteHost}`], ['partner', `https://partner.${siteHost}`]]) {
      await check(`${label} domain root serves HTTP 200`, async () => { await get(url, { redirect: 'manual' }); });
    }
    await check('apex /api/v1/health serves HTTP 200 (hub zone route)', async () => {
      await get(`${SITE}/api/v1/health`, { redirect: 'manual' });
    });
    await check('apex /sitemap.xml renders the catalog index (hub zone route)', async () => {
      const xml = await (await get(`${SITE}/sitemap.xml`, { redirect: 'manual' })).text();
      if (!xml.includes('<urlset')) throw new Error('missing <urlset> payload');
    });
  }

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
