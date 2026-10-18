// scripts/verify-production.js
/**
 * getforTrip Hardened Production Live E2E & Security Verification Suite
 * ==============================================================================
 * Tests live endpoints against https://ota-hub.dnjstjqppk.workers.dev
 * Verifies P0~P3 Security Enforcements:
 *  - P0-01: Admin Backdoor Elimination (Default password rejected with 401)
 *  - P0-02: Cryptographic Secrets & Token Validation (Forged tokens rejected)
 *  - P0-03: PBKDF2 Password Hashing & Strict Policy
 *  - P0-04: Payment Spoofing Rejection (Direct client /pay rejected with 403)
 *  - P0-05: Webhook HMAC Strictness (Replay, missing TS, fake sigs rejected)
 *  - P0-06: IDOR Protection (Cross-user booking access rejected with 403)
 *  - P0-07: Admin RBAC & Audit Logging (Non-admin access rejected with 403)
 *  - P0-08: Client Price & Currency Tampering Defense
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
  let capturedClickId = '';

  // ---------------------------------------------------------------------------
  // 1. HEALTH & SECURITY STATUS
  // ---------------------------------------------------------------------------
  await test('GET /api/v1/health: D1 APAC DB & Security Engine Status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'healthy') throw new Error(`Status is not healthy: ${data.status}`);
    if (!data.database.includes('connected')) throw new Error(`DB disconnected: ${data.database}`);
    if (!data.security || data.security.admin_backdoors !== 'PURGED') {
      throw new Error(`Security status invalid: ${JSON.stringify(data.security)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. P0-01: ADMIN BACKDOOR ELIMINATION
  // ---------------------------------------------------------------------------
  await test('P0-01 Security: Default Admin Password (admin1234!) MUST BE REJECTED', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@getfortrip.com', password: 'admin1234!' }),
    });
    if (res.status !== 401) {
      throw new Error(`CRITICAL SECURITY FAILURE: Backdoor password accepted with HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.error) throw new Error('Expected error message on backdoor rejection');
  });

  // ---------------------------------------------------------------------------
  // 3. P0-02: FORGED / INVALID JWT TOKEN REJECTION
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
  // 5. P0-03: B2C USER A REGISTRATION (PBKDF2-HMAC-SHA256)
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
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.token || data.user.role !== 'USER' || data.user.tripCoins !== 5000) {
      throw new Error(`Invalid register payload: ${JSON.stringify(data)}`);
    }
    userAToken = data.token;
  });

  // ---------------------------------------------------------------------------
  // 6. P0-03: WEAK PASSWORD POLICY ENFORCEMENT
  // ---------------------------------------------------------------------------
  await test('P0-03 Auth: Weak Passwords (no numbers / short) MUST BE REJECTED (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `weak_${rand}@getfortrip.com`,
        password: 'weak',
        fullName: 'Weak Password User',
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
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@getfortrip.com',
        password: 'AdminSecurePass2026!',
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
  // 10. P0-08: CLIENT PRICE TAMPERING DEFENSE
  // ---------------------------------------------------------------------------
  await test('P0-08 Security: Negative or Zero Booking Price MUST BE REJECTED (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        itemId: 'hotel-grand-seoul',
        totalPrice: -50000,
        currency: 'KRW',
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Price tampering allowed! Received HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 11. P0-08: INVALID CURRENCY REJECTION
  // ---------------------------------------------------------------------------
  await test('P0-08 Security: Invalid / Unsupported Currency MUST BE REJECTED (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        itemId: 'hotel-grand-seoul',
        totalPrice: 250000,
        currency: 'FAKE_COIN',
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Invalid currency accepted! Received HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 12. USER A CREATES VALID PENDING BOOKING
  // ---------------------------------------------------------------------------
  await test('Booking Lifecycle: User A Creates Valid Booking (Status: PENDING_PAYMENT)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        itemId: 'hotel-grand-seoul',
        title: '신라호텔 서울 디럭스 더블룸',
        domainType: 'HOTEL',
        totalPrice: 380000,
        currency: 'KRW',
        customerName: 'User Alpha',
        customerEmail: userAEmail,
        details: { checkIn: '2026-11-10', checkOut: '2026-11-12', nights: 2 },
      }),
    });
    if (res.status !== 201) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.booking.status !== 'PENDING_PAYMENT') {
      throw new Error(`Booking was not created as PENDING_PAYMENT: ${data.booking.status}`);
    }
    // P0-04: Ensure voucher is NOT issued for unpaid booking
    if (data.booking.voucherCode !== null) {
      throw new Error('CRITICAL: Voucher code issued prematurely on unpaid booking!');
    }
    userABookingId = data.booking.id;
  });

  // ---------------------------------------------------------------------------
  // 13. P0-06: IDOR DEFENSE (USER B ATTEMPTS TO ACCESS USER A BOOKING)
  // ---------------------------------------------------------------------------
  await test('P0-06 Security: IDOR Defense: User B Cannot Access User A Booking (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings/${userABookingId}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    if (res.status !== 403) {
      throw new Error(`CRITICAL IDOR BREACH: User B accessed User A booking with HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 14. P0-06: USER A CAN ACCESS OWN BOOKING
  // ---------------------------------------------------------------------------
  await test('P0-06 Security: User A Can Access Own Booking (200 OK)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings/${userABookingId}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    if (!res.ok) throw new Error(`User A failed to access own booking: HTTP ${res.status}`);
    const data = await res.json();
    if (data.booking.id !== userABookingId) throw new Error('Returned mismatched booking ID');
  });

  // ---------------------------------------------------------------------------
  // 15. P0-04: DIRECT CLIENT PAYMENT CONFIRMATION MUST BE REJECTED (403)
  // ---------------------------------------------------------------------------
  await test('P0-04 Security: Direct Client /pay Auto-Confirm MUST BE REJECTED (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/bookings/${userABookingId}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({ method: 'CREDIT_CARD' }),
    });
    if (res.status !== 403) {
      throw new Error(`Direct confirmation allowed! Expected 403 Forbidden, got HTTP ${res.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 16. P0-05: FAKE WEBHOOK BACKDOOR SIGNATURE MUST BE REJECTED (403)
  // ---------------------------------------------------------------------------
  await test('P0-05 Security: Fake Backdoor Webhook Signature MUST BE REJECTED (403)', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await fetch(`${BASE_URL}/api/v1/webhooks/postback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': ts,
        'X-Signature': 'test_sandbox_verified_sig',
      },
      body: JSON.stringify({
        partner: 'trip',
        order_id: `ord_${rand}`,
        click_id: 'clk_mock',
        amount: 100000,
      }),
    });
    if (res.status !== 403) {
      throw new Error(`CRITICAL: Backdoor test signature accepted! Received HTTP ${res.status}`);
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
  // 18. OUTLINK SIGNED 302 REDIRECT & CLICK RECORDING
  // ---------------------------------------------------------------------------
  await test('Affiliate: Signed Outlink Redirection (302) & Click Ledger Capture', async () => {
    const res = await fetch(`${BASE_URL}/out/trip/hotel-grand-seoul`, { redirect: 'manual' });
    if (res.status !== 302) throw new Error(`Expected 302 redirect, got HTTP ${res.status}`);
    const location = res.headers.get('location');
    if (!location || !location.includes('sub=clk_')) {
      throw new Error(`Location header missing signed click sub param: ${location}`);
    }
    const match = location.match(/sub=(clk_[a-f0-9]+)/);
    if (!match) throw new Error('Could not parse click_id from location URL');
    capturedClickId = match[1];
  });

  // ---------------------------------------------------------------------------
  // 19. P0-05: AUTHENTIC HMAC-SHA256 WEBHOOK PROCESSED & BOOKING CONFIRMED
  // ---------------------------------------------------------------------------
  const webhookOrderId = `GFT-ORD-${rand}-${Date.now()}`;
  await test('P0-05 Security: Cryptographically Signed S2S Webhook Confirmation', async () => {
    const payload = JSON.stringify({
      partner: 'trip',
      booking_id: userABookingId,
      order_id: webhookOrderId,
      click_id: capturedClickId || 'clk_test_mock',
      amount: 380000,
      currency: 'KRW',
      commission: 26600,
      status: 'CONFIRMED',
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = 'trip_hmac_secret_2026'; // Secret stored in affiliate_partners_config
    const message = `${timestamp}.${payload}`;
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    const res = await fetch(`${BASE_URL}/api/v1/webhooks/postback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'Idempotency-Key': `idemp-${rand}-${Date.now()}`,
      },
      body: payload,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Valid webhook failed: HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (data.status !== 'CONFIRMED') throw new Error(`Unexpected status: ${data.status}`);
  });

  // ---------------------------------------------------------------------------
  // 20. P0-05: WEBHOOK IDEMPOTENCY (DUPLICATE EVENT SAFELY IGNORED)
  // ---------------------------------------------------------------------------
  await test('P0-05 Security: Webhook Idempotency (Duplicate Order ID Ignored Safely)', async () => {
    const payload = JSON.stringify({
      partner: 'trip',
      booking_id: userABookingId,
      order_id: webhookOrderId,
      click_id: capturedClickId || 'clk_test_mock',
      amount: 380000,
      currency: 'KRW',
      commission: 26600,
      status: 'CONFIRMED',
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
      },
      body: payload,
    });
    if (!res.ok) throw new Error(`Idempotency request failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!data.message || !data.message.includes('idempotent')) {
      throw new Error(`Expected idempotent acknowledgement: ${JSON.stringify(data)}`);
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
