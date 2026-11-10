import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { HttpError, clientIp, json, readJson, str } from "../lib/http.ts";
import { hashPassword, newId, randomToken, resolvePbkdf2Iterations, sha256Hex, signJwt, verifyPasswordDetailed } from "../lib/crypto.ts";
import { audit, authCookie, clearAuthCookie, getAuthUser, jwtSecret, rateLimit, resetSubjectSessions, revokeCurrentToken } from "../lib/auth.ts";
import { consentStmts, currentVersions } from "../lib/consents.ts";
import { isEmailConfigured } from "../services/email-service.ts";

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function validatePasswordPolicy(pw: string): void {
  if (pw.length < 10 || pw.length > 128) throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 10자 이상 128자 이하여야 합니다.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 영문자와 숫자를 각각 1자 이상 포함해야 합니다.");
}
const validatePassword = validatePasswordPolicy;

function publicUser(u: any) {
  return { id: u.id, email: u.email, fullName: u.full_name, phoneNumber: u.phone_number, role: u.role || "USER", tier: u.tier, tripCoins: u.trip_coins, avatarUrl: u.avatar_url };
}

async function issueSession(env: Env, u: any) {
  const token = await signJwt({ id: u.id, email: u.email, fullName: u.full_name, role: u.role || "USER", tier: u.tier }, jwtSecret(env));
  return { token, cookie: authCookie(token, env) };
}

export async function handleAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/v1/auth/register" && method === "POST") {
    await rateLimit(request, env, "register", 50, 3600);
    const body = await readJson(request);
    const email = str(body.email, 254).toLowerCase();
    const password = String(body.password || "");
    const fullName = str(body.fullName || body.full_name, 80);
    const phone = str(body.phoneNumber || body.phone, 30);
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "INVALID_EMAIL", "유효한 이메일 주소를 입력해주세요.");
    validatePassword(password);
    if (!fullName) throw new HttpError(400, "NAME_REQUIRED", "이름을 입력해주세요.");
    if (body.agreeTerms !== true || body.agreePrivacy !== true) {
      throw new HttpError(400, "CONSENT_REQUIRED", "이용약관 및 개인정보 수집·이용에 동의해야 가입할 수 있습니다.");
    }
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) throw new HttpError(409, "EMAIL_TAKEN", "이미 가입된 이메일입니다. 로그인해주세요.");
    const id = newId("usr");
    const versions = await currentVersions(env.DB);
    const marketing = body.agreeMarketing === true;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, full_name, phone_number, role, tier, trip_coins, marketing_consent) VALUES (?, ?, ?, ?, ?, 'USER', 'SILVER', 0, ?)",
      ).bind(id, email, await hashPassword(password, resolvePbkdf2Iterations(env)), fullName, phone || null, marketing ? 1 : 0),
      ...consentStmts(env.DB, id, [
        { type: "TERMS", version: versions["terms"] || "2.0", agreed: true },
        { type: "PRIVACY", version: versions["privacy"] || "2.0", agreed: true },
        { type: "MARKETING", version: versions["privacy"] || "2.0", agreed: marketing },
      ], clientIp(request), request.headers.get("User-Agent")),
    ]);
    const u = { id, email, full_name: fullName, phone_number: phone, role: "USER", tier: "SILVER", trip_coins: 0 };
    const s = await issueSession(env, u);
    return json({ success: true, token: s.token, user: publicUser(u) }, 201, { "Set-Cookie": s.cookie });
  }

  if ((path === "/api/v1/auth/login" || path === "/api/v1/admin/login") && method === "POST") {
    await rateLimit(request, env, "login", 20, 900);
    const body = await readJson(request);
    const email = str(body.email, 254).toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) throw new HttpError(400, "CREDENTIALS_REQUIRED", "이메일과 비밀번호를 입력해주세요.");
    const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<any>();
    const v = await verifyPasswordDetailed(password, u?.password_hash, resolvePbkdf2Iterations(env));
    if (!u || !v.ok) {
      if (u?.role === "ADMIN") await audit(env, u.id, "LOGIN_FAILED", "AUTH", email, { ip: request.headers.get("CF-Connecting-IP") });
      throw new HttpError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 일치하지 않습니다.");
    }
    if (v.needsRehash) await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password, resolvePbkdf2Iterations(env)), u.id).run();
    if (u.status && u.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_SUSPENDED", u.status === "DELETED" ? "탈퇴한 계정입니다." : "이용이 정지된 계정입니다. 고객센터에 문의해주세요.");
    if (u.role === "ADMIN") await audit(env, u.id, "ADMIN_LOGIN_SUCCESS", "AUTH", email, { ip: request.headers.get("CF-Connecting-IP") });
    // #35: the admin portal gets its own jar so it never clobbers a user session in the same browser.
    const jar = path === "/api/v1/admin/login" ? "getfortrip_admin_jwt" : "getfortrip_jwt";
    const adminToken = await signJwt({ id: u.id, email: u.email, fullName: u.full_name, role: u.role || "USER", tier: u.tier }, jwtSecret(env));
    return json({ success: true, token: adminToken, user: publicUser(u) }, 200, { "Set-Cookie": authCookie(adminToken, env, jar as "getfortrip_jwt" | "getfortrip_admin_jwt") });
  }

  if (path === "/api/v1/auth/logout" && method === "POST") {
    await revokeCurrentToken(request, env);
    return json({ success: true }, 200, { "Set-Cookie": clearAuthCookie(env, "getfortrip_jwt") });
  }

  if (path === "/api/v1/admin/logout" && method === "POST") {
    await revokeCurrentToken(request, env);
    return json({ success: true }, 200, { "Set-Cookie": clearAuthCookie(env, "getfortrip_admin_jwt") });
  }

  // #37: authenticated password change. Verifies the current password (a live
  // session alone is not enough), then kills every session including this one:
  // the client must re-login with the new password (requireRelogin).
  if (path === "/api/v1/auth/me/password" && method === "POST") {
    const a = await getAuthUser(request, env);
    if (!a) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    await rateLimit(request, env, "pwchange", 10, 3600);
    const body = await readJson(request);
    const current = String(body.currentPassword || "");
    const next = String(body.newPassword || "");
    if (!current) throw new HttpError(400, "PASSWORD_REQUIRED", "현재 비밀번호를 입력해주세요.");
    validatePassword(next);
    const full = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(a.id).first<{ password_hash: string }>();
    if (!full || !(await verifyPasswordDetailed(current, full.password_hash)).ok) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "현재 비밀번호가 일치하지 않습니다.");
    }
    await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(await hashPassword(next, resolvePbkdf2Iterations(env)), a.id).run();
    await revokeCurrentToken(request, env);
    await resetSubjectSessions(env, a.id);
    await audit(env, a.id, "PASSWORD_CHANGED", "AUTH", a.email, { ip: request.headers.get("CF-Connecting-IP") });
    return json({ success: true, requireRelogin: true }, 200, { "Set-Cookie": clearAuthCookie(env, "getfortrip_jwt") });
  }

  if (path === "/api/v1/auth/me" && method === "GET") {
    const a = await getAuthUser(request, env);
    if (!a) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    const u = await env.DB.prepare("SELECT id, email, full_name, phone_number, role, tier, trip_coins, avatar_url, marketing_consent FROM users WHERE id = ?").bind(a.id).first<any>();
    if (!u) throw new HttpError(401, "UNAUTHORIZED", "사용자 정보를 찾을 수 없습니다.");
    const pu = { ...publicUser(u), marketingConsent: Number(u.marketing_consent) === 1 };
    return json({ ...pu, user: pu });
  }

  // Profile edit: name and phone only (email is the login identity and is not editable here).
  // marketingConsent toggles the marketing flag AND appends a consent record (A4).
  if (path === "/api/v1/auth/me" && method === "PATCH") {
    const a = await getAuthUser(request, env);
    if (!a) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    const body = await readJson(request);
    const fullName = str(body.fullName, 60);
    const phone = str(body.phoneNumber, 30);
    if (!fullName) throw new HttpError(400, "NAME_REQUIRED", "이름을 입력해주세요.");
    if (phone && !/^\+?[0-9][0-9 -]{6,28}$/.test(phone)) throw new HttpError(400, "INVALID_PHONE", "전화번호 형식이 올바르지 않습니다.");
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare("UPDATE users SET full_name = ?, phone_number = ? WHERE id = ?").bind(fullName, phone || null, a.id),
    ];
    if (body.marketingConsent !== undefined) {
      const agreed = body.marketingConsent === true;
      stmts.push(env.DB.prepare("UPDATE users SET marketing_consent = ? WHERE id = ?").bind(agreed ? 1 : 0, a.id));
      const versions = await currentVersions(env.DB);
      stmts.push(...consentStmts(env.DB, a.id, [
        { type: "MARKETING", version: versions["privacy"] || "2.0", agreed },
      ], clientIp(request), request.headers.get("User-Agent")));
    }
    await env.DB.batch(stmts);
    const u = await env.DB.prepare("SELECT id, email, full_name, phone_number, role, tier, trip_coins, avatar_url, marketing_consent FROM users WHERE id = ?").bind(a.id).first<any>();
    const pu = { ...publicUser(u), marketingConsent: Number(u.marketing_consent) === 1 };
    return json({ success: true, ...pu, user: pu });
  }

  if (path === "/api/v1/auth/forgot-password" && method === "POST") {
    await rateLimit(request, env, "forgot", 5, 3600);
    const body = await readJson(request);
    const email = str(body.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "INVALID_EMAIL", "유효한 이메일 주소를 입력해주세요.");
    const u = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
    if (u) {
      const token = randomToken(32);
      const tokenHash = await sha256Hex(token);
      const expires = Math.floor(Date.now() / 1000) + 1800;
      const site = env.PUBLIC_SITE_URL || "https://getfortrip.com";
      await env.DB.batch([
        env.DB.prepare("INSERT INTO password_reset_tokens (token, token_hash, user_id, email, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)")
          .bind(newId("rst"), tokenHash, u.id, email, expires),
        // The reset link is delivered only by email; the maintenance cron sends queued rows.
        env.DB.prepare("INSERT INTO notification_outbox (id, channel, recipient, template, payload_json, status) VALUES (?, 'EMAIL', ?, 'PASSWORD_RESET', ?, 'PENDING')")
          .bind(newId("ntf"), email, JSON.stringify({ link: `${site}/reset-password?token=${token}` })),
      ]);
    }
    // Same response whether or not the account exists (no account enumeration). Token never returned.
    if (!isEmailConfigured(env)) {
      return json({ success: true, message: "요청을 접수했어요. 다만 지금은 메일 발송 서비스가 준비 중이라 재설정 메일이 도착하지 않아요. 고객센터로 문의해 주세요.", emailDelivery: "NOT_CONFIGURED" });
    }
    return json({ success: true, message: "비밀번호 재설정 링크를 이메일로 보냈어요. 30분 안에 확인해주세요.", emailDelivery: "QUEUED" });
  }

  if (path === "/api/v1/auth/reset-password" && method === "POST") {
    await rateLimit(request, env, "reset", 10, 3600);
    const body = await readJson(request);
    const token = str(body.token, 128);
    const pw = String(body.newPassword || body.password || "");
    validatePassword(pw);
    const now = Math.floor(Date.now() / 1000);
    const rec = await env.DB.prepare("SELECT token, user_id FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ?")
      .bind(await sha256Hex(token), now).first<{ token: string; user_id: string }>();
    if (!rec) throw new HttpError(400, "INVALID_RESET_TOKEN", "만료되었거나 이미 사용된 링크입니다.");
    const r = await env.DB.batch([
      env.DB.prepare("UPDATE password_reset_tokens SET used = 1 WHERE token = ? AND used = 0").bind(rec.token),
      env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(await hashPassword(pw, resolvePbkdf2Iterations(env)), rec.user_id),
    ]);
    if (!r[0].meta.changes) throw new HttpError(400, "INVALID_RESET_TOKEN", "이미 사용된 링크입니다.");
    await resetSubjectSessions(env, rec.user_id);
    return json({ success: true, message: "비밀번호가 재설정되었습니다." });
  }

  if (path === "/api/v1/auth/me/withdraw" && method === "POST") {
    const user = await getAuthUser(request, env);
    if (!user) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    await rateLimit(request, env, "withdraw", 5, 3600);
    const body = await readJson(request);
    const pw = String(body.password || "");
    if (!pw) throw new HttpError(400, "PASSWORD_REQUIRED", "탈퇴하려면 비밀번호를 입력해주세요.");
    const full = await env.DB.prepare("SELECT password_hash, status FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string; status: string }>();
    if (!full) throw new HttpError(404, "USER_NOT_FOUND", "회원을 찾을 수 없습니다.");
    if (full.status === "DELETED") throw new HttpError(409, "ALREADY_WITHDRAWN", "이미 탈퇴한 계정입니다.");
    if (!(await verifyPasswordDetailed(pw, full.password_hash)).ok) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "비밀번호가 일치하지 않습니다.");
    }
    const blocker = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM bookings WHERE user_id = ? AND status NOT IN ('COMPLETED','CANCELLED','REFUNDED','FAILED','EXPIRED')"
    ).bind(user.id).first<{ c: number }>();
    if ((blocker?.c ?? 0) > 0) {
      throw new HttpError(409, "WITHDRAWAL_BLOCKED", `진행 중인 예약·환불 ${blocker!.c}건이 있어 탈퇴할 수 없습니다. 이용 완료 또는 환불 완료 후 다시 시도해주세요.`);
    }
    const deletedEmail = `deleted_${user.id}@deleted.local`;
    const unusableHash = await hashPassword(randomToken(32), resolvePbkdf2Iterations(env));
    const reason = str(body.reason, 300) || "USER_REQUEST";
    await env.DB.batch([
      // Profile and credential purge (anonymized, login-impossible afterwards).
      env.DB.prepare("UPDATE users SET email = ?, full_name = '탈퇴회원', phone_number = NULL, birth_date = NULL, password_hash = ?, trip_coins = 0, marketing_consent = 0, avatar_url = NULL, status = 'DELETED', deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), deletion_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .bind(deletedEmail, unusableHash, reason, user.id),
      env.DB.prepare("DELETE FROM saved_travelers WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM wishlist WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM price_alerts WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM user_coupons WHERE user_id = ?").bind(user.id),
      // E-Commerce Act Art. 6 retention isolation (contract/payment/dispute records kept 5y).
      env.DB.prepare("INSERT OR IGNORE INTO retained_records (id, user_id, record_type, record_id, retain_until, reason) SELECT 'rtn_' || id, ?, 'BOOKING', id, date('now','+5 years'), 'E_COMMERCE_ART6_CONTRACT' FROM bookings WHERE user_id = ?").bind(user.id, user.id),
      env.DB.prepare("INSERT OR IGNORE INTO retained_records (id, user_id, record_type, record_id, retain_until, reason) SELECT 'rtn_' || id, ?, 'PAYMENT', id, date('now','+5 years'), 'E_COMMERCE_ART6_PAYMENT' FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)").bind(user.id, user.id),
      env.DB.prepare("INSERT OR IGNORE INTO retained_records (id, user_id, record_type, record_id, retain_until, reason) SELECT 'rtn_' || id, ?, 'REFUND', id, date('now','+5 years'), 'E_COMMERCE_ART6_DISPUTE' FROM refunds WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)").bind(user.id, user.id),
    ]);
    await resetSubjectSessions(env, user.id);
    await audit(env, user.id, "ACCOUNT_WITHDRAWN", "USER", user.id, { reason });
    return json({ success: true, message: "회원탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다." });
  }

  if (path === "/api/v1/auth/dev-outbox" && method === "GET" && isNonProduction(env)) {
    // Development aid only: lets local QA read parked emails (e.g. reset links).
    const rows = await env.DB.prepare("SELECT recipient, template, payload_json, created_at FROM notification_outbox ORDER BY created_at DESC LIMIT 20").all();
    return json({ success: true, outbox: rows.results });
  }

  return null;
}
