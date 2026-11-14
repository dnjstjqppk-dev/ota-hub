// scripts/redis-store/redis-ephemeral.mjs
// TG-10: EphemeralStore over Redis (node client — harness/proof only; the
// worker stays dependency-free and production picks it up via Upstash REST).
// Shapes mirror the D1 tables exactly: sliding-window counters as ZSETs
// (score = epoch, pruned below the window edge), revocations as EXPIREAT
// strings, resets as persistent strings, idempotency as hashes with a 30d TTL
// (same retention the maintenance sweep enforces on D1).
import { createClient } from 'redis';

const IDEM_TTL_SEC = 30 * 86400;
const counterKey = (key) => `gft:rl:${key}`;
const jtiKey = (jti) => `gft:rev:${jti}`;
const resetKey = (subjectId) => `gft:reset:${subjectId}`;
const idemKey = (scope, key) => `gft:idem:${scope}:${key}`;

/**
 * Shared connect: explicit host/port (no URL-parse surprises), a no-op error
 * listener (an unlistened 'error' event EXITS the process), and fail-fast
 * reconnect (3 quick retries, then give up so the D1 fallback engages
 * instead of hanging requests; managed step may add re-probing).
 */
export async function connectRedis(url, dbIndex = 0) {
  const u = new URL(url);
  const client = createClient({
    database: dbIndex,
    socket: {
      host: u.hostname,
      port: Number(u.port || 6379),
      reconnectStrategy: (retries) => (retries > 3 ? false : 100),
    },
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

export async function redisEphemeral(url, dbIndex = 0) {
  const client = await connectRedis(url, dbIndex);
  const member = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    client,
    async count(key, nowSec, windowSec) {
      const k = counterKey(key);
      await client.zRemRangeByScore(k, 0, nowSec - windowSec);
      return client.zCard(k);
    },
    async recordHit(key, _label, nowSec, windowSec) {
      const k = counterKey(key);
      await client.zRemRangeByScore(k, 0, nowSec - windowSec);
      await client.zAdd(k, { score: nowSec, value: member() });
      await client.expire(k, windowSec + 300);
    },
    async clear(key) {
      await client.del(counterKey(key));
    },
    async revokeJti(jti, expSec) {
      // Already-expired tokens verify-fail before revocation is ever read;
      // skip the write (D1 keeps a prunable row, same observable behavior).
      if (expSec * 1000 <= Date.now()) return;
      await client.set(jtiKey(jti), '1', { EXAT: expSec });
    },
    async isRevoked(jti) {
      return (await client.exists(jtiKey(jti))) === 1;
    },
    async setReset(subjectId, resetAtSec) {
      await client.set(resetKey(subjectId), String(resetAtSec));
    },
    async getReset(subjectId) {
      const v = await client.get(resetKey(subjectId));
      return v === null ? null : Number(v);
    },
    async claimIdem(scope, key, fingerprint) {
      const k = idemKey(scope, key);
      await client.hSetNX(k, 'request_hash', fingerprint);
      await client.expire(k, IDEM_TTL_SEC);
      const h = await client.hGetAll(k);
      const status = h.status_code === undefined || h.status_code === '' ? null : Number(h.status_code);
      return { hash: h.request_hash ?? null, status, body: h.response_json ?? null };
    },
    async storeIdem(scope, key, status, bodyJson) {
      const k = idemKey(scope, key);
      await client.hSet(k, { status_code: String(status), response_json: bodyJson });
      await client.expire(k, IDEM_TTL_SEC);
    },
  };
}
