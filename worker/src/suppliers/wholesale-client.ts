/**
 * Shared HTTPS client for wholesale connectors.
 *
 * Bearer auth, JSON bodies, caller-owned timeout, idempotency key per call.
 * Transport errors and timeouts answer null (outcome UNKNOWN); HTTP statuses
 * are mapped by the caller per the live-adapter contract. No retries here —
 * the queue saga owns them. No mock transport exists.
 */
import type { WholesaleConfig } from "./wholesale-config.ts";

export interface WholesaleReply {
  status: number;
  json: any;
}

export async function wholesalePost(
  cfg: WholesaleConfig,
  path: string,
  body: unknown,
  idempotencyKey: string,
  timeoutMs: number,
): Promise<WholesaleReply | null> {
  try {
    const res = await fetch(cfg.apiBase + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return null;
  }
}

/** Supplier refusal detail (4xx): code + message, never thrown. */
export function wholesaleFail(json: any, status: number): { code: string; message: string } {
  return {
    code: String(json?.code || `HTTP_${status}`),
    message: String(json?.message || "공급사 요청에 실패했습니다."),
  };
}

/** Non-empty trimmed string, or null. Artefact fields must pass this. */
export function asNonEmptyString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

type DbLike = {
  prepare(sql: string): { bind(...args: unknown[]): { first<T>(): Promise<T | null> } };
};

/**
 * Catalog item -> supplier SKU. Wired by the operator when contracted; null
 * means unwired and every caller fails closed (never guess a supplier code).
 */
export async function wholesaleSku(
  db: DbLike,
  supplierId: string,
  domain: string,
  itemId: string,
): Promise<string | null> {
  const row = await db.prepare(
    "SELECT sku FROM wholesale_skus WHERE supplier_id = ? AND domain_type = ? AND item_id = ?",
  ).bind(supplierId, domain, itemId).first<{ sku: string }>();
  return asNonEmptyString(row?.sku);
}
