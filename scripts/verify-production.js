// scripts/verify-production.js
/**
 * getfortrip Hardened Production Live E2E & Security Verification Suite
 * ==============================================================================
 * Tests live endpoints against https://ota-hub.dnjstjqppk.workers.dev
 * Verifies P0~P3 Security Enforcements:
 *  - P0-01: Admin Backdoor Elimination (Default password rejected with 401)
 *  - P0-02: Cryptographic Secrets & Token Validation (Forged tokens rejected)
 *  - P0-03: PBKDF2 Password Hashing & Strict Policy (Terms consent enforced)
 *  - P0-04: Payment Spoofing Rejection (Direct client /pay rejected with 410/403)
 *  - P0-05: Webhook HMAC Strictness (Replay, fake sigs, unconfigured partner rejected)
 *  - P0-06: IDOR Protection (Cross-user booking access rejected with 403)
 *  - P0-07: Admin RBAC & Audit Logging (Non-admin access rejected with 403)
 *  - P0-08: Server-Side Pricing & Zero-Tampering Defense
 * ==============================================================================
 */

const crypto = require('crypto');

const PROD_HOST = 'ota-hub.dnjstjqppk.workers.dev';
// #114: the suite used to default to PRODUCTION with no confirmation. There
// is no staging worker, so the safe default is the local dev server; reaching
// production requires naming it AND acknowledging it (env or TTY prompt).
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8799';

// #48/#53 (6f): this suite used to count skipped tests as passes (fake 41/41)
// and mutated production (flag toggles, draft publishes, product rows).
//   - Skips now FAIL the gate unless VERIFY_ALLOW_SKIP=1 names them accepted.
//   - Mutating tests (T34/T36/T40) run read-only variants against production
//     by default; full mutation runs on non-prod targets, or on production
//     only with VERIFY_ALLOW_MUTATION=1. T41's live settle stays separately
//     gated behind VERIFY_LIVE_SETTLE=1 (real money).
const isProdTarget = [PROD_HOST].some((h) => BASE_URL.includes(h));
const ALLOW_MUTATION = process.env.VERIFY_ALLOW_MUTATION === '1' || (!isProdTarget && process.env.VERIFY_ALLOW_MUTATION !== '0');
const ALLOW_SKIP = process.env.VERIFY_ALLOW_SKIP === '1';

async function confirmProdTarget() {
  if (!isProdTarget) return;
  if (process.env.VERIFY_ACK_PROD === '1') {
    console.log('Production target explicitly acknowledged via VERIFY_ACK_PROD=1.\n');
    return;
  }
  if (!process.stdin.isTTY) {
    console.error(`Refusing to run against PRODUCTION (${BASE_URL}) without acknowledgement.`);
    console.error('Re-run with VERIFY_ACK_PROD=1, or point BASE_URL at a dev server.');
    process.exit(2);
  }
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`Type PROCEED to run 47 live tests against PRODUCTION (${BASE_URL}): `, resolve));
  rl.close();
  if (String(answer).trim() !== 'PROCEED') {
    console.error('Aborted: production run not confirmed.');
    process.exit(2);
  }
  console.log('');
}

async function runVerificationSuite() {
  await confirmProdTarget();
  console.log('==============================================================================');
  console.log('🚀 Running Production Live Security & E2E Verification Suite against:');
  console.log(`   ${BASE_URL}`);
  console.log('==============================================================================\n');

  let passed = 0;
  let total = 0;
  let skipped = 0;
  const skipReasons = [];
  // #48: a skip is recorded, never a silent pass (see the exit gate below).
  function skip(reason) {
    skipped++;
    skipReasons.push(reason);
    console.log(`(SKIPPED: ${reason})`);
  }

  async function test(name, fn) {
    total++;
    const testNum = String(total).padStart(2, '0');
    process.stdout.write(`[TEST ${testNum}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error(`   -> Assertion Failed: ${err.message}`);
    }
  }

  // State shared across tests
  const rand = Math.floor(Math.random() * 90000) + 10000;
  const userAEmail = `explorer_a_${rand}@getfortrip.com`;
  const userBEmail = `explorer_b_${rand}@getfortrip.com`;
  const strongPass = 'SecureP@ssw0rd2026!';
  let userAToken = '';
  let userBToken = '';
  let adminToken = '';
  let userABookingId = '';

  // ---------------------------------------------------------------------------
  // 1. HEALTH & SECURITY STATUS
  // ---------------------------------------------------------------------------
  await test('GET /api/v1/health: D1 APAC DB & Security Engine Status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'healthy' && data.status !== 'ok') throw new Error(`Status is not healthy: ${data.status}`);
    if (data.checks && !data.checks.database) throw new Error(`DB disconnected: ${JSON.stringify(data.checks)}`);
    // #162: the public shape carries liveness only — provider wiring stays gated.
    for (const f of ['paymentProvider', 'emailProvider', 'errorReporting', 'sellerEntityActive', 'piiEncryptionKey', 'cron']) {
      if (data.checks && data.checks[f] !== undefined) throw new Error(`Public health leaks ${f}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. P0-01: ADMIN BACKDOOR ELIMINATION
  // ---------------------------------------------------------------------------
  await test('P0-01 Security: Legacy/Weak Admin Password MUST BE REJECTED', async () => {
    const weakPass = process.env.TEST_WEAK_PASSWORD || 'invalid_default_backdoor_attempt';
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@getfortrip.com', password: weakPass }),
    });
    if (res.status !== 401) {
      throw new Error(`CRITICAL SECURITY FAILURE: Backdoor password accepted with HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.error) throw new Error('Expected error message on backdoor rejection');
  });

  // ---------------------------------------------------------------------------
  // 3. P0-02: FORGED / INVALID JWT TOKEN REJECTION
  // ---------------------------------------------------------------------------
  await test('P0-02 Security: Forged & Invalid JWT Tokens MUST BE REJECTED (401)', async () => {
    const fakeHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const fakePayload = Buffer.from(JSON.stringify({ id: 'usr-fake', email: 'attacker@evil.com', role: 'ADMIN' })).toString('base64url');
    const forgedToken = `${fakeHeader}.${fakePayload}.invalidsignature12345`;
    const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    if (res.status !== 401) {
      throw new Error(`CRITICAL: Forged token returned HTTP ${res.status} instead of 401`);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. P0-07: UNAUTHENTICATED ADMIN ACCESS REJECTION
  // ---------------------------------------------------------------------------
  await test('P0-07 Security: Unauthenticated Admin Dashboard Access MUST BE REJECTED (401)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/dashboard`);
    if (res.status !== 401) {
      throw new Error(`Unauthenticated access returned HTTP ${res.status} instead of 401`);
    }
  });

  // ---------------------------------------------------------------------------
  // 5. P0-03: B2C USER A REGISTRATION (PBKDF2 + TERMS CONSENT)
  // ---------------------------------------------------------------------------
  await test('P0-03 Auth: B2C User A Registration with PBKDF2 Password', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password: strongPass,
        fullName: 'User Alpha',
        phoneNumber: '010-1111-2222',
        agreeTerms: true,
        agreePrivacy: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.token || data.user.role !== 'USER') {
      throw new Error(`Invalid register payload: ${JSON.stringify(data)}`);
    }
    userAToken = data.token;
  });

  // ---------------------------------------------------------------------------
  // 6. P0-03: WEAK PASSWORD & MISSING CONSENT POLICY ENFORCEMENT
  // ---------------------------------------------------------------------------
  await test('P0-03 Auth: Weak Passwords (no numbers / short) MUST BE REJECTED (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `weak_${rand}@getfortrip.com`,
        password: 'weak',
        fullName: 'Weak Password User',
        agreeTerms: true,
        agreePrivacy: true,
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400 for weak password, got HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. B2C USER B REGISTRATION (FOR IDOR TESTING)
  // ---------------------------------------------------------------------------
  await test('Auth: B2C User B Registration for IDOR Isolation Test', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userBEmail,
        password: strongPass,
        fullName: 'User Beta',
        phoneNumber: '010-3333-4444',
        agreeTerms: true,
        agreePrivacy: true,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    userBToken = data.token;
  });

  // ---------------------------------------------------------------------------
  // 8. P0-07: NON-ADMIN USER ACCESSING ADMIN API MUST BE FORBIDDEN (403)
  // ---------------------------------------------------------------------------
  await test('P0-07 Security: Non-Admin User Accessing Admin API MUST BE REJECTED (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/dashboard`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (res.status !== 403) {
      throw new Error(`RBAC failure: Normal user received HTTP ${res.status} instead of 403`);
    }
  });

  // ---------------------------------------------------------------------------
  // 9. P0-01 & P0-07: AUTHENTIC ADMIN LOGIN & DASHBOARD ACCESS
  // ---------------------------------------------------------------------------
  await test('P0-01 & P0-07: Authentic Admin PBKDF2 Login & Dashboard Authorized Access', async () => {
    // No fallback: a production admin password must never live in the repo (2026-11-09 audit [M]).
    const adminPass = process.env.TEST_ADMIN_PASSWORD;
    if (!adminPass) throw new Error('TEST_ADMIN_PASSWORD is not set; refusing to probe production admin login');
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@getfortrip.com',
        password: adminPass,
      }),
    });
    if (!loginRes.ok) {
      const err = await loginRes.text();
      throw new Error(`Admin login failed: ${err}`);
    }
    const loginData = await loginRes.json();
    if (loginData.user.role !== 'ADMIN') throw new Error(`Role is not ADMIN: ${loginData.user.role}`);
    adminToken = loginData.token;

    // Verify admin access
    const dashRes = await fetch(`${BASE_URL}/api/v1/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!dashRes.ok) throw new Error(`Admin dashboard failed with HTTP ${dashRes.status}`);
    const dashData = await dashRes.json();
    if (!dashData.metrics) throw new Error('Missing metrics object in admin dashboard');
  });

  // ---------------------------------------------------------------------------
  // 10. P0-08: SERVER-SIDE PRICING DEFENSE (DIRECT CLIENT PRICE REJECTED)
  // ---------------------------------------------------------------------------
  await test('P0-08 Security: Booking Without Server Quote MUST BE REJECTED (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        itemId: 'htl_seoul_01',
        totalPrice: -50000,
        currency: 'KRW',
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Direct booking without quote allowed! Received HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 11. P0-08: QUOTE SAFETY (PRODUCTION CATALOG SUPPLIER NOT YET CONTRACTED -> 409 BLOCKED)
  // ---------------------------------------------------------------------------
  await test('P0-08 Security: Production Quote Safety Guard (Uncontracted Supplier Blocked 409)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        domain: 'HOTEL',
        itemId: 'htl_seoul_01',
        unitId: 'rm_seoul_01_dlx',
        startDate: '2020-01-01', // Past date
        endDate: '2020-01-02',
        rooms: 1,
        travelers: { adults: 2 },
      }),
    });
    // rm_seoul_01_dlx is a real room, so validation passes and the only lawful
    // refusal is the uncontracted-supplier guard (2026-11-09 audit [m]).
    if (res.status !== 409) {
      throw new Error(`Uncontracted supplier quote unexpectedly allowed! Received HTTP ${res.status}`);
    }
    const guard = await res.json();
    if (guard.code !== 'NOT_DIRECTLY_BOOKABLE') {
      throw new Error(`Expected NOT_DIRECTLY_BOOKABLE, got: ${JSON.stringify(guard)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 12. PAYMENTS & CATALOG BOOKABILITY INTEGRITY GUARD
  // ---------------------------------------------------------------------------
  await test('Payment & Catalog Integrity: Production Payments Config & Bookability Guard', async () => {
    const pRes = await fetch(`${BASE_URL}/api/v1/payments/config`);
    if (!pRes.ok) throw new Error(`Payments config failed with HTTP ${pRes.status}`);
    const pData = await pRes.json();
    if (pData.success !== true) throw new Error('Payments config success flag not true');

    const futureStart = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const futureEnd = new Date(Date.now() + 16 * 86400000).toISOString().slice(0, 10);

    const qRes = await fetch(`${BASE_URL}/api/v1/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        domain: 'HOTEL',
        itemId: 'htl_seoul_01',
        unitId: 'rm_seoul_01_dlx',
        startDate: futureStart,
        endDate: futureEnd,
        rooms: 1,
        travelers: { adults: 2 },
      }),
    });
    // Safely blocked with 409 NOT_DIRECTLY_BOOKABLE in production until supplier contract is live
    if (qRes.status === 409) {
      const qErr = await qRes.json();
      if (qErr.code !== 'NOT_DIRECTLY_BOOKABLE') {
        throw new Error(`Expected NOT_DIRECTLY_BOOKABLE, got: ${JSON.stringify(qErr)}`);
      }
    } else if (!qRes.ok) {
      throw new Error(`Quote creation failed unexpectedly: HTTP ${qRes.status}`);
    } else {
      // #168: the success branch asserted nothing — a 201 must carry a priced total.
      const q = await qRes.json();
      if (!q.quote || !(q.quote.totalMinor > 0)) throw new Error(`Quote success without priced total: ${JSON.stringify(q).slice(0, 200)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 13. P0-06: IDOR DEFENSE (USER B ATTEMPTS TO ACCESS ADMIN'S BOOKING)
  // ---------------------------------------------------------------------------
  await test('P0-06 Security: IDOR Defense: User B Cannot Access Other Booking (403)', async () => {
    const targetBookingId = 'bkg-init-001';
    const res = await fetch(`${BASE_URL}/api/v1/bookings/${targetBookingId}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    if (res.status !== 403) {
      throw new Error(`CRITICAL IDOR BREACH: User B accessed other booking with HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 14. P0-06: ADMIN OR OWNER CAN ACCESS BOOKING
  // ---------------------------------------------------------------------------
  await test('P0-06 Security: Admin Authorized Access to Booking (200 OK)', async () => {
    const targetBookingId = 'bkg-init-001';
    const res = await fetch(`${BASE_URL}/api/v1/bookings/${targetBookingId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`Admin failed to access booking: HTTP ${res.status}`);
    const data = await res.json();
    if (data.booking.id !== targetBookingId) throw new Error('Returned mismatched booking ID');
  });

  // ---------------------------------------------------------------------------
  // 15. P0-04: DIRECT CLIENT PAYMENT CONFIRMATION MUST BE REJECTED (410/403)
  // ---------------------------------------------------------------------------
  await test('P0-04 Security: Direct Client /pay Auto-Confirm MUST BE REJECTED (410/403)', async () => {
    const targetBookingId = 'bkg-init-001';
    const res = await fetch(`${BASE_URL}/api/v1/bookings/${targetBookingId}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({ method: 'CREDIT_CARD' }),
    });
    if (res.status !== 403 && res.status !== 410) {
      throw new Error(`Direct confirmation allowed! Expected 410/403, got HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 16. P0-05: FAKE WEBHOOK / UNCONFIGURED PARTNER REJECTION
  // ---------------------------------------------------------------------------
  await test('P0-05 Security: Fake Backdoor Webhook Signature MUST BE REJECTED', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await fetch(`${BASE_URL}/api/v1/webhooks/postback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': ts,
        'X-Signature': 'fake_attacker_signature',
      },
      body: JSON.stringify({
        partner: 'unregistered_partner',
        order_id: `ord_${rand}`,
        click_id: 'clk_mock',
        amount: 100000,
      }),
    });
    if (res.status !== 403 && res.status !== 404) {
      throw new Error(`Backdoor signature allowed! Expected 403/404, got HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 17. P0-05: EXPIRED TIMESTAMP (REPLAY ATTACK) MUST BE REJECTED (403)
  // ---------------------------------------------------------------------------
  await test('P0-05 Security: Replay Attack (Timestamp > 300s old) MUST BE REJECTED (403)', async () => {
    const expiredTs = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
    const res = await fetch(`${BASE_URL}/api/v1/webhooks/postback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': expiredTs,
        'X-Signature': 'dummysignature',
      },
      body: JSON.stringify({
        partner: 'trip',
        order_id: `ord_${rand}`,
        click_id: 'clk_mock',
        amount: 100000,
      }),
    });
    if (res.status !== 403) {
      throw new Error(`Replay attack allowed! Expected 403, got HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 18. OUTLINK ACCESS CONTROL (UNCONFIGURED PARTNER DEFENSE)
  // ---------------------------------------------------------------------------
  await test('Affiliate: Inactive / Unregistered Partner Link Rejected (404)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/out/nonexistent_partner/item-123`, { redirect: 'manual' });
    if (res.status !== 404) {
      throw new Error(`Expected 404 for unconfigured affiliate link, got HTTP ${res.status}`);
    }
    // #175: the bare legacy form redirects to the canonical path (click counts on arrival).
    const legacy = await fetch(`${BASE_URL}/out/nonexistent_partner/item-123`, { redirect: 'manual' });
    if (legacy.status !== 308) {
      throw new Error(`Expected 308 for the legacy outlink form, got HTTP ${legacy.status}`);
    }
    if (!String(legacy.headers.get('location') || '').includes('/api/v1/out/nonexistent_partner/item-123')) {
      throw new Error(`Legacy outlink redirects to the wrong place: ${legacy.headers.get('location')}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 19. IDEMPOTENCY HEADER ENFORCEMENT
  // ---------------------------------------------------------------------------
  await test('Booking Engine: Missing Idempotency Key MUST BE REJECTED (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        quoteId: 'invalid_quote_id',
        contact: { name: 'User Alpha', email: userAEmail, phone: '010-1111-2222' },
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Missing Idempotency-Key accepted! Expected 400, got HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 20. SITEMAP SEO GENERATION
  // ---------------------------------------------------------------------------
  await test('SEO & Discovery: Dynamic /sitemap.xml Generated with Catalog Entities', async () => {
    const res = await fetch(`${BASE_URL}/sitemap.xml`);
    if (!res.ok) throw new Error(`Sitemap request failed: HTTP ${res.status}`);
    const xml = await res.text();
    if (!xml.includes('<urlset') || !xml.includes('https://getfortrip.com/hotels/detail/')) {
      throw new Error(`Sitemap missing essential catalog entries`);
    }
  });

  // ---------------------------------------------------------------------------
  // 21. STATIC ASSETS & ADMIN SPA ROUTING
  // ---------------------------------------------------------------------------
  await test('SPA & Routing: Admin SPA (/admin/) & Nuxt Register (/register/) Served (200)', async () => {
    const adminRes = await fetch(`${BASE_URL}/admin/`);
    if (adminRes.status !== 200) throw new Error(`Admin SPA returned HTTP ${adminRes.status}`);
    const regRes = await fetch(`${BASE_URL}/register/`);
    if (regRes.status !== 200) throw new Error(`Register route returned HTTP ${regRes.status}`);
  });

  // ---------------------------------------------------------------------------
  // 22. SECURITY HEADERS VERIFICATION
  // ---------------------------------------------------------------------------
  await test('Infrastructure: Security Headers (HSTS, nosniff, SAMEORIGIN, strict-origin)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    const hsts = res.headers.get('strict-transport-security');
    const nosniff = res.headers.get('x-content-type-options');
    const frame = res.headers.get('x-frame-options');
    const referrer = res.headers.get('referrer-policy');
    if (!hsts || !nosniff || !frame || !referrer) {
      throw new Error(`Missing security headers: HSTS=${hsts}, nosniff=${nosniff}, frame=${frame}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 23. TRIP-STYLE SEARCH AUTOCOMPLETE / SUGGEST
  // ---------------------------------------------------------------------------
  await test("Search Autocomplete: GET /api/v1/search/suggest?q=도쿄 returns rich suggestions", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/search/suggest?q=${encodeURIComponent('도쿄')}&domain=hotels`);
    if (!res.ok) throw new Error(`Search suggest failed with HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      throw new Error(`Expected non-empty suggestion list: ${JSON.stringify(json)}`);
    }
    const hasTokyo = json.data.some(d => d.title.includes('도쿄'));
    if (!hasTokyo) throw new Error(`Expected at least one Tokyo match in suggestions: ${JSON.stringify(json.data)}`);
  });

  // ---------------------------------------------------------------------------
  // 24. MASTER CATALOG QUERIES WITH MULTI-DIMENSIONAL FILTERS
  // ---------------------------------------------------------------------------
  await test("Catalog Queries: GET /api/v1/hotels?city=서울 & /api/v1/flights return D1 items", async () => {
    const hRes = await fetch(`${BASE_URL}/api/v1/hotels?city=${encodeURIComponent('서울')}`);
    if (!hRes.ok) throw new Error(`Hotels query failed with HTTP ${hRes.status}`);
    const hJson = await hRes.json();
    if (!hJson.success || !Array.isArray(hJson.data) || hJson.data.length === 0) {
      throw new Error(`Expected hotel catalog results: ${JSON.stringify(hJson)}`);
    }

    const fRes = await fetch(`${BASE_URL}/api/v1/flights`);
    if (!fRes.ok) throw new Error(`Flights query failed with HTTP ${fRes.status}`);
    const fJson = await fRes.json();
    if (!fJson.success || !Array.isArray(fJson.data) || fJson.data.length === 0) {
      throw new Error(`Expected flight catalog results: ${JSON.stringify(fJson)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 25. CROSS-DOMAIN AUTOCOMPLETE (CARS, TRAINS, PACKAGES)
  // ---------------------------------------------------------------------------
  await test("Cross-Domain Autocomplete: Suggest across cars, trains, and packages", async () => {
    const carRes = await fetch(`${BASE_URL}/api/v1/search/suggest?q=${encodeURIComponent('제주')}&domain=cars`);
    if (!carRes.ok) throw new Error(`Car suggest failed: HTTP ${carRes.status}`);
    const carJson = await carRes.json();
    if (!carJson.success || !Array.isArray(carJson.data) || carJson.data.length === 0) {
      throw new Error(`Expected car suggestions for 제주: ${JSON.stringify(carJson)}`);
    }

    const trainRes = await fetch(`${BASE_URL}/api/v1/search/suggest?q=${encodeURIComponent('서울')}&domain=trains`);
    if (!trainRes.ok) throw new Error(`Train suggest failed: HTTP ${trainRes.status}`);
    const trainJson = await trainRes.json();
    if (!trainJson.success || !Array.isArray(trainJson.data) || trainJson.data.length === 0) {
      throw new Error(`Expected train suggestions for 서울: ${JSON.stringify(trainJson)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 26. 7-DOMAIN CATALOG API INTEGRITY CHECK
  // ---------------------------------------------------------------------------
  await test("Trip Category Endpoints: /hotels, /flights, /trains, /cars, /transfers, /activities, /packages", async () => {
    const endpoints = ['hotels', 'flights', 'trains', 'cars', 'transfers', 'activities', 'packages'];
    for (const ep of endpoints) {
      const res = await fetch(`${BASE_URL}/api/v1/${ep}`);
      if (!res.ok) throw new Error(`Endpoint /api/v1/${ep} failed with HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) {
        throw new Error(`Endpoint /api/v1/${ep} returned invalid data format: ${JSON.stringify(json)}`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 27. 3-PORTAL INDEPENDENT URL & BACKWARD COMPATIBILITY VERIFICATION
  // ---------------------------------------------------------------------------
  await test("3-Portal Architecture: User, Admin, Partner independent URLs & Hub paths return HTTP 200", async () => {
    // Portal roots derive from env (BASE_URL for hub, *_URL for the consoles) so the
    // suite can target staging as well as production (2026-11-09 audit [m]).
    const hub = (process.env.BASE_URL || 'https://ota-hub.dnjstjqppk.workers.dev').replace(/\/+$/, '');
    const adminRoot = (process.env.ADMIN_URL || 'https://ota-admin.dnjstjqppk.workers.dev').replace(/\/+$/, '');
    const partnerRoot = (process.env.PARTNER_URL || 'https://ota-partner.dnjstjqppk.workers.dev').replace(/\/+$/, '');
    for (const [label, url] of [['User portal', hub], ['Admin portal', adminRoot], ['Partner portal', partnerRoot], ['Hub /admin/ fallback', `${hub}/admin/`], ['Hub /partner/ fallback', `${hub}/partner/`]]) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${label} failed: HTTP ${res.status} (${url})`);
    }
  });

  // ---------------------------------------------------------------------------
  // 28. PARTNER AUTHENTICATION & EXTRANET CORE APIS
  // ---------------------------------------------------------------------------
  let partnerToken = '';
  await test("Partner Auth: Login with valid credentials and receive JWT token", async () => {
    // Self-contained: register a fresh QA partner, approve it as admin, then log in.
    // (Legacy seed credentials were neutralized by migration 0010, so no fixed account exists.)
    const qaEmail = `verify_${rand}@partner.getfortrip.com`;
    const qaPass = `Verify${rand}!Partner`;
    const regRes = await fetch(`${BASE_URL}/api/v1/partner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: qaEmail,
        password: qaPass,
        companyName: `검증용 QA 파트너 (${rand})`,
        partnerType: 'HOTEL',
        businessNumber: `888-77-${rand}`,
        contactPhone: '010-0000-0000',
        representativeName: 'Verify QA',
      }),
    });
    if (!regRes.ok) throw new Error(`QA partner registration failed: HTTP ${regRes.status}`);
    const regJson = await regRes.json();
    // C1/C2: approval needs onboarding docs plus a recorded business check —
    // the old direct-ACTIVE call 409s. Same loop as the E2E onboarding test.
    const qaLogin = await fetch(`${BASE_URL}/api/v1/partner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: qaEmail, password: qaPass }),
    });
    if (!qaLogin.ok) throw new Error(`QA partner pre-approval login failed: HTTP ${qaLogin.status}`);
    const qaToken = (await qaLogin.json()).token;
    for (const purpose of ['BUSINESS_CERT', 'BANK_CERT']) {
      const form = new FormData();
      form.append('file', new Blob(['%PDF-1.4 fake-cert'], { type: 'application/pdf' }), `${purpose.toLowerCase()}.pdf`);
      form.append('purpose', purpose);
      const up = await fetch(`${BASE_URL}/api/v1/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${qaToken}` }, body: form });
      if (up.status !== 201) throw new Error(`${purpose} upload failed: HTTP ${up.status}: ${await up.text()}`);
    }
    const vb = await fetch(`${BASE_URL}/api/v1/admin/partners/${regJson.partnerId}/verify-business`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ method: 'MANUAL', note: 'verify-production: 서류 대조 확인' }),
    });
    if (!vb.ok) throw new Error(`QA partner business check failed: HTTP ${vb.status}`);
    const apprRes = await fetch(`${BASE_URL}/api/v1/admin/partners/${regJson.partnerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    if (!apprRes.ok) throw new Error(`QA partner approval failed: HTTP ${apprRes.status}`);
    const res = await fetch(`${BASE_URL}/api/v1/partner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: qaEmail, password: qaPass }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Partner login failed HTTP ${res.status}: ${errText}`);
    }
    const json = await res.json();
    if (!json.success || !json.token || !json.partner) {
      throw new Error(`Invalid partner login response: ${JSON.stringify(json)}`);
    }
    partnerToken = json.token;
  });

  // ---------------------------------------------------------------------------
  // 29. PARTNER EXTRANET ENDPOINTS (split from 28 — #166: the section number
  // 31 was skipped because two tests shared section 28)
  // ---------------------------------------------------------------------------
  await test("Partner Extranet: Dashboard, Profile, Products, Inventory, Orders, Settlements", async () => {
    if (!partnerToken) throw new Error('Partner token not set');

    // 1. Dashboard
    const dRes = await fetch(`${BASE_URL}/api/v1/partner/dashboard`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    if (!dRes.ok) throw new Error(`Partner dashboard failed: HTTP ${dRes.status}`);
    const dJson = await dRes.json();
    if (!dJson.success || !dJson.metrics) throw new Error(`Invalid dashboard data: ${JSON.stringify(dJson)}`);

    // 2. Profile
    const pRes = await fetch(`${BASE_URL}/api/v1/partner/profile`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    if (!pRes.ok) throw new Error(`Partner profile failed: HTTP ${pRes.status}`);

    // 3. Products
    const prRes = await fetch(`${BASE_URL}/api/v1/partner/products`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    if (!prRes.ok) throw new Error(`Partner products failed: HTTP ${prRes.status}`);

    // 4. Inventory
    const invRes = await fetch(`${BASE_URL}/api/v1/partner/inventory`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    if (!invRes.ok) throw new Error(`Partner inventory failed: HTTP ${invRes.status}`);

    // 5. Orders
    const ordRes = await fetch(`${BASE_URL}/api/v1/partner/orders`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    if (!ordRes.ok) throw new Error(`Partner orders failed: HTTP ${ordRes.status}`);

    // 6. Settlements
    const setRes = await fetch(`${BASE_URL}/api/v1/partner/settlements`, {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    if (!setRes.ok) throw new Error(`Partner settlements failed: HTTP ${setRes.status}`);
  });

  // ---------------------------------------------------------------------------
  // 30. ADMIN EXTENDED CAPABILITIES (PARTNERS & USERS MANAGEMENT)
  // ---------------------------------------------------------------------------
  await test("Admin Console: Partners listing and Users RBAC management", async () => {
    if (!adminToken) throw new Error('Admin token not set');

    // 1. Admin Partners List
    const pRes = await fetch(`${BASE_URL}/api/v1/admin/partners`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!pRes.ok) throw new Error(`Admin partners list failed: HTTP ${pRes.status}`);
    const pJson = await pRes.json();
    if (!pJson.success || !Array.isArray(pJson.partners)) throw new Error(`Invalid admin partners: ${JSON.stringify(pJson)}`);

    // 2. Admin Users List
    const uRes = await fetch(`${BASE_URL}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!uRes.ok) throw new Error(`Admin users list failed: HTTP ${uRes.status}`);
    const uJson = await uRes.json();
    if (!uJson.success || !Array.isArray(uJson.users)) throw new Error(`Invalid admin users: ${JSON.stringify(uJson)}`);
  });

  // ---------------------------------------------------------------------------
  // 31. PARTNER ONBOARDING & PENDING APPROVAL SECURITY ENFORCEMENT
  // ---------------------------------------------------------------------------
  await test("Partner Onboarding: Registration requires admin approval before login", async () => {
    const applicantEmail = `applicant_${rand}@partner.getfortrip.com`;
    const regRes = await fetch(`${BASE_URL}/api/v1/partner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: applicantEmail,
        password: 'PartnerAppPass2026!',
        companyName: `테스트 호텔 리조트 (${rand})`,
        partnerType: 'HOTEL',
        businessNumber: `999-88-${rand}`,
        contactPhone: '02-888-9999',
        representativeName: '홍길동',
      }),
    });
    if (!regRes.ok) throw new Error(`Partner registration failed: HTTP ${regRes.status}`);
    const regJson = await regRes.json();
    if (!regJson.success) throw new Error(`Registration rejected: ${JSON.stringify(regJson)}`);

    // Verify login is blocked with 403 PENDING_APPROVAL
    const loginRes = await fetch(`${BASE_URL}/api/v1/partner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: applicantEmail,
        password: 'PartnerAppPass2026!',
      }),
    });
    if (loginRes.status !== 403) {
      throw new Error(`Expected HTTP 403 PENDING_APPROVAL, got HTTP ${loginRes.status}`);
    }
  });


  // ---------------------------------------------------------------------------
  // 32. FEATURE FLAGS CENTRAL REGISTRY & PUBLIC CLIENT ENDPOINT
  // ---------------------------------------------------------------------------
  await test("Feature Flags: GET /api/v1/feature-flags returns enforced core flags and boolean map", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/feature-flags`);
    if (!res.ok) throw new Error(`Failed to fetch feature flags: HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success || !json.flags || typeof json.flags !== 'object') {
      throw new Error(`Invalid feature flag response: ${JSON.stringify(json)}`);
    }
    // #50 (0038): the 8 no-op core flags are deleted; only enforced keys remain.
    const expected = ['FLIGHT_BOOKING', 'HOTEL_BOOKING', 'ACTIVITY_BOOKING', 'CAR_RENTAL', 'PACKAGE_TOUR', 'TRANSIT_TICKETS', 'URL_PRODUCT_INGESTION', 'AUTO_PRODUCT_PUBLISH'];
    for (const key of expected) {
      if (!(key in json.flags)) {
        throw new Error(`Missing expected feature flag key: ${key}`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 33. FEATURE FLAGS ADMIN RBAC & METADATA
  // ---------------------------------------------------------------------------
  await test("Feature Flags Admin RBAC: Unauthorized access rejected (401), Admin authorized (200)", async () => {
    // 1. Unauthenticated request must fail
    const unauthRes = await fetch(`${BASE_URL}/api/v1/admin/feature-flags`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated feature flags admin, got ${unauthRes.status}`);
    }

    // 2. Admin request with token succeeds
    const res = await fetch(`${BASE_URL}/api/v1/admin/feature-flags`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Admin feature flags failed: HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.flags)) {
      throw new Error(`Invalid admin flags response: ${JSON.stringify(json)}`);
    }
    // #50 (0038): the registry must hold exactly the enforced set — no
    // theater flags. Any future flag addition updates this list deliberately.
    const enforced = ['ACTIVITY_BOOKING', 'AUTO_PRODUCT_PUBLISH', 'CAR_RENTAL', 'CONSIGNMENT_SALES', 'FLIGHT_BOOKING', 'HOTEL_BOOKING', 'MARKETPLACE_1P_DIRECT', 'MARKETPLACE_3P_PARTNER', 'PACKAGE_TOUR', 'PARTNER_SELF_PRODUCT_REGISTRATION', 'PARTNER_URL_INGESTION', 'TRANSIT_TICKETS', 'URL_PRODUCT_INGESTION'].sort();
    const actual = json.flags.map((f) => f.key).sort();
    if (JSON.stringify(actual) !== JSON.stringify(enforced)) {
      throw new Error(`Admin registry is not the enforced set. Extra/missing: ${JSON.stringify(actual.filter((k) => !enforced.includes(k)).concat(enforced.filter((k) => !actual.includes(k))))}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 34. FEATURE FLAGS TOGGLE & DEPENDENCY SAFETY GUARD
  // ---------------------------------------------------------------------------
  await test("Feature Flags Toggle: Dependency guard blocks invalid state & allows valid toggle", async () => {
    // #53: flipping AUTO_PRODUCT_PUBLISH on production auto-publishes drafts
    // mid-run. Production default is read-only (assert the safe default and
    // the guard path); the ON/OFF cycle runs on staging or with
    // VERIFY_ALLOW_MUTATION=1.
    if (!ALLOW_MUTATION) {
      const res = await fetch(`${BASE_URL}/api/v1/admin/feature-flags`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error(`Admin feature flags failed: HTTP ${res.status}`);
      const flags = (await res.json()).flags;
      const auto = flags.find((f) => f.key === 'AUTO_PRODUCT_PUBLISH');
      if (!auto) throw new Error('AUTO_PRODUCT_PUBLISH missing from registry');
      if (Number(auto.is_enabled) !== 0) throw new Error('AUTO_PRODUCT_PUBLISH must rest OFF on production (read-only check)');
      console.log('(read-only: toggle cycle runs on staging)');
      return;
    }
    // Attempting to turn ON AUTO_PRODUCT_PUBLISH while URL_PRODUCT_INGESTION requirement is checked
    const res = await fetch(`${BASE_URL}/api/v1/admin/feature-flags/AUTO_PRODUCT_PUBLISH`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ is_enabled: true, reason: 'E2E Test toggle ON' })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Flag toggle failed: ${err.error}`);
    }
    const json = await res.json();
    if (!json.success || json.flag.is_enabled !== 1) {
      throw new Error(`Flag was not toggled ON: ${JSON.stringify(json)}`);
    }

    // Revert back to safe default OFF
    const revertRes = await fetch(`${BASE_URL}/api/v1/admin/feature-flags/AUTO_PRODUCT_PUBLISH`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ is_enabled: false, reason: 'E2E Test revert back to OFF' })
    });
    if (!revertRes.ok) throw new Error('Failed to revert flag to OFF');
  });

  // ---------------------------------------------------------------------------
  // 35. URL TRAVEL PRODUCT INGESTION ENGINE (SSRF GUARD & PARSER)
  // ---------------------------------------------------------------------------
  let ingestedDraftId = '';
  await test("URL Ingestion: Blocks private IP SSRF & parses travel product URL safely", async () => {
    // 1. SSRF block test
    const ssrfRes = await fetch(`${BASE_URL}/api/v1/admin/ingest/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' })
    });
    if (ssrfRes.status !== 403) {
      throw new Error(`Expected SSRF block HTTP 403, got: ${ssrfRes.status}`);
    }

    // 2. Safe parse test with sample preset
    const ingestRes = await fetch(`${BASE_URL}/api/v1/admin/ingest/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ url: 'https://travel.example.com/tokyo-skytree-admission' })
    });
    // Even if external dummy domain times out or 502/404, the server responds with structured status
    if (ingestRes.status === 201) {
      const data = await ingestRes.json();
      ingestedDraftId = data.draft.id;
    } else {
      // Ingestion endpoint is live and validated
      const err = await ingestRes.json();
      if (!err.code) throw new Error(`Expected structured error code from ingest, got: ${JSON.stringify(err)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 36. URL INGESTION CATALOG PUBLISHING
  // ---------------------------------------------------------------------------
  await test("URL Ingestion Catalog Publishing: Ingested draft lands in live catalog", async () => {
    // Query ingestion history
    const histRes = await fetch(`${BASE_URL}/api/v1/admin/ingest/history`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!histRes.ok) throw new Error(`Ingest history failed: HTTP ${histRes.status}`);
    const hist = await histRes.json();
    if (!hist.success || !Array.isArray(hist.items)) {
      throw new Error(`Invalid history response: ${JSON.stringify(hist)}`);
    }

    // #53: publishing an arbitrary draft mutates the live catalog. Production
    // default is read-only: history shape plus a 404 on a garbage publish id
    // (no writes). Staging publishes for real when a draft is publishable.
    if (!ALLOW_MUTATION) {
      const ghost = await fetch(`${BASE_URL}/api/v1/admin/ingest/ing_no_such_draft_000/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (ghost.status !== 404) throw new Error(`Expected 404 publishing an unknown draft, got HTTP ${ghost.status}`);
      console.log('(read-only: live publish runs on staging)');
      return;
    }
    // Publish only a genuinely publishable draft (unpublished, not rejected).
    const targetDraft = hist.items.find((i) => (i.status === 'DRAFT' || i.status === 'REVIEWED') && !i.published_item_id);
    if (!targetDraft) {
      // Publish is once-only by design, so a re-run finds nothing left to
      // publish. Prove the invariant instead of skipping: re-publishing a
      // published draft must 409. No silent skips (#48).
      const published = hist.items.find((i) => i.status === 'PUBLISHED' || i.published_item_id);
      if (!published) throw new Error('Staging has no drafts at all; cannot exercise publish (seed ing_sample_01 first)');
      const again = await fetch(`${BASE_URL}/api/v1/admin/ingest/${published.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (again.status !== 409) throw new Error(`Re-publish must 409 (once-only), got HTTP ${again.status}`);
      return;
    }
    const pubRes = await fetch(`${BASE_URL}/api/v1/admin/ingest/${targetDraft.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!pubRes.ok) throw new Error(`Publish draft failed: HTTP ${pubRes.status}`);
    const pubJson = await pubRes.json();
    if (!pubJson.success || !pubJson.published_item_id) {
      throw new Error(`Invalid publish response: ${JSON.stringify(pubJson)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 37. CATEGORY EXTENSIONS & SUPPLIER DATA CONTRACT ADAPTERS
  // ---------------------------------------------------------------------------
  await test("Category Extensions: eSIM, Travel Insurance, and External Supplier Registry Active", async () => {
    // 1. eSIM Plans
    const esimRes = await fetch(`${BASE_URL}/api/v1/esim/plans`);
    if (!esimRes.ok) throw new Error(`eSIM plans failed: HTTP ${esimRes.status}`);
    const esimJson = await esimRes.json();
    if (!esimJson.success || !Array.isArray(esimJson.plans) || esimJson.plans.length === 0) {
      throw new Error(`eSIM plans returned empty: ${JSON.stringify(esimJson)}`);
    }

    // 2. Travel Insurance Plans
    const insRes = await fetch(`${BASE_URL}/api/v1/insurance/plans?days=7`);
    if (!insRes.ok) throw new Error(`Insurance plans failed: HTTP ${insRes.status}`);
    const insJson = await insRes.json();
    if (!insJson.success || !Array.isArray(insJson.plans) || insJson.plans.length === 0) {
      throw new Error(`Insurance plans returned empty: ${JSON.stringify(insJson)}`);
    }

    // 3. Supplier Registry (#41: admin-gated, de-named — the public path is gone)
    const supPub = await fetch(`${BASE_URL}/api/v1/suppliers/registry`);
    if (supPub.status !== 404) throw new Error(`Public supplier registry should be 404, got HTTP ${supPub.status}`);
    const supRes = await fetch(`${BASE_URL}/api/v1/admin/suppliers/registry`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!supRes.ok) throw new Error(`Supplier registry failed: HTTP ${supRes.status}`);
    const supJson = await supRes.json();
    if (!supJson.success || !Array.isArray(supJson.suppliers) || supJson.suppliers.length < 5) {
      throw new Error(`Supplier registry returned incomplete adapters: ${JSON.stringify(supJson)}`);
    }
    const supBlob = JSON.stringify(supJson.suppliers);
    for (const vendor of ['Amadeus', 'Agoda', 'Viator', 'Airalo', 'Chubb', 'Rentalcars']) {
      if (supBlob.includes(vendor)) throw new Error(`Supplier registry leaks vendor name: ${vendor}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 38. MARKETPLACE CATALOG MODEL ATTRIBUTION (1P, 3P, CONSIGNMENT)
  // ---------------------------------------------------------------------------
  await test("Marketplace Catalog: GET /api/v1/marketplace/catalog?model=1P/3P/CONSIGNMENT returns filtered attribution", async () => {
    // 1. 1P Direct Sales Filter
    const p1Res = await fetch(`${BASE_URL}/api/v1/marketplace/catalog?model=1P`);
    if (!p1Res.ok) throw new Error(`Marketplace 1P query failed: HTTP ${p1Res.status}`);
    const p1Json = await p1Res.json();
    if (!p1Json.success || !Array.isArray(p1Json.items) || p1Json.items.length === 0) {
      throw new Error(`Expected seeded 1P items in catalog: ${JSON.stringify(p1Json)}`);
    }
    const all1P = p1Json.items.every((i) => i.merchant_model === '1P');
    if (!all1P) throw new Error(`Non-1P item returned in 1P catalog filter`);

    // 2. 3P Partner Sales Filter
    const p3Res = await fetch(`${BASE_URL}/api/v1/marketplace/catalog?model=3P`);
    if (!p3Res.ok) throw new Error(`Marketplace 3P query failed: HTTP ${p3Res.status}`);
    const p3Json = await p3Res.json();
    if (!p3Json.success || !Array.isArray(p3Json.items) || p3Json.items.length === 0) {
      throw new Error(`Expected seeded 3P items in catalog: ${JSON.stringify(p3Json)}`);
    }
    const all3P = p3Json.items.every((i) => i.merchant_model === '3P');
    if (!all3P) throw new Error(`Non-3P item returned in 3P catalog filter`);

    // 3. Consignment Sales Filter
    const conRes = await fetch(`${BASE_URL}/api/v1/marketplace/catalog?model=CONSIGNMENT`);
    if (!conRes.ok) throw new Error(`Marketplace CONSIGNMENT query failed: HTTP ${conRes.status}`);
    const conJson = await conRes.json();
    if (!conJson.success || !Array.isArray(conJson.items) || conJson.items.length === 0) {
      throw new Error(`Expected seeded CONSIGNMENT items in catalog: ${JSON.stringify(conJson)}`);
    }
    const allCon = conJson.items.every((i) => i.merchant_model === 'CONSIGNMENT');
    if (!allCon) throw new Error(`Non-CONSIGNMENT item returned in CONSIGNMENT catalog filter`);
  });

  // ---------------------------------------------------------------------------
  // 39. MARKETPLACE ADMIN FINANCIAL SUMMARY & 3-MODEL BREAKDOWN
  // ---------------------------------------------------------------------------
  await test("Marketplace Financial Summary: GET /api/v1/admin/marketplace/summary returns 1P/3P/Consignment breakdown", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/marketplace/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Marketplace summary failed: HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success || !json.summary || !json.summary.model_breakdown) {
      throw new Error(`Invalid marketplace summary format: ${JSON.stringify(json)}`);
    }
    const { model_breakdown, catalog_item_counts } = json.summary;
    if (!('1P' in model_breakdown) || !('3P' in model_breakdown) || !('CONSIGNMENT' in model_breakdown)) {
      throw new Error(`Missing 3-tier models in breakdown: ${JSON.stringify(model_breakdown)}`);
    }
    if (catalog_item_counts['1P'] < 1 || catalog_item_counts['3P'] < 1 || catalog_item_counts['CONSIGNMENT'] < 1) {
      throw new Error(`Catalog counts per model must be positive: ${JSON.stringify(catalog_item_counts)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 40. 3P PARTNER PRODUCT REGISTRATION WITH SELLER ATTRIBUTION
  // ---------------------------------------------------------------------------
  await test("3P Partner Product Registration: POST /api/v1/partner/marketplace/products registers product with 3P seller attribution", async () => {
    // #53: registering a product writes catalog + supplier rows. Production
    // default is read-only: an invalid POST must 400 without writing anything.
    if (!ALLOW_MUTATION) {
      const bad = await fetch(`${BASE_URL}/api/v1/partner/marketplace/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${partnerToken}`
        },
        body: JSON.stringify({ title: '', domain: 'BOGUS', price: -1 })
      });
      if (bad.status !== 400) throw new Error(`Expected 400 for invalid registration (read-only), got HTTP ${bad.status}`);
      console.log('(read-only: live registration runs on staging)');
      return;
    }
    const res = await fetch(`${BASE_URL}/api/v1/partner/marketplace/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerToken}`
      },
      body: JSON.stringify({
        title: `제주 한라산 프라이빗 투어 (${rand})`,
        domain: 'ACTIVITY',
        city: '제주',
        price: 80000
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Partner product registration failed HTTP ${res.status}: ${err}`);
    }
    const json = await res.json();
    if (!json.success || !json.product || json.product.merchant_model !== '3P') {
      throw new Error(`Invalid 3P product registration response: ${JSON.stringify(json)}`);
    }
    if (json.product.retail_price_krw !== 80000 || json.product.seller_payout_krw !== 72000) {
      throw new Error(`Unexpected margin calculation: ${JSON.stringify(json.product)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 41. MULTI-VENDOR SETTLEMENT LEDGER & PAYOUT APPROVAL
  // ---------------------------------------------------------------------------
  await test("Marketplace Settlement Payout: Admin approves payout & Partner views live settlement ledger", async () => {
    // 1. Admin views all vendor settlements
    const admRes = await fetch(`${BASE_URL}/api/v1/admin/marketplace/settlements`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!admRes.ok) throw new Error(`Admin settlements failed: HTTP ${admRes.status}`);
    const admJson = await admRes.json();
    if (!admJson.success || !Array.isArray(admJson.settlements)) {
      throw new Error(`Invalid settlements response: ${JSON.stringify(admJson)}`);
    }

    // 2. Admin approves payout for an existing settlement if present.
    // Dry-run by default: settling moves real money, so the live PATCH runs only
    // with VERIFY_LIVE_SETTLE=1 (2026-11-09 audit [M]).
    const pending = admJson.settlements.find((s) => s.settlement_status === 'PENDING') || admJson.settlements[0];
    if (pending) {
      if (!process.env.VERIFY_LIVE_SETTLE) {
        skip(`dry-run: live settle of ${pending.id} not exercised (set VERIFY_LIVE_SETTLE=1)`);
      } else {
        const settleRes = await fetch(`${BASE_URL}/api/v1/admin/marketplace/settlements/${pending.id}/settle`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (!settleRes.ok) throw new Error(`Settlement approval failed: HTTP ${settleRes.status}`);
        const settleJson = await settleRes.json();
        if (!settleJson.success) throw new Error(`Settlement approval rejected: ${JSON.stringify(settleJson)}`);
      }
    }

    // 3. Partner views their own 3P settlement records
    const ptnRes = await fetch(`${BASE_URL}/api/v1/partner/marketplace/settlements`, {
      headers: { Authorization: `Bearer ${partnerToken}` }
    });
    if (!ptnRes.ok) throw new Error(`Partner marketplace settlements failed: HTTP ${ptnRes.status}`);
    const ptnJson = await ptnRes.json();
    if (!ptnJson.success || !Array.isArray(ptnJson.settlements)) {
      throw new Error(`Invalid partner settlements response: ${JSON.stringify(ptnJson)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 42. MONEY SANDBOX CYCLE (#143)
  // ---------------------------------------------------------------------------
  await test("Money Sandbox: confirm/cancel guards hold; sandbox runs the full money cycle", async () => {
    // Guard probes first: safe on every target (no writes).
    const anon = await fetch(`${BASE_URL}/api/v1/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'bkg-nope', orderId: 'bkg-nope', amount: 1, paymentKey: 'sbx_ok_nope' }),
    });
    if (anon.status !== 401) throw new Error(`Expected 401 for anonymous confirm, got ${anon.status}`);
    const missing = await fetch(`${BASE_URL}/api/v1/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ bookingId: 'bkg-nope', orderId: 'bkg-nope', amount: 1, paymentKey: 'sbx_ok_nope' }),
    });
    if (missing.status !== 404) throw new Error(`Expected 404 for unknown-booking confirm, got ${missing.status}`);
    const noCancel = await fetch(`${BASE_URL}/api/v1/bookings/bkg-nope/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (noCancel.status !== 404) throw new Error(`Expected 404 for unknown-booking cancel, got ${noCancel.status}`);
    // Full cycle: sandbox provider only (never real money), mutating targets only.
    const cfg = await (await fetch(`${BASE_URL}/api/v1/payments/config`)).json();
    if (!cfg.enabled || cfg.mode !== 'SANDBOX') {
      skip(`money cycle needs the sandbox provider (this target: ${cfg.enabled ? cfg.mode : 'DISABLED'})`);
      return;
    }
    if (!ALLOW_MUTATION) {
      console.log('(read-only: guards only, the cycle runs on mutating targets)');
      return;
    }
    const docs = ((await (await fetch(`${BASE_URL}/api/v1/legal`)).json()).documents || []);
    const ver = Object.fromEntries(docs.map((d) => [d.slug, d.version]));
    const consents = { refundPolicy: ver['refund-policy'], privacy: ver.privacy, thirdParty: ver.privacy };
    const start = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 41 * 86400000).toISOString().slice(0, 10);
    const qRes = await fetch(`${BASE_URL}/api/v1/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ domain: 'HOTEL', itemId: 'htl_seoul_01', unitId: 'rm_seoul_01_dlx', startDate: start, endDate: end, rooms: 1, travelers: { adults: 2 } }),
    });
    if (qRes.status === 409) {
      const qErr = await qRes.json().catch(() => ({}));
      if (qErr.code === 'NOT_DIRECTLY_BOOKABLE') {
        skip('money cycle needs a contracted supplier on this target');
        return;
      }
      throw new Error(`Quote refused: HTTP 409 ${JSON.stringify(qErr)}`);
    }
    if (!qRes.ok) throw new Error(`Quote failed: HTTP ${qRes.status}`);
    const quote = (await qRes.json()).quote;
    const bRes = await fetch(`${BASE_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}`, 'Idempotency-Key': `verify143_key_${rand}_${rand}` },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        contact: { name: '검증', email: userAEmail, phone: '+82-10-0000-0000' },
        travelers: [
          { type: 'ADULT', lastNameEn: 'KIM', firstNameEn: 'VERIFY' },
          { type: 'ADULT', lastNameEn: 'LEE', firstNameEn: 'VERIFY' },
        ],
        simulation: {},
        consents,
      }),
    });
    if (!bRes.ok) throw new Error(`Booking failed: HTTP ${bRes.status}: ${await bRes.text()}`);
    const booking = (await bRes.json()).booking;
    const pRes = await fetch(`${BASE_URL}/api/v1/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ bookingId: booking.id, orderId: booking.id, amount: booking.totalMinor, paymentKey: `sbx_ok_verify143${rand}` }),
    });
    if (!pRes.ok) throw new Error(`Confirm failed: HTTP ${pRes.status}: ${await pRes.text()}`);
    const cRes = await fetch(`${BASE_URL}/api/v1/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (!cRes.ok) throw new Error(`Cancel failed: HTTP ${cRes.status}: ${await cRes.text()}`);
    const done = (await cRes.json()).booking;
    if (!['REFUNDED', 'CANCELLED'].includes(done.status)) throw new Error(`Cancel left ${done.status}, money not settled`);
  });

  // ---------------------------------------------------------------------------
  // 43. PASSWORD RESET SILENCE (#144)
  // ---------------------------------------------------------------------------
  await test("Accounts: password-reset requests stay silent and tokenless", async () => {
    for (const email of [`nobody_${rand}@getfortrip.com`, userAEmail]) {
      const r = await fetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error(`forgot-password failed for ${email}: HTTP ${r.status}`);
      const text = await r.text();
      if (/rst_|resetToken|token=/.test(text)) throw new Error(`reset response leaks a token for ${email}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 44. WISHLIST & PRICE ALERTS (#144)
  // ---------------------------------------------------------------------------
  await test("Wishlist & alerts: reads open, writes self-cleaning", async () => {
    const list = await fetch(`${BASE_URL}/api/v1/wishlist`, { headers: { Authorization: `Bearer ${userAToken}` } });
    if (!list.ok) throw new Error(`Wishlist read failed: HTTP ${list.status}`);
    const alerts = await fetch(`${BASE_URL}/api/v1/price-alerts`, { headers: { Authorization: `Bearer ${userAToken}` } });
    if (!alerts.ok) throw new Error(`Price-alert read failed: HTTP ${alerts.status}`);
    if (!ALLOW_MUTATION) {
      console.log('(read-only: write cycle runs on mutating targets)');
      return;
    }
    const add = await fetch(`${BASE_URL}/api/v1/wishlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ domainType: 'HOTEL', itemId: 'htl_seoul_01', itemTitle: 'verify probe' }),
    });
    if (add.status !== 201) throw new Error(`Wishlist add failed: HTTP ${add.status}`);
    const listed = await (await fetch(`${BASE_URL}/api/v1/wishlist`, { headers: { Authorization: `Bearer ${userAToken}` } })).json();
    if (!listed.wishlist.some((w) => w.item_id === 'htl_seoul_01')) throw new Error('Wishlist add not listed');
    const del = await fetch(`${BASE_URL}/api/v1/wishlist/htl_seoul_01`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (!del.ok) throw new Error(`Wishlist remove failed: HTTP ${del.status}`);
    const pa = await fetch(`${BASE_URL}/api/v1/price-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ routeOrHotel: 'verify probe', targetPrice: 1000 }),
    });
    if (pa.status !== 201) throw new Error(`Price-alert create failed: HTTP ${pa.status}`);
    const paid = (await pa.json()).id;
    const padel = await fetch(`${BASE_URL}/api/v1/price-alerts/${paid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (!padel.ok) throw new Error(`Price-alert delete failed: HTTP ${padel.status}`);
  });

  // ---------------------------------------------------------------------------
  // 45. REVIEWS & MOMENTS (#144)
  // ---------------------------------------------------------------------------
  await test("Reviews & moments: reads open, writes need their backing", async () => {
    const rev = await fetch(`${BASE_URL}/api/v1/reviews?targetId=htl_seoul_01&domain=HOTEL`);
    if (!rev.ok) throw new Error(`Reviews read failed: HTTP ${rev.status}`);
    const revJson = await rev.json();
    if (!revJson.success || !Array.isArray(revJson.reviews) || !revJson.summary) throw new Error('Reviews shape broken');
    const mom = await fetch(`${BASE_URL}/api/v1/moments`);
    if (!mom.ok) throw new Error(`Moments read failed: HTTP ${mom.status}`);
    // Both writes below are rejected before any INSERT — safe on every target.
    const noride = await fetch(`${BASE_URL}/api/v1/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ targetId: 'htl_seoul_01', domainType: 'HOTEL', rating: 5, comment: 'verify probe without a stay' }),
    });
    if (noride.status !== 400) throw new Error(`Expected 400 for booking-less review, got ${noride.status}`);
    const noTitle = await fetch(`${BASE_URL}/api/v1/moments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ content: 'verify probe without a title' }),
    });
    if (noTitle.status !== 400) throw new Error(`Expected 400 for title-less moment, got ${noTitle.status}`);
  });

  // ---------------------------------------------------------------------------
  // 46. SUPPORT TICKETS & PG WEBHOOK (#144)
  // ---------------------------------------------------------------------------
  await test("Support & webhooks: guarded writes, open reads", async () => {
    const mine = await fetch(`${BASE_URL}/api/v1/inquiries`, { headers: { Authorization: `Bearer ${userAToken}` } });
    if (!mine.ok) throw new Error(`Inquiry read failed: HTTP ${mine.status}`);
    const noFields = await fetch(`${BASE_URL}/api/v1/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ category: 'GENERAL' }),
    });
    if (noFields.status !== 400) throw new Error(`Expected 400 for field-less inquiry, got ${noFields.status}`);
    const triage = await fetch(`${BASE_URL}/api/v1/admin/tickets`, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!triage.ok) throw new Error(`Admin ticket read failed: HTTP ${triage.status}`);
    const badStatus = await fetch(`${BASE_URL}/api/v1/admin/tickets/tkt_nope`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'BOGUS' }),
    });
    if (badStatus.status !== 400) throw new Error(`Expected 400 for bogus ticket status, got ${badStatus.status}`);
    const badHook = await fetch(`${BASE_URL}/api/v1/webhooks/toss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (badHook.status !== 400) throw new Error(`Expected 400 for field-less webhook, got ${badHook.status}`);
    if (!ALLOW_MUTATION) {
      console.log('(read-only: live ticket/webhook cycle runs on mutating targets)');
      return;
    }
    const ghost = await fetch(`${BASE_URL}/api/v1/webhooks/toss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId: `verify144_${rand}`, status: 'DONE' } }),
    });
    const ghostJson = await ghost.json();
    if (!ghost.ok || ghostJson.action !== 'NO_UNKNOWN_PAYMENT') throw new Error(`Unknown-order webhook mishandled: HTTP ${ghost.status} ${JSON.stringify(ghostJson)}`);
    const opened = await fetch(`${BASE_URL}/api/v1/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ category: 'GENERAL', subject: 'verify probe', body: 'verify-production long-tail probe' }),
    });
    if (opened.status !== 201) throw new Error(`Inquiry create failed: HTTP ${opened.status}`);
    const tid = (await opened.json()).id;
    const resolved = await fetch(`${BASE_URL}/api/v1/admin/tickets/${tid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    if (!resolved.ok) throw new Error(`Ticket triage failed: HTTP ${resolved.status}`);
  });

  // ---------------------------------------------------------------------------
  // 47. ADMIN & PARTNER WRITES (#144)
  // ---------------------------------------------------------------------------
  await test("Admin & partner writes: reads open, mutations self-restoring", async () => {
    const promos = await fetch(`${BASE_URL}/api/v1/admin/promotions`, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (!promos.ok) throw new Error(`Admin promotions read failed: HTTP ${promos.status}`);
    const prof = await fetch(`${BASE_URL}/api/v1/partner/profile`, { headers: { Authorization: `Bearer ${partnerToken}` } });
    if (!prof.ok) throw new Error(`Partner profile read failed: HTTP ${prof.status}`);
    if (!ALLOW_MUTATION) {
      console.log('(read-only: write cycle runs on mutating targets)');
      return;
    }
    // A created-then-disabled promo is inert residue (never claimable while off).
    const code = `VFY${rand}X1`;
    const created = await fetch(`${BASE_URL}/api/v1/admin/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        code, title: 'verify probe (disabled)', discountType: 'FIXED_AMOUNT', discountValue: 1000,
        validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    if (created.status !== 201) throw new Error(`Promo create failed: HTTP ${created.status}: ${await created.text()}`);
    const pid = (await created.json()).id;
    const off = await fetch(`${BASE_URL}/api/v1/admin/promotions/${pid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    if (!off.ok) throw new Error(`Promo disable failed: HTTP ${off.status}`);
    // Partner contact phone round-trips back to its original (zero residue).
    const before = (await (await fetch(`${BASE_URL}/api/v1/partner/profile`, { headers: { Authorization: `Bearer ${partnerToken}` } })).json()).partner.contact_phone;
    const patched = await fetch(`${BASE_URL}/api/v1/partner/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken}` },
      body: JSON.stringify({ contactPhone: '02-0000-0000' }),
    });
    if (!patched.ok) throw new Error(`Partner profile write failed: HTTP ${patched.status}`);
    const restored = await fetch(`${BASE_URL}/api/v1/partner/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken}` },
      body: JSON.stringify({ contactPhone: before || '010-0000-0000' }),
    });
    if (!restored.ok) throw new Error(`Partner profile restore failed: HTTP ${restored.status}`);
  });

  // ---------------------------------------------------------------------------
  // CLEANUP (#114): withdraw the explorer users created above. Best effort —
  // users with live bookings cannot withdraw (409) and are reported, never
  // force-deleted. (Partner fixtures have no self-delete endpoint; the suite
  // uses pre-seeded partners, so none are created.)
  // ---------------------------------------------------------------------------
  const leftovers = [];
  for (const [email, token] of [[userAEmail, userAToken], [userBEmail, userBToken]]) {
    if (!token) continue;
    try {
      // Withdrawal needs the password — without it every cleanup 400s and the
      // explorers leak (found while adding the #143/#144 probes).
      const w = await fetch(`${BASE_URL}/api/v1/auth/me/withdraw`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: strongPass, reason: 'verify-production cleanup' }),
      });
      if (!w.ok) leftovers.push(`${email} (withdraw HTTP ${w.status})`);
    } catch (e) {
      leftovers.push(`${email} (${e.message})`);
    }
  }
  if (leftovers.length) {
    console.log('Cleanup leftovers (manual review):');
    for (const l of leftovers) console.log(`  leftover: ${l}`);
  } else {
    console.log('Cleanup: explorer users withdrawn.');
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n==============================================================================');
  const failed = total - passed;
  console.log(`Live Security & E2E Verification Results: ${passed}/${total} PASS, ${failed} FAILED, ${skipped} SKIPPED`);
  for (const reason of skipReasons) console.log(`  skipped: ${reason}`);
  console.log(`Mode: ${ALLOW_MUTATION ? 'MUTATING' : 'READ-ONLY'} mutations against ${isProdTarget ? 'PRODUCTION' : 'non-prod target'}`);
  console.log('==============================================================================\n');

  // #48: skips fail the gate unless explicitly accepted — a skipped test is
  // not a passing test.
  if (failed > 0 || (skipped > 0 && !ALLOW_SKIP)) {
    if (skipped > 0 && !ALLOW_SKIP) console.error('Skips present without VERIFY_ALLOW_SKIP=1; refusing a green verdict.');
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
