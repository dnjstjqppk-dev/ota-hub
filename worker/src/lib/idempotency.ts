import type { Env } from "../env.ts";
import { HttpError } from "./http.ts";
import { sha256Hex } from "./crypto.ts";
import { ephemeral } from "./ephemeral.ts";

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
  const row = await ephemeral(env).claimIdem(scope, key, fingerprint);
  if (row.hash === null || row.hash !== fingerprint) {
    throw new HttpError(422, "IDEMPOTENCY_KEY_REUSED", "이 Idempotency-Key는 다른 요청에 이미 사용되었습니다.");
  }
  if (row.status !== null && row.status !== undefined && row.body) {
    return { fingerprint, replay: { status: row.status, body: JSON.parse(row.body) } };
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
  await ephemeral(env).storeIdem(scope, key, status, JSON.stringify(body).slice(0, 8000));
}
