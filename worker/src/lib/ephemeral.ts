import type { Env } from "../env.ts";

/**
 * TG-10: ephemeral auth state behind one contract. Rate counters, login
 * lockouts, revoked JTIs, session resets, and idempotency claims all share
 * the same shape on every backend: count/record in a sliding window, TTL'd
 * flags, claim-then-readback. D1 ships by default (d1Ephemeral); the harness
 * injects Redis; production Redis follows with the managed account.
 * Every method below mirrors the D1 SQL it replaces, statement for statement.
 */

export interface EphemeralStore {
  /** Hits in (now-window, now]. Used for pre-checks (429s must not feed the bucket). */
  count(key: string, nowSec: number, windowSec: number): Promise<number>;
  /** Record one hit (caller already passed the limit check). Label is informational. */
  recordHit(key: string, label: string, nowSec: number, windowSec: number): Promise<void>;
  /** Drop a counter / lockout (test isolation, failure clearing). */
  clear(key: string): Promise<void>;
  /** Revoke one JTI until its expiry (logout). */
  revokeJti(jti: string, expSec: number): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
  /** Cut off a subject's sessions at resetAtSec (password changes). */
  setReset(subjectId: string, resetAtSec: number): Promise<void>;
  getReset(subjectId: string): Promise<number | null>;
  /** Claim an idempotency key, then read back the winner's row (null hash = lost race). */
  claimIdem(scope: string, key: string, fingerprint: string): Promise<{ hash: string | null; status: number | null; body: string | null }>;
  storeIdem(scope: string, key: string, status: number, bodyJson: string): Promise<void>;
}

type DbLike = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
};

/** Production default: the exact D1 statements, lifted verbatim. */
export function d1Ephemeral(db: DbLike): EphemeralStore {
  return {
    async count(key, nowSec, windowSec) {
      const row = await db.prepare("SELECT COUNT(*) AS c FROM login_attempts WHERE ip_address = ? AND attempted_at > ?")
        .bind(key, nowSec - windowSec).first<{ c: number }>();
      return Number(row?.c || 0);
    },
    async recordHit(key, label, nowSec) {
      await db.prepare("INSERT INTO login_attempts (ip_address, email, attempted_at) VALUES (?, ?, ?)")
        .bind(key, label, nowSec).run();
    },
    async clear(key) {
      await db.prepare("DELETE FROM login_attempts WHERE ip_address = ?").bind(key).run();
    },
    async revokeJti(jti, expSec) {
      await db.prepare("INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)").bind(jti, expSec).run();
    },
    async isRevoked(jti) {
      return (await db.prepare("SELECT 1 AS x FROM revoked_tokens WHERE jti = ?").bind(jti).first()) !== null;
    },
    async setReset(subjectId, resetAtSec) {
      await db.prepare("INSERT INTO session_resets (subject_id, reset_at) VALUES (?, ?) ON CONFLICT(subject_id) DO UPDATE SET reset_at = excluded.reset_at")
        .bind(subjectId, resetAtSec).run();
    },
    async getReset(subjectId) {
      const rs = await db.prepare("SELECT reset_at FROM session_resets WHERE subject_id = ?").bind(subjectId).first<{ reset_at: number }>();
      return rs ? Number(rs.reset_at) : null;
    },
    async claimIdem(scope, key, fingerprint) {
      await db.prepare("INSERT OR IGNORE INTO idempotency_keys (scope, idem_key, request_hash) VALUES (?, ?, ?)")
        .bind(scope, key, fingerprint).run();
      const row = await db.prepare("SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE scope = ? AND idem_key = ?")
        .bind(scope, key).first<{ request_hash: string; status_code: number | null; response_json: string | null }>();
      if (!row) return { hash: null, status: null, body: null };
      return { hash: row.request_hash, status: row.status_code, body: row.response_json };
    },
    async storeIdem(scope, key, status, bodyJson) {
      await db.prepare("UPDATE idempotency_keys SET status_code = ?, response_json = ? WHERE scope = ? AND idem_key = ?")
        .bind(status, bodyJson, scope, key).run();
    },
  };
}

/** Try primary, fall back to secondary per operation. Redis outages degrade, never 503. */
export function withFallback(primary: EphemeralStore, secondary: EphemeralStore): EphemeralStore {
  const wrap = <A extends unknown[], R>(fn: (s: EphemeralStore) => (...a: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(primary)(...args);
      } catch {
        return await fn(secondary)(...args);
      }
    };
  return {
    count: wrap((s) => s.count.bind(s)),
    recordHit: wrap((s) => s.recordHit.bind(s)),
    clear: wrap((s) => s.clear.bind(s)),
    revokeJti: wrap((s) => s.revokeJti.bind(s)),
    isRevoked: wrap((s) => s.isRevoked.bind(s)),
    setReset: wrap((s) => s.setReset.bind(s)),
    getReset: wrap((s) => s.getReset.bind(s)),
    claimIdem: wrap((s) => s.claimIdem.bind(s)),
    storeIdem: wrap((s) => s.storeIdem.bind(s)),
  };
}

/** Injected store (harness) or the D1 default (production today). */
export function ephemeral(env: Env): EphemeralStore {
  return env.EPHEMERAL || d1Ephemeral(env.DB);
}
