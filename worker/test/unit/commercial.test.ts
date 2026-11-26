/** CR-01..CR-06 (COMMERCIAL_READINESS_AUDIT.md): pure helpers + the social-login handler flow. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertOwnReviewPhotos, parsePhotos, photoUploadIds, ratingDistribution } from "../../src/services/review-service.ts";
import { safeImage, safeLink } from "../../src/routes/marketing.ts";
import { PROVIDERS, configuredProviders, handleOAuth, resolveReturnTo } from "../../src/routes/oauth.ts";
import { renderOutboxEmail } from "../../src/services/email-service.ts";
import { verifyJwt } from "../../src/lib/crypto.ts";
import { fakeDb } from "./_fakedb.ts";

const SECRET = "x".repeat(40);

/** In-memory ephemeral store: enough for rate limits and single-use tickets. */
function memStore() {
  const hits = new Map<string, number>();
  const revoked = new Set<string>();
  return {
    count: async (k: string) => hits.get(k) || 0,
    recordHit: async (k: string) => { hits.set(k, (hits.get(k) || 0) + 1); },
    clear: async (k: string) => { hits.delete(k); },
    revokeJti: async (j: string) => { revoked.add(j); },
    isRevoked: async (j: string) => revoked.has(j),
    setReset: async () => {}, getReset: async () => null,
    claimIdem: async () => ({ hash: null, status: null, body: null }), storeIdem: async () => {},
  };
}

// ---------------------------------------------------------------- CR-01 reviews
test("review photos: only own-site upload URLs, max 5, no duplicates", () => {
  assert.deepEqual(photoUploadIds(undefined), []);
  assert.deepEqual(photoUploadIds(["/api/v1/uploads/upl_a/file", "/api/v1/uploads/upl_b/file"]), ["upl_a", "upl_b"]);
  assert.throws(() => photoUploadIds("x"), /INVALID_PHOTOS|사진/);
  assert.throws(() => photoUploadIds(["https://evil.test/a.png"]), (e: any) => e.code === "INVALID_PHOTOS");
  assert.throws(() => photoUploadIds(Array.from({ length: 6 }, (_, i) => `/api/v1/uploads/u${i}/file`)), (e: any) => e.code === "TOO_MANY_PHOTOS");
  assert.throws(() => photoUploadIds(["/api/v1/uploads/u1/file", "/api/v1/uploads/u1/file"]), (e: any) => e.code === "INVALID_PHOTOS");
});

test("review photos: every upload must be the reviewer's own REVIEW_PHOTO", async () => {
  const db = fakeDb({ all: (_sql, params) => (params as string[]).slice(1).filter((id) => id !== "upl_other").map((id) => ({ id })) });
  assert.deepEqual(await assertOwnReviewPhotos(db, "usr_1", ["upl_a"]), ["/api/v1/uploads/upl_a/file"]);
  await assert.rejects(assertOwnReviewPhotos(db, "usr_1", ["upl_a", "upl_other"]), (e: any) => e.code === "PHOTO_NOT_OWNED");
  assert.deepEqual(await assertOwnReviewPhotos(db, "usr_1", []), []);
});

test("review photos/distribution: malformed stored JSON reads as empty; histogram buckets 1..5", () => {
  assert.deepEqual(parsePhotos("{bad"), []);
  assert.deepEqual(parsePhotos(JSON.stringify(["/api/v1/uploads/a/file", "javascript:alert(1)"])), ["/api/v1/uploads/a/file"]);
  assert.deepEqual(ratingDistribution([{ rating: 5, c: 3 }, { rating: 4.5, c: 1 }, { rating: 1, c: 2 }]), { "1": 2, "2": 0, "3": 0, "4": 1, "5": 3 });
});

// ---------------------------------------------------------------- CR-05 marketing
test("marketing links/images: internal paths or https only", () => {
  assert.equal(safeLink("/deals?tab=hotel"), "/deals?tab=hotel");
  assert.equal(safeLink("https://getfortrip.com/x"), "https://getfortrip.com/x");
  assert.equal(safeLink(""), null);
  for (const bad of ["javascript:alert(1)", "//evil.test", "http://plain.test", "data:text/html,x"]) {
    assert.throws(() => safeLink(bad), (e: any) => e.code === "INVALID_LINK", bad);
  }
  assert.equal(safeImage("/api/v1/uploads/upl_1/file"), "/api/v1/uploads/upl_1/file");
  assert.throws(() => safeImage("/etc/passwd"), (e: any) => e.code === "INVALID_IMAGE");
});

// ---------------------------------------------------------------- CR-02/03 mail
test("reply notification mails carry a link, never the message body", () => {
  const s = renderOutboxEmail("SUPPORT_REPLY", JSON.stringify({ subject: "환불<문의>" }), "https://getfortrip.com");
  assert.ok(s && s.html.includes("/help#inquiries") && s.html.includes("환불&lt;문의&gt;"));
  const m = renderOutboxEmail("BOOKING_MESSAGE", JSON.stringify({ bookingNumber: "GFT-1", from: "파트너" }), "https://getfortrip.com");
  assert.ok(m && m.subject.includes("GFT-1") && m.html.includes("/my/bookings"));
  assert.equal(renderOutboxEmail("BOOKING_MESSAGE", JSON.stringify({ bookingNumber: "GFT-1" }), "https://getfortrip.com"), null);
});

// ---------------------------------------------------------------- CR-06 social login
test("oauth: a provider is offered only with complete credentials", () => {
  assert.deepEqual(configuredProviders({} as any), []);
  assert.deepEqual(configuredProviders({ OAUTH_KAKAO_CLIENT_ID: "k" } as any), ["kakao"]);
  assert.deepEqual(configuredProviders({ OAUTH_GOOGLE_CLIENT_ID: "g" } as any), [], "google needs a secret");
  assert.deepEqual(configuredProviders({ OAUTH_GOOGLE_CLIENT_ID: "g", OAUTH_GOOGLE_CLIENT_SECRET: "s", OAUTH_NAVER_CLIENT_ID: "n", OAUTH_NAVER_CLIENT_SECRET: "s" } as any), ["google", "naver"]);
});

test("oauth: returnTo accepts same-site paths and allow-listed origins only", () => {
  const env = { PUBLIC_SITE_URL: "https://getfortrip.com", ALLOWED_ORIGINS: "http://localhost:3000", APP_ENV: "production" } as any;
  const url = new URL("https://getfortrip.com/api/v1/auth/oauth/kakao/start");
  assert.deepEqual(resolveReturnTo("/my/bookings", env, url), { origin: "https://getfortrip.com", path: "/my/bookings" });
  assert.deepEqual(resolveReturnTo("//evil.test/x", env, url), { origin: "https://getfortrip.com", path: "/" });
  assert.deepEqual(resolveReturnTo("https://evil.test/x", env, url), { origin: "https://getfortrip.com", path: "/" });
  assert.deepEqual(resolveReturnTo("http://localhost:3000/hotels", env, url), { origin: "http://localhost:3000", path: "/hotels" });
});

test("oauth: profile normalization — only asserted-verified e-mail counts as verified", () => {
  assert.deepEqual(PROVIDERS.kakao.normalize({ id: 42, kakao_account: { email: "A@B.CO", is_email_verified: true, is_email_valid: true, profile: { nickname: "길동" } } }),
    { sub: "42", email: "a@b.co", emailVerified: true, name: "길동" });
  assert.equal(PROVIDERS.kakao.normalize({ id: 1, kakao_account: { email: "a@b.co", is_email_verified: false } }).emailVerified, false);
  assert.equal(PROVIDERS.google.normalize({ sub: "g1", email: "a@b.co", email_verified: true }).emailVerified, true);
  const n = PROVIDERS.naver.normalize({ resultcode: "00", response: { id: "n1", email: "a@b.co", name: "홍" } });
  assert.equal(n.sub, "n1");
  assert.equal(n.emailVerified, false, "naver never auto-links");
  assert.equal(PROVIDERS.naver.normalize({ resultcode: "024" }).sub, "");
});

function oauthEnv(db: any) {
  return { APP_ENV: "test", JWT_SECRET: SECRET, PUBLIC_SITE_URL: "https://getfortrip.com", OAUTH_KAKAO_CLIENT_ID: "kid", OAUTH_STUB_BASE: "https://stub.test", DB: db, EPHEMERAL: memStore() } as any;
}
const req = (u: string, init: RequestInit = {}) => new Request(u, init);

async function startFlow(env: any) {
  const r = await handleOAuth(req("https://api.test/api/v1/auth/oauth/kakao/start?returnTo=/my/bookings"), env, new URL("https://api.test/api/v1/auth/oauth/kakao/start?returnTo=/my/bookings"));
  assert.equal(r!.status, 302);
  const loc = new URL(r!.headers.get("Location")!);
  assert.equal(loc.origin + loc.pathname, "https://stub.test/kakao/authorize");
  assert.equal(loc.searchParams.get("client_id"), "kid");
  assert.equal(loc.searchParams.get("redirect_uri"), "https://api.test/api/v1/auth/oauth/kakao/callback");
  const cookie = r!.headers.get("Set-Cookie")!;
  assert.match(cookie, /^getfortrip_oauth=.+HttpOnly/);
  return { state: loc.searchParams.get("state")!, cookie: cookie.split(";")[0] };
}

function mockKakao(profile: any) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const u = String(input);
    if (u.endsWith("/kakao/token")) return new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
    if (u.endsWith("/kakao/profile")) return new Response(JSON.stringify(profile), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as any;
  return () => { globalThis.fetch = orig; };
}

test("oauth flow: linked user -> fragment handoff -> single-use exchange mints a session", async () => {
  const user = { id: "usr_1", email: "a@b.co", full_name: "홍길동", role: "USER", tier: "SILVER", status: "ACTIVE", trip_coins: 0 };
  const db = fakeDb({ first: (sql) => (/FROM user_identities i JOIN users/.test(sql) || /FROM users WHERE id/.test(sql) ? user : null), run: () => ({ meta: { changes: 1 } }) });
  const env = oauthEnv(db);
  const { state, cookie } = await startFlow(env);
  const restore = mockKakao({ id: 7, kakao_account: { email: "a@b.co", is_email_verified: true } });
  try {
    const cbUrl = `https://api.test/api/v1/auth/oauth/kakao/callback?code=c1&state=${state}`;
    const cb = await handleOAuth(req(cbUrl, { headers: { Cookie: cookie } }), env, new URL(cbUrl));
    const loc = new URL(cb!.headers.get("Location")!);
    assert.equal(loc.origin + loc.pathname, "https://getfortrip.com/oauth/callback");
    assert.equal(loc.searchParams.get("returnTo"), "/my/bookings");
    assert.equal(loc.searchParams.get("handoff"), null, "secret never in the query string");
    const handoff = new URLSearchParams(loc.hash.slice(1)).get("handoff")!;
    assert.ok(handoff);
    assert.equal(await verifyJwt(handoff, SECRET), null, "a handoff is not a session token");

    const ex = () => handleOAuth(req("https://api.test/api/v1/auth/oauth/exchange", { method: "POST", body: JSON.stringify({ handoff }), headers: { "Content-Type": "application/json" } }), env, new URL("https://api.test/api/v1/auth/oauth/exchange"));
    const first = await ex();
    const body = await first!.json() as any;
    assert.equal(first!.status, 200);
    assert.equal(body.user.id, "usr_1");
    assert.ok(await verifyJwt(body.token, SECRET), "exchange mints a real session token");
    assert.match(first!.headers.get("Set-Cookie") || "", /^getfortrip_jwt=/);
    await assert.rejects(ex(), (e: any) => e.code === "OAUTH_TICKET_USED");
  } finally {
    restore();
  }
});

test("oauth flow: state mismatch and unverified e-mail collisions are refused", async () => {
  const db = fakeDb({ first: (sql) => (/FROM users WHERE email/.test(sql) ? { id: "usr_x" } : null) });
  const env = oauthEnv(db);
  const { cookie } = await startFlow(env);
  const bad = "https://api.test/api/v1/auth/oauth/kakao/callback?code=c&state=forged";
  const r1 = await handleOAuth(req(bad, { headers: { Cookie: cookie } }), env, new URL(bad));
  assert.equal(new URL(r1!.headers.get("Location")!).searchParams.get("error"), "STATE_MISMATCH");

  const { state, cookie: c2 } = await startFlow(env);
  const restore = mockKakao({ id: 9, kakao_account: { email: "a@b.co", is_email_verified: false } });
  try {
    const u = `https://api.test/api/v1/auth/oauth/kakao/callback?code=c&state=${state}`;
    const r2 = await handleOAuth(req(u, { headers: { Cookie: c2 } }), env, new URL(u));
    assert.equal(new URL(r2!.headers.get("Location")!).searchParams.get("error"), "EMAIL_IN_USE");
  } finally {
    restore();
  }
});

test("oauth flow: new account gets a sign-up ticket, and complete demands consent", async () => {
  const db = fakeDb({ first: () => null });
  const env = oauthEnv(db);
  const { state, cookie } = await startFlow(env);
  const restore = mockKakao({ id: 11, kakao_account: { email: "new@b.co", is_email_verified: true, profile: { nickname: "새회원" } } });
  try {
    const u = `https://api.test/api/v1/auth/oauth/kakao/callback?code=c&state=${state}`;
    const r = await handleOAuth(req(u, { headers: { Cookie: cookie } }), env, new URL(u));
    const frag = new URLSearchParams(new URL(r!.headers.get("Location")!).hash.slice(1));
    assert.ok(frag.get("signup"));
    assert.equal(frag.get("email"), "new@b.co");
    const complete = (b: any) => handleOAuth(req("https://api.test/api/v1/auth/oauth/complete", { method: "POST", body: JSON.stringify(b), headers: { "Content-Type": "application/json" } }), env, new URL("https://api.test/api/v1/auth/oauth/complete"));
    await assert.rejects(complete({ signup: frag.get("signup"), agreeTerms: true }), (e: any) => e.code === "CONSENT_REQUIRED");
  } finally {
    restore();
  }
});

test("oauth: disabled providers 404 and unknown paths fall through", async () => {
  const env = { APP_ENV: "test", JWT_SECRET: SECRET, DB: fakeDb(), EPHEMERAL: memStore() } as any;
  await assert.rejects(handleOAuth(req("https://api.test/api/v1/auth/oauth/google/start"), env, new URL("https://api.test/api/v1/auth/oauth/google/start")), (e: any) => e.code === "OAUTH_PROVIDER_DISABLED");
  const list = await handleOAuth(req("https://api.test/api/v1/auth/oauth/providers"), env, new URL("https://api.test/api/v1/auth/oauth/providers"));
  assert.deepEqual(((await list!.json()) as any).providers, []);
  assert.equal(await handleOAuth(req("https://api.test/api/v1/auth/login"), env, new URL("https://api.test/api/v1/auth/login")), null);
});

// ---------------------------------------------------------------------------
// 2026-11-27 full-codebase review regressions
// ---------------------------------------------------------------------------
test("oauth: a verified provider e-mail never auto-links an existing account", async () => {
  const inserts: string[] = [];
  const db = fakeDb({
    first: (sql) => (/FROM users WHERE email/.test(sql) ? { id: "usr_victim", role: "USER", status: "ACTIVE" } : null),
    run: (sql) => { if (/INSERT INTO user_identities/.test(sql)) inserts.push(sql); return { meta: { changes: 1 } }; },
  });
  const env = oauthEnv(db);
  const { state, cookie } = await startFlow(env);
  const restore = mockKakao({ id: 99, kakao_account: { email: "victim@b.co", is_email_verified: true, is_email_valid: true } });
  try {
    const u = `https://api.test/api/v1/auth/oauth/kakao/callback?code=c&state=${state}`;
    const r = await handleOAuth(req(u, { headers: { Cookie: cookie } }), env, new URL(u));
    const loc = new URL(r!.headers.get("Location")!);
    assert.equal(loc.searchParams.get("error"), "EMAIL_IN_USE");
    assert.equal(new URLSearchParams(loc.hash.slice(1)).get("handoff"), null, "no login handoff for the pre-registered account");
    assert.deepEqual(inserts, [], "no identity row is linked");
  } finally {
    restore();
  }
});

test("partner auth: API keys are INTEGRATION, staff roles come from the database", async () => {
  const { requirePartner } = await import("../../src/lib/auth.ts");
  const { signJwt } = await import("../../src/lib/crypto.ts");
  const partnerRow = { id: "ptn_1", company_name: "Acme", is_active: 1, profile_status: "ACTIVE" };
  const db = fakeDb({
    first: (sql) => {
      if (/FROM partner_api_keys/.test(sql)) return { id: "ptn_1", email: "p@acme.co", company_name: "Acme" };
      if (/FROM partners p/.test(sql)) return partnerRow;
      if (/FROM partner_staff/.test(sql)) return { is_active: 1, role: "STAFF" };
      return null;
    },
    run: () => ({ meta: { changes: 1 } }),
  });
  const env = { APP_ENV: "test", JWT_SECRET: SECRET, DB: db, EPHEMERAL: memStore() } as any;
  const key = `gft_live_${"a".repeat(32)}`;
  const viaKey = await requirePartner(new Request("https://api.test/x", { headers: { Authorization: `Bearer ${key}` } }), env);
  assert.equal(viaKey.viaApiKey, true);
  assert.equal(viaKey.staffRole, "INTEGRATION");
  // A token minted while the staffer was MANAGER: the DB now says STAFF.
  const jwt = await signJwt({ id: "ptn_1", email: "s@acme.co", role: "PARTNER", staffId: "stf_1", staffRole: "MANAGER" }, SECRET);
  const staff = await requirePartner(new Request("https://api.test/x", { headers: { Authorization: `Bearer ${jwt}` } }), env);
  assert.equal(staff.staffRole, "STAFF", "demotion applies without waiting for the JWT to expire");
  assert.equal(staff.viaApiKey, false);
});
