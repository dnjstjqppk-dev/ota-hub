import { HttpError } from "./http.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function hex(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(h: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) throw new Error("BAD_HEX");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

export function randomToken(bytes = 32): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Human-friendly, collision-resistant booking number: GFT-YYMMDD-XXXXXXXX (base32, 40 bits). */
export function newBookingNumber(now = new Date()): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const b of bytes) code += alphabet[b % 32];
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `GFT-${d}-${code}`;
}

// ---------------------------------------------------------------------------
// Passwords: PBKDF2-HMAC-SHA256, 100k iterations, 16-byte salt.
// ---------------------------------------------------------------------------
export const PBKDF2_ITER = 100_000;
export const PBKDF2_ITER_MIN = 10_000;
export const PBKDF2_ITER_MAX = 1_000_000;

// C9: iteration count is env-tunable (PBKDF2_ITERATIONS, clamped to the range
// verifyPassword accepts). Measured ~16ms wall for 100k on a desktop CPU;
// Workers isolates are slower per op, so the free 10ms CPU budget cannot take
// 100k — production must run on a paid plan, which is documented in
// docs/GO_LIVE_CHECKLIST.md instead of weakening the default. Logins re-hash
// automatically when the stored count drifts from the configured one.
export function resolvePbkdf2Iterations(env?: { PBKDF2_ITERATIONS?: string }): number {
  const n = Number(env?.PBKDF2_ITERATIONS);
  if (!Number.isInteger(n)) return PBKDF2_ITER;
  return Math.min(PBKDF2_ITER_MAX, Math.max(PBKDF2_ITER_MIN, n));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const km = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, km, 256);
  return hex(bits);
}

export async function hashPassword(password: string, iterations: number = PBKDF2_ITER): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = Number.isInteger(iterations) ? Math.min(PBKDF2_ITER_MAX, Math.max(PBKDF2_ITER_MIN, iterations)) : PBKDF2_ITER;
  return `pbkdf2:sha256:${iter}:${hex(salt)}:${await pbkdf2(password, salt, iter)}`;
}

/**
 * Verify a password. Legacy static-salt SHA-256 hashes are still accepted so
 * existing users are not locked out (no email provider exists yet for resets),
 * but callers must re-hash on success (`needsRehash`).
 */
export async function verifyPasswordDetailed(password: string, stored: string | null | undefined, expectedIterations: number = PBKDF2_ITER): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith("pbkdf2:sha256:")) {
    const ok = await verifyPassword(password, stored);
    const storedIter = Number(stored.split(":")[2]);
    return { ok, needsRehash: ok && storedIter !== expectedIterations };
  }
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const ok = constantTimeEqual(await sha256Hex(password + "_gft_salt_2026"), stored);
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
}

/** #97: legacy static-salt SHA-256 shape (64 lowercase hex, no pbkdf2 prefix). */
export function isLegacyHash(stored: string | null | undefined): boolean {
  return !!stored && !stored.startsWith("pbkdf2:sha256:") && /^[0-9a-f]{64}$/.test(stored);
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.startsWith("pbkdf2:sha256:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 5) return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) return false;
  let salt: Uint8Array;
  try {
    salt = fromHex(parts[3]);
  } catch {
    return false;
  }
  return constantTimeEqual(await pbkdf2(password, salt, iterations), parts[4]);
}

// ---------------------------------------------------------------------------
// JWT (HS256)
// ---------------------------------------------------------------------------
function b64url(s: string): string {
  return b64(enc.encode(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): string {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return dec.decode(unb64(t));
}

export const JWT_TTL_SECONDS = 7 * 24 * 3600;

export async function signJwt(payload: Record<string, unknown>, secret: string, ttl = JWT_TTL_SECONDS): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttl, jti: crypto.randomUUID() }));
  return `${h}.${p}.${await hmacSha256Hex(secret, `${h}.${p}`)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = JSON.parse(unb64url(h));
    if (header.alg !== "HS256") return null;
    if (!constantTimeEqual(sig, await hmacSha256Hex(secret, `${h}.${p}`))) return null;
    const payload = JSON.parse(unb64url(p));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.iat === "number" && payload.iat > now + 60) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PII field encryption (AES-256-GCM). Output: "v1:<iv b64>:<ciphertext b64>"
// ---------------------------------------------------------------------------
async function aesKey(keyB64: string): Promise<CryptoKey> {
  const raw = unb64(keyB64);
  if (raw.length !== 32) throw new Error("PII_ENC_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptField(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(plain));
  return `v1:${b64(iv)}:${b64(new Uint8Array(ct))}`;
}

export async function decryptField(blob: string, keyB64: string): Promise<string> {
  const [v, ivb, ctb] = blob.split(":");
  if (v !== "v1") throw new Error("UNKNOWN_CIPHER_VERSION");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivb) }, await aesKey(keyB64), unb64(ctb));
  return dec.decode(pt);
}

/**
 * #98: field-level PII encryption (bank/business numbers). New writes encrypt
 * when PII_ENC_KEY exists and stay plaintext otherwise (pre-existing posture
 * where the key was never provisioned); reads accept both shapes, so legacy
 * plaintext rows keep working with no backfill. Encrypted-but-keyless reads
 * fail loudly — a bank-transfer statement must never print undecryptable
 * bytes as an account number.
 */
export function isEncryptedField(v: string | null | undefined): boolean {
  return !!v && v.startsWith("v1:");
}

export async function encryptPiiField(plain: string | null, env: { PII_ENC_KEY?: string }): Promise<string | null> {
  if (!plain) return plain;
  const key = (env.PII_ENC_KEY || "").trim();
  if (!key) return plain;
  return encryptField(plain, key);
}

export async function decryptPiiField(stored: string | null | undefined, env: { PII_ENC_KEY?: string }): Promise<string | null> {
  if (!stored || !isEncryptedField(stored)) return stored ?? null;
  const key = (env.PII_ENC_KEY || "").trim();
  if (!key) throw new HttpError(503, "PII_KEY_MISSING", "암호화 키가 설정되지 않아 저장된 정보를 읽을 수 없습니다.");
  return decryptField(stored, key);
}

export function maskPassport(p: string): string {
  return p.length <= 3 ? "***" : `${p.slice(0, 1)}${"*".repeat(Math.max(0, p.length - 3))}${p.slice(-2)}`;
}

/**
 * #100: TOTP (RFC 6238, SHA-1, 30s step, 6 digits) for admin login MFA.
 * Secrets are 20 random bytes, base32 without padding.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const t = s.trim().replace(/=+$/, "").toUpperCase();
  if (!/^[A-Z2-7]*$/.test(t)) throw new Error("BAD_BASE32");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of t) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function newTotpSecret(bytes = 20): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const k = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  const off = mac[mac.length - 1] & 15;
  const code = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secretB32: string, code: string, nowSec = Math.floor(Date.now() / 1000), window = 1): Promise<boolean> {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  let secret: Uint8Array;
  try {
    secret = base32Decode(secretB32);
  } catch {
    return false;
  }
  if (!secret.length) return false;
  const step = Math.floor(nowSec / 30);
  for (let d = -window; d <= window; d++) {
    if (code === (await hotp(secret, step + d))) return true;
  }
  return false;
}

/** Public display name: "김민지" -> "김*지", "Kim Minji" -> "K*******i", "이수" -> "이*". */
export function maskName(name: unknown): string {
  const chars = Array.from(String(name ?? "").trim());
  if (chars.length === 0) return "여행자";
  if (chars.length === 1) return `${chars[0]}*`;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}
