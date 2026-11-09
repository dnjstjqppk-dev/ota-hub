import type { Env } from "../env.ts";
import { HttpError } from "./http.ts";
import { sha256Hex } from "./crypto.ts";

/**
 * Generic Idempotency-Key support backed by the idempotency_keys table
 * (scope, key) with a stored request fingerprint and response.
 *
 * Flow: fingerprint the request -> INSERT OR IGNORE a claim row -> read it
 * back. Same key + different fingerprint is a 422 (key reuse across different
 * requests). Same key + same fingerprint + stored response replays the stored
 * response without re-executing. Callers store the response after executing.
 *
 * This closes sequential retries (double submit, timeout retry). Concurrent
 * same-key twins can both pass the read-back; callers with concurrent writers
 * must additionally fence on their own conditional write (e.g. the coin CAS).
 */
export async function idempotencyPrecheck(
  env: Env,
  scope: string,
  key: string,
  parts: string[],
): Promise<{ fingerprint: string; replay: { status: number; body: unknown } | null }> {
  const fingerprint = await sha256Hex(parts.join("\u0000"));
  await env.DB.prepare("INSERT OR IGNORE INTO idempotency_keys (scope, idem_key, request_hash) VALUES (?, ?, ?)")
    .bind(scope, key, fingerprint).run();
  const row = await env.DB.prepare("SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE scope = ? AND idem_key = ?")
    .bind(scope, key).first<{ request_hash: string; status_code: number | null; response_json: string | null }>();
  if (!row || row.request_hash !== fingerprint) {
    throw new HttpError(422, "IDEMPOTENCY_KEY_REUSED", "이 Idempotency-Key는 다른 요청에 이미 사용되었습니다.");
  }
  if (row.status_code !== null && row.status_code !== undefined && row.response_json) {
    return { fingerprint, replay: { status: row.status_code, body: JSON.parse(row.response_json) } };
  }
  return { fingerprint, replay: null };
}

export async function idempotencyStore(
  env: Env,
  scope: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  await env.DB.prepare("UPDATE idempotency_keys SET status_code = ?, response_json = ? WHERE scope = ? AND idem_key = ?")
    .bind(status, JSON.stringify(body).slice(0, 8000), scope, key).run();
}
