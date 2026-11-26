/**
 * CR-06 social login (Kakao, Google, Naver) — OAuth 2.0 authorization-code flow.
 *
 *   GET  /api/v1/auth/oauth/providers             configured providers only
 *   GET  /api/v1/auth/oauth/:p/start?returnTo=…   302 to the provider (state in a signed HttpOnly cookie)
 *   GET  /api/v1/auth/oauth/:p/callback           302 back to the site with a one-time handoff in the URL fragment
 *   POST /api/v1/auth/oauth/exchange {handoff}    single-use handoff -> session (cookie + memory token)
 *   POST /api/v1/auth/oauth/complete {signup,…}   first-time sign-up after explicit terms/privacy consent
 *
 * Tokens minted here are signed with a derived key ("<JWT_SECRET>:oauth"), so a
 * handoff or sign-up ticket can never be replayed as a session token. Handoffs
 * ride in the URL fragment (never sent to servers or in Referer) and are
 * revoked on first use. Accounts are linked by e-mail only when the provider
 * asserts the address is verified; otherwise the user signs in with a password.
 */
import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { HttpError, allowedOrigin, clientIp, json, readJson, str } from "../lib/http.ts";
import { authCookie, jwtSecret, rateLimit } from "../lib/auth.ts";
import { newId, randomToken, signJwt, verifyJwt } from "../lib/crypto.ts";
import { ephemeral } from "../lib/ephemeral.ts";
import { consentStmts, currentVersions } from "../lib/consents.ts";
import { EMAIL_RE, SOCIAL_ONLY_HASH, publicUser } from "./auth.ts";

export type ProviderId = "kakao" | "google" | "naver";
export interface SocialProfile { sub: string; email: string | null; emailVerified: boolean; name: string | null }

interface ProviderDef {
  label: string;
  authorize: string;
  token: string;
  profile: string;
  scope: string | null;
  secretRequired: boolean;
  normalize(raw: any): SocialProfile;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  kakao: {
    label: "카카오", authorize: "https://kauth.kakao.com/oauth/authorize", token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me", scope: "account_email profile_nickname", secretRequired: false,
    normalize: (r) => {
      const acc = r?.kakao_account || {};
      const email = typeof acc.email === "string" ? acc.email.toLowerCase() : null;
      return { sub: r?.id === undefined || r?.id === null ? "" : String(r.id), email, emailVerified: Boolean(email && acc.is_email_verified === true && acc.is_email_valid !== false), name: acc.profile?.nickname || r?.properties?.nickname || null };
    },
  },
  google: {
    label: "Google", authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    profile: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid email profile", secretRequired: true,
    normalize: (r) => {
      const email = typeof r?.email === "string" ? r.email.toLowerCase() : null;
      return { sub: String(r?.sub || ""), email, emailVerified: Boolean(email && (r.email_verified === true || r.email_verified === "true")), name: r?.name || null };
    },
  },
  naver: {
    label: "네이버", authorize: "https://nid.naver.com/oauth2.0/authorize", token: "https://nid.naver.com/oauth2.0/token",
    profile: "https://openapi.naver.com/v1/nid/me", scope: null, secretRequired: true,
    // Naver asserts no verification flag, so its e-mail never auto-links an existing account.
    normalize: (r) => {
      const p = r?.resultcode === "00" ? r.response || {} : {};
      const email = typeof p.email === "string" ? p.email.toLowerCase() : null;
      return { sub: String(p.id || ""), email, emailVerified: false, name: p.name || p.nickname || null };
    },
  },
};

const KEYS: Record<ProviderId, { id: keyof Env; secret: keyof Env }> = {
  kakao: { id: "OAUTH_KAKAO_CLIENT_ID", secret: "OAUTH_KAKAO_CLIENT_SECRET" },
  google: { id: "OAUTH_GOOGLE_CLIENT_ID", secret: "OAUTH_GOOGLE_CLIENT_SECRET" },
  naver: { id: "OAUTH_NAVER_CLIENT_ID", secret: "OAUTH_NAVER_CLIENT_SECRET" },
};

const STATE_COOKIE = "getfortrip_oauth";
const STATE_TTL = 600;
const HANDOFF_TTL = 120;
const SIGNUP_TTL = 900;

export function providerCreds(env: Env, p: ProviderId): { clientId: string; clientSecret: string } | null {
  const clientId = String(env[KEYS[p].id] || "").trim();
  const clientSecret = String(env[KEYS[p].secret] || "").trim();
  if (!clientId) return null;
  if (PROVIDERS[p].secretRequired && !clientSecret) return null;
  return { clientId, clientSecret };
}

export function configuredProviders(env: Env): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => providerCreds(env, p));
}

const oauthKey = (env: Env) => `${jwtSecret(env)}:oauth`;

/** Development/test may route every provider host to a contract stub; production never does. */
function endpoint(env: Env, p: ProviderId, kind: "authorize" | "token" | "profile"): string {
  const stub = isNonProduction(env) ? String(env.OAUTH_STUB_BASE || "").replace(/\/+$/, "") : "";
  return stub ? `${stub}/${p}/${kind}` : PROVIDERS[p][kind];
}

function siteBase(env: Env, url: URL): string {
  return String(env.PUBLIC_SITE_URL || url.origin).replace(/\/+$/, "");
}

/**
 * Where to land after login: an absolute URL on an allow-listed origin, or a
 * same-site path. Anything else (protocol-relative, other hosts) falls back to "/".
 */
export function resolveReturnTo(raw: string | null, env: Env, url: URL): { origin: string; path: string } {
  const fallback = { origin: siteBase(env, url), path: "/" };
  const v = String(raw || "").trim();
  if (!v) return fallback;
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) return { origin: fallback.origin, path: v.slice(0, 300) };
  try {
    const u = new URL(v);
    const ok = allowedOrigin(u.origin, env);
    if (ok) return { origin: u.origin, path: (u.pathname + u.search).slice(0, 300) || "/" };
  } catch { /* not a URL */ }
  return fallback;
}

function redirectUri(env: Env, url: URL, p: ProviderId): string {
  return `${String(env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/+$/, "")}/api/v1/auth/oauth/${p}/callback`;
}

function stateCookie(env: Env, value: string, maxAge: number): string {
  const secure = isNonProduction(env) ? "" : " Secure;";
  return `${STATE_COOKIE}=${value}; Path=/api/v1/auth/oauth; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
}

/** Land on the site's callback page; secrets go in the fragment, the error code in the query. */
function landing(origin: string, returnPath: string, fragment: Record<string, string> | null, error: string | null): string {
  const q = new URLSearchParams({ returnTo: returnPath });
  if (error) q.set("error", error);
  const frag = fragment ? `#${new URLSearchParams(fragment).toString()}` : "";
  return `${origin}/oauth/callback?${q.toString()}${frag}`;
}

async function fetchJson(input: string, init: RequestInit): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(input, { ...init, signal: ctl.signal });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new HttpError(502, "OAUTH_PROVIDER_ERROR", "소셜 로그인 제공자 응답이 올바르지 않습니다.");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function exchangeCode(env: Env, url: URL, p: ProviderId, code: string, state: string): Promise<SocialProfile> {
  const creds = providerCreds(env, p)!;
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: creds.clientId, redirect_uri: redirectUri(env, url, p), code });
  if (creds.clientSecret) form.set("client_secret", creds.clientSecret);
  if (p === "naver") form.set("state", state);
  const tok = await fetchJson(endpoint(env, p, "token"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8", Accept: "application/json" }, body: form.toString() });
  const access = typeof tok?.access_token === "string" ? tok.access_token : "";
  if (!access) throw new HttpError(502, "OAUTH_TOKEN_MISSING", "소셜 로그인 토큰을 받지 못했습니다.");
  const raw = await fetchJson(endpoint(env, p, "profile"), { headers: { Authorization: `Bearer ${access}`, Accept: "application/json" } });
  const prof = PROVIDERS[p].normalize(raw);
  if (!prof.sub) throw new HttpError(502, "OAUTH_PROFILE_INVALID", "소셜 계정 정보를 확인할 수 없습니다.");
  return prof;
}

async function sessionFor(env: Env, user: any) {
  const token = await signJwt({ id: user.id, email: user.email, fullName: user.full_name, role: user.role || "USER", tier: user.tier }, jwtSecret(env));
  return { token, cookie: authCookie(token, env) };
}

/** Verify a handoff/sign-up ticket and burn it (single use). */
async function consumeTicket(env: Env, raw: unknown, kind: "login" | "signup"): Promise<Record<string, any>> {
  const t = typeof raw === "string" ? raw : "";
  const payload = t ? await verifyJwt(t, oauthKey(env)) : null;
  if (!payload || payload.t !== kind || typeof payload.jti !== "string") {
    throw new HttpError(400, "OAUTH_TICKET_INVALID", "로그인 정보가 만료됐어요. 소셜 로그인을 다시 시도해주세요.");
  }
  const store = ephemeral(env);
  if (await store.isRevoked(payload.jti)) throw new HttpError(400, "OAUTH_TICKET_USED", "이미 사용된 로그인 정보예요. 소셜 로그인을 다시 시도해주세요.");
  await store.revokeJti(payload.jti, payload.exp);
  return payload;
}

export async function handleOAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/auth/oauth/")) return null;
  const method = request.method;
  const db = env.DB;

  if (path === "/api/v1/auth/oauth/providers" && method === "GET") {
    return json({ success: true, providers: configuredProviders(env).map((id) => ({ id, label: PROVIDERS[id].label })) });
  }

  const pm = path.match(/^\/api\/v1\/auth\/oauth\/(kakao|google|naver)\/(start|callback)$/);
  if (pm && method === "GET") {
    const p = pm[1] as ProviderId;
    const creds = providerCreds(env, p);
    if (!creds) throw new HttpError(404, "OAUTH_PROVIDER_DISABLED", `${PROVIDERS[p].label} 로그인은 현재 제공되지 않습니다.`);

    if (pm[2] === "start") {
      await rateLimit(request, env, "oauth_start", 60, 600);
      const ret = resolveReturnTo(url.searchParams.get("returnTo"), env, url);
      const nonce = randomToken(16);
      const state = await signJwt({ t: "state", n: nonce, p, o: ret.origin, r: ret.path }, oauthKey(env), STATE_TTL);
      const q = new URLSearchParams({ response_type: "code", client_id: creds.clientId, redirect_uri: redirectUri(env, url, p), state: nonce });
      if (PROVIDERS[p].scope) q.set("scope", PROVIDERS[p].scope!);
      if (p === "google") q.set("prompt", "select_account");
      return redirect(`${endpoint(env, p, "authorize")}?${q.toString()}`, [stateCookie(env, state, STATE_TTL)]);
    }

    // ---- callback ----
    await rateLimit(request, env, "oauth_callback", 60, 600);
    const clear = stateCookie(env, "", 0);
    const st = await verifyJwt(readCookie(request, STATE_COOKIE) || "", oauthKey(env));
    const stateParam = url.searchParams.get("state") || "";
    if (!st || st.t !== "state" || st.p !== p || !stateParam || st.n !== stateParam) {
      return redirect(landing(siteBase(env, url), "/login", null, "STATE_MISMATCH"), [clear]);
    }
    const back = { origin: allowedOrigin(String(st.o), env) || siteBase(env, url), path: String(st.r || "/") };
    if (url.searchParams.get("error")) return redirect(landing(back.origin, back.path, null, "CANCELLED"), [clear]);
    const code = url.searchParams.get("code") || "";
    if (!code) return redirect(landing(back.origin, back.path, null, "CODE_MISSING"), [clear]);

    let prof: SocialProfile;
    try {
      prof = await exchangeCode(env, url, p, code, stateParam);
    } catch {
      return redirect(landing(back.origin, back.path, null, "PROVIDER_ERROR"), [clear]);
    }
    const PROVIDER = p.toUpperCase();
    const linked = await db.prepare(
      "SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_user_id = ?",
    ).bind(PROVIDER, prof.sub).first<any>();
    const user = linked;
    if (!user && prof.email) {
      // An existing account with this e-mail is NEVER auto-linked, even when
      // the provider verified the address (2026-11-27 review): we never proved
      // that the account's creator owns it (/auth/register and oauth/complete
      // accept any typed e-mail), so linking would log the real owner into a
      // pre-registered attacker account. They sign in with the password instead.
      if (await db.prepare("SELECT id FROM users WHERE email = ?").bind(prof.email).first()) {
        return redirect(landing(back.origin, back.path, null, "EMAIL_IN_USE"), [clear]);
      }
    }
    if (user) {
      if ((user.status || "ACTIVE") !== "ACTIVE") return redirect(landing(back.origin, back.path, null, "ACCOUNT_SUSPENDED"), [clear]);
      if (user.role !== "USER") return redirect(landing(back.origin, back.path, null, "ROLE_NOT_ALLOWED"), [clear]);
      await db.prepare("UPDATE user_identities SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE provider = ? AND provider_user_id = ?").bind(PROVIDER, prof.sub).run();
      const handoff = await signJwt({ t: "login", uid: user.id }, oauthKey(env), HANDOFF_TTL);
      return redirect(landing(back.origin, back.path, { handoff }, null), [clear]);
    }
    const signup = await signJwt({ t: "signup", p: PROVIDER, sub: prof.sub, email: prof.email, ev: prof.emailVerified, name: prof.name }, oauthKey(env), SIGNUP_TTL);
    return redirect(landing(back.origin, back.path, { signup, name: prof.name || "", email: prof.email || "" }, null), [clear]);
  }

  if (path === "/api/v1/auth/oauth/exchange" && method === "POST") {
    await rateLimit(request, env, "oauth_exchange", 30, 600);
    const t = await consumeTicket(env, (await readJson(request)).handoff, "login");
    const u = await db.prepare("SELECT * FROM users WHERE id = ?").bind(String(t.uid)).first<any>();
    if (!u || (u.status || "ACTIVE") !== "ACTIVE" || u.role !== "USER") throw new HttpError(403, "ACCOUNT_SUSPENDED", "이용할 수 없는 계정입니다.");
    const s = await sessionFor(env, u);
    return json({ success: true, token: s.token, user: publicUser(u) }, 200, { "Set-Cookie": s.cookie });
  }

  if (path === "/api/v1/auth/oauth/complete" && method === "POST") {
    await rateLimit(request, env, "register", 50, 3600);
    const body = await readJson(request);
    if (body.agreeTerms !== true || body.agreePrivacy !== true) {
      throw new HttpError(400, "CONSENT_REQUIRED", "이용약관 및 개인정보 수집·이용에 동의해야 가입할 수 있습니다.");
    }
    // Validate the typed fields before burning the ticket so a typo doesn't force a new provider round-trip.
    const peek = await verifyJwt(String(body.signup || ""), oauthKey(env));
    const email = String(peek?.email || str(body.email, 254)).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "INVALID_EMAIL", "유효한 이메일 주소를 입력해주세요.");
    const fullName = str(body.fullName, 80) || str(peek?.name, 80);
    if (!fullName) throw new HttpError(400, "NAME_REQUIRED", "이름을 입력해주세요.");
    if (await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first()) {
      throw new HttpError(409, "EMAIL_EXISTS", "이미 가입된 이메일입니다. 이메일로 로그인해주세요.");
    }
    const t = await consumeTicket(env, body.signup, "signup");
    if (await db.prepare("SELECT id FROM user_identities WHERE provider = ? AND provider_user_id = ?").bind(String(t.p), String(t.sub)).first()) {
      throw new HttpError(409, "SOCIAL_ALREADY_LINKED", "이미 가입된 소셜 계정입니다. 소셜 로그인을 다시 시도해주세요.");
    }
    const id = newId("usr");
    const versions = await currentVersions(db);
    const marketing = body.agreeMarketing === true;
    await db.batch([
      db.prepare("INSERT INTO users (id, email, password_hash, full_name, role, tier, trip_coins, marketing_consent) VALUES (?, ?, ?, ?, 'USER', 'SILVER', 0, ?)")
        .bind(id, email, SOCIAL_ONLY_HASH, fullName, marketing ? 1 : 0),
      db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_user_id, email, last_login_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
        .bind(newId("uid"), id, String(t.p), String(t.sub), t.email || null),
      ...consentStmts(db, id, [
        { type: "TERMS", version: versions["terms"] || "2.0", agreed: true },
        { type: "PRIVACY", version: versions["privacy"] || "2.0", agreed: true },
        { type: "MARKETING", version: versions["privacy"] || "2.0", agreed: marketing },
      ], clientIp(request), request.headers.get("User-Agent")),
    ]);
    const u = { id, email, full_name: fullName, role: "USER", tier: "SILVER", trip_coins: 0 };
    const s = await sessionFor(env, u);
    return json({ success: true, token: s.token, user: publicUser(u) }, 201, { "Set-Cookie": s.cookie });
  }

  return null;
}
