// scripts/verify-production.js
const crypto = require('crypto');

const BASE_URL = 'https://ota-hub.dnjstjqppk.workers.dev';

async function runTests() {
  console.log('🚀 Running Production Live E2E Verification Suite against:', BASE_URL);
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    process.stdout.write(`[TEST ${total}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error('   Error:', err.message);
    }
  }

  // 1. Health check
  await test('GET /api/v1/health (D1 APAC connectivity)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'healthy') throw new Error(`Unexpected status: ${data.status}`);
    if (!data.database.includes('D1 APAC')) throw new Error(`DB not D1 APAC: ${data.database}`);
  });

  // 2. User registration
  const rand = Math.floor(Math.random() * 90000) + 10000;
  const testEmail = `explorer_${rand}@getfortrip.com`;
  const testPass = 'ExplorerPass123!';
  let userToken = '';

  await test('POST /api/v1/auth/register (B2C user persistence)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPass,
        full_name: 'Seoul Explorer',
        phone: '010-9999-' + rand.toString().slice(0, 4)
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.token || !data.user || data.user.email !== testEmail) {
      throw new Error('Invalid register response structure');
    }
    userToken = data.token;
  });

  // 3. User login
  await test('POST /api/v1/auth/login (JWT issuance & D1 verification)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPass
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.token || data.user.email !== testEmail) {
      throw new Error('Login failed to return valid token/user');
    }
  });

  // 4. Authenticated profile check
  await test('GET /api/v1/auth/me (JWT validation & session persistence)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (data.email !== testEmail || data.trip_coins !== 5000) {
      throw new Error(`Unexpected user data: coins=${data.trip_coins}`);
    }
  });

  // 5. Outlink Redirection & Click Ledger
  let capturedClickId = '';
  await test('GET /out/trip/hotel-grand-seoul (302 Redirect & D1 Click Ledger)', async () => {
    const res = await fetch(`${BASE_URL}/out/trip/hotel-grand-seoul`, {
      redirect: 'manual'
    });
    if (res.status !== 302) {
      throw new Error(`Expected 302 redirect, got HTTP ${res.status}`);
    }
    const loc = res.headers.get('location');
    if (!loc || !loc.includes('sub=clk_')) {
      throw new Error(`Location header missing signed click sub param: ${loc}`);
    }
    const match = loc.match(/sub=(clk_[a-f0-9]+)/);
    if (!match) throw new Error('Could not parse click_id from location URL');
    capturedClickId = match[1];
  });

  // 6. Security Rejection: Fake X-Payment-Proof Header
  await test('POST /api/v1/bookings/bk-demo-001/pay with fake X-Payment-Proof (Must reject with 401)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings/bk-demo-001/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Proof': 'simulated_dummy_proof_12345'
      },
      body: JSON.stringify({ method: 'CREDIT_CARD' })
    });
    if (res.status !== 401) {
      throw new Error(`Security breach! Expected 401 Unauthorized, got HTTP ${res.status}`);
    }
    const body = await res.json();
    if (!body.error || !body.error.includes('보안 위반')) {
      throw new Error(`Unexpected error message: ${JSON.stringify(body)}`);
    }
  });

  // 7. S2S Affiliate Postback Webhook with HMAC-SHA256
  await test('POST /api/v1/webhooks/postback with valid HMAC-SHA256 signature (200 OK conversion)', async () => {
    const uniqueOrderId = `bk-order-${rand}-${Date.now()}`;
    const payload = JSON.stringify({
      partner_id: 'trip',
      booking_id: uniqueOrderId,
      order_id: uniqueOrderId,
      click_id: capturedClickId || 'clk_test_mock',
      amount: 198000,
      currency: 'KRW',
      commission: 13860,
      status: 'CONFIRMED'
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = 'trip_hmac_secret_2026';
    const message = `${timestamp}.${payload}`;
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    const res = await fetch(`${BASE_URL}/api/v1/webhooks/postback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'Idempotency-Key': `idemp-${rand}-${Date.now()}`
      },
      body: payload
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (data.status !== 'CONFIRMED') {
      throw new Error(`Postback failed: ${JSON.stringify(data)}`);
    }
  });

  // 8. Admin SPA routing
  await test('GET /admin/ (Admin SPA served with 200 OK)', async () => {
    const res = await fetch(`${BASE_URL}/admin/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('vite') && !html.includes('admin') && !html.includes('getforTrip')) {
      throw new Error('Admin index HTML did not contain expected SPA markers');
    }
  });

  // 9. User Registration Page
  await test('GET /register (Prerendered B2C Registration Vue Page)', async () => {
    const res = await fetch(`${BASE_URL}/register/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('회원가입') && !html.includes('getforTrip')) {
      throw new Error('Register HTML missing required text');
    }
  });

  // 10. Security Headers Verification
  await test('Security Headers (HSTS, nosniff, SAMEORIGIN, strict-origin)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    const hsts = res.headers.get('strict-transport-security');
    const nosniff = res.headers.get('x-content-type-options');
    const frame = res.headers.get('x-frame-options');
    const referrer = res.headers.get('referrer-policy');
    if (!hsts || !nosniff || !frame || !referrer) {
      throw new Error(`Missing one or more security headers: HSTS=${hsts}, nosniff=${nosniff}, frame=${frame}, referrer=${referrer}`);
    }
  });

  console.log(`\n========================================`);
  console.log(`Live E2E Verification Results: ${passed}/${total} PASS (${Math.round((passed/total)*100)}%)`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
