import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { hashPassword, newId, randomToken, sha256Hex, signJwt, verifyPasswordDetailed } from "../lib/crypto.ts";
import { audit, authCookie, getAuthUser, jwtSecret, rateLimit } from "../lib/auth.ts";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function validatePassword(pw: string): void {
  if (pw.length < 10 || pw.length > 128) throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 10자 이상 128자 이하여야 합니다.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 영문자와 숫자를 각각 1자 이상 포함해야 합니다.");
}

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
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, full_name, phone_number, role, tier, trip_coins, marketing_consent) VALUES (?, ?, ?, ?, ?, 'USER', 'SILVER', 0, ?)",
    ).bind(id, email, await hashPassword(password), fullName, phone || null, body.agreeMarketing === true ? 1 : 0).run();
    const u = { id, email, full_name: fullName, phone_number: phone, role: "USER", tier: "SILVER", trip_coins: 0 };
    const s = await issueSession(env, u);
    return json({ success: true, token: s.token, user: publicUser(u) }, 201, { "Set-Cookie": s.cookie });
  }

  if (path === "/api/v1/auth/login" && method === "POST") {
    await rateLimit(request, env, "login", 20, 900);
    const body = await readJson(request);
    const email = str(body.email, 254).toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) throw new HttpError(400, "CREDENTIALS_REQUIRED", "이메일과 비밀번호를 입력해주세요.");
    const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<any>();
    const v = await verifyPasswordDetailed(password, u?.password_hash);
    if (!u || !v.ok) {
      if (u?.role === "ADMIN") await audit(env, u.id, "LOGIN_FAILED", "AUTH", email, { ip: request.headers.get("CF-Connecting-IP") });
      throw new HttpError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 일치하지 않습니다.");
    }
    if (v.needsRehash) await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), u.id).run();
    if (u.role === "ADMIN") await audit(env, u.id, "ADMIN_LOGIN_SUCCESS", "AUTH", email, { ip: request.headers.get("CF-Connecting-IP") });
    const s = await issueSession(env, u);
    return json({ success: true, token: s.token, user: publicUser(u) }, 200, { "Set-Cookie": s.cookie });
  }

  if (path === "/api/v1/auth/logout" && method === "POST") {
    return json({ success: true }, 200, { "Set-Cookie": "getfortrip_jwt=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });
  }

  if (path === "/api/v1/auth/me" && method === "GET") {
    const a = await getAuthUser(request, env);
    if (!a) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    const u = await env.DB.prepare("SELECT id, email, full_name, phone_number, role, tier, trip_coins, avatar_url FROM users WHERE id = ?").bind(a.id).first<any>();
    if (!u) throw new HttpError(401, "UNAUTHORIZED", "사용자 정보를 찾을 수 없습니다.");
    const pu = publicUser(u);
    return json({ ...pu, user: pu });
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
        // The reset link is delivered only by email. No email provider is configured yet,
        // so the message is parked in the outbox (status BLOCKED_NO_PROVIDER).
        env.DB.prepare("INSERT INTO notification_outbox (id, channel, recipient, template, payload_json, status) VALUES (?, 'EMAIL', ?, 'PASSWORD_RESET', ?, 'BLOCKED_NO_PROVIDER')")
          .bind(newId("ntf"), email, JSON.stringify({ link: `${site}/reset-password?token=${token}` })),
      ]);
    }
    // Same response whether or not the account exists (no account enumeration). Token never returned.
    return json({ success: true, message: "가입된 이메일이라면 비밀번호 재설정 안내가 발송됩니다.", emailDelivery: "NOT_CONFIGURED" });
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
      env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(await hashPassword(pw), rec.user_id),
    ]);
    if (!r[0].meta.changes) throw new HttpError(400, "INVALID_RESET_TOKEN", "이미 사용된 링크입니다.");
    return json({ success: true, message: "비밀번호가 재설정되었습니다." });
  }

  if (path === "/api/v1/auth/dev-outbox" && method === "GET" && isNonProduction(env)) {
    // Development aid only: lets local QA read parked emails (e.g. reset links).
    const rows = await env.DB.prepare("SELECT recipient, template, payload_json, created_at FROM notification_outbox ORDER BY created_at DESC LIMIT 20").all();
    return json({ success: true, outbox: rows.results });
  }

  return null;
}
