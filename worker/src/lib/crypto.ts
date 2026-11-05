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
const PBKDF2_ITER = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const km = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, km, 256);
  return hex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2:sha256:${PBKDF2_ITER}:${hex(salt)}:${await pbkdf2(password, salt, PBKDF2_ITER)}`;
}

/**
 * Verify a password. Legacy static-salt SHA-256 hashes are still accepted so
 * existing users are not locked out (no email provider exists yet for resets),
 * but callers must re-hash on success (`needsRehash`).
 */
export async function verifyPasswordDetailed(password: string, stored: string | null | undefined): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith("pbkdf2:sha256:")) return { ok: await verifyPassword(password, stored), needsRehash: false };
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const ok = constantTimeEqual(await sha256Hex(password + "_gft_salt_2026"), stored);
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
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

export function maskPassport(p: string): string {
  return p.length <= 3 ? "***" : `${p.slice(0, 1)}${"*".repeat(Math.max(0, p.length - 3))}${p.slice(-2)}`;
}

/** Public display name: "김민지" -> "김*지", "Kim Minji" -> "K*******i", "이수" -> "이*". */
export function maskName(name: unknown): string {
  const chars = Array.from(String(name ?? "").trim());
  if (chars.length === 0) return "여행자";
  if (chars.length === 1) return `${chars[0]}*`;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}
