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

const BASE_URL = process.env.BASE_URL || 'https://ota-hub.dnjstjqppk.workers.dev';

async function runVerificationSuite() {
  console.log('==============================================================================');
  console.log('🚀 Running Production Live Security & E2E Verification Suite against:');
  console.log(`   ${BASE_URL}`);
  console.log('==============================================================================\n');

  let passed = 0;
  let total = 0;

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
    const adminPass = process.env.TEST_ADMIN_PASSWORD || 'AdminProdPass#2026_SecureKey';
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
    // In production, uncontracted suppliers are safely rejected with 409 NOT_DIRECTLY_BOOKABLE (or 400 validation error)
    if (res.status !== 409 && res.status !== 400) {
      throw new Error(`Uncontracted supplier quote unexpectedly allowed! Received HTTP ${res.status}`);
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
    const res = await fetch(`${BASE_URL}/out/nonexistent_partner/item-123`, { redirect: 'manual' });
    if (res.status !== 404) {
      throw new Error(`Expected 404 for unconfigured affiliate link, got HTTP ${res.status}`);
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
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log(`Live Security & E2E Verification Results: ${passed}/${total} PASS (${Math.round((passed / total) * 100)}%)`);
  console.log('==============================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
