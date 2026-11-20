/**
 * Pre-checkout wholesale verification (500 ms budget, fail-closed).
 *
 * Right before a booking is created the supplier re-confirms stock and its
 * Net price; the KRW sell price is recomputed from Net + FX + margin + PG fee
 * and must match the quote total exactly. Drift expires the quote with
 * PRICE_CHANGED (same as catalog drift); timeouts, unmapped SKUs, and missing
 * FX/margin refuse the sale instead of assuming anything.
 */
import type { Env } from "../env.ts";
import { HttpError } from "../lib/http.ts";
import { wholesaleKrw } from "../domain/wholesale-pricing.ts";
import { breakerCooldownMs, breakerStatus, recordBreakerFailure, recordBreakerSuccess } from "../suppliers/circuit.ts";
import { resolveWholesaleConfig, wholesaleBreakerKey, wholesaleKind } from "../suppliers/wholesale-config.ts";
import { wholesalePost, wholesaleSku } from "../suppliers/wholesale-client.ts";
import type { SupplierRow } from "./catalog.ts";

export const WHOLESALE_VERIFY_TIMEOUT_MS = 500;

export interface WholesaleVerifyInput {
  domain: string;
  itemId: string;
  serviceDate: string;
  quantity: number;
  expectedTotalMinor: number;
  quoteId: string;
}

export async function verifyWholesaleQuote(env: Env, supplier: SupplierRow, input: WholesaleVerifyInput): Promise<number> {
  const kind = wholesaleKind(supplier.wholesale_vendor);
  const cfg = supplier.wholesale_vendor ? resolveWholesaleConfig(env, supplier.wholesale_vendor) : null;
  if (!kind || !cfg) throw new HttpError(503, "SUPPLIER_NOT_CONFIGURED", "공급사 API 설정이 없어 예약할 수 없습니다.");
  const key = wholesaleBreakerKey(cfg.vendor);
  const st = breakerStatus(key, { cooldownMs: breakerCooldownMs(env) });
  if (st.state === "OPEN") throw new HttpError(503, "SUPPLIER_CIRCUIT_OPEN", "공급사 연결에 일시적 문제가 있어 예약을 받을 수 없습니다.", { retryAfterSec: st.retryAfterSec });
  const sku = await wholesaleSku(env.DB, supplier.id, input.domain, input.itemId);
  if (!sku) throw new HttpError(503, "WHOLESALE_SKU_UNMAPPED", "해당 상품은 공급사 연결 정보가 없어 예약할 수 없습니다.");
  if (!Number.isInteger(supplier.wholesale_margin_bps)) throw new HttpError(503, "WHOLESALE_MARGIN_UNSET", "해당 상품은 공급사 마진율이 설정되지 않아 예약할 수 없습니다.");
  const fx = await env.DB.prepare("SELECT currency, rate_to_krw FROM fx_rates").all<{ currency: string; rate_to_krw: number }>();
  const table: Record<string, number> = {};
  for (const r of fx.results || []) table[r.currency] = Number(r.rate_to_krw);
  const r = await wholesalePost(cfg, "/verify", { sku, serviceDate: input.serviceDate, quantity: input.quantity }, `vrf_${input.quoteId}`, WHOLESALE_VERIFY_TIMEOUT_MS);
  if (!r || r.status >= 500) { recordBreakerFailure(key); throw new HttpError(503, "SUPPLIER_VERIFY_TIMEOUT", "공급사 재고 확인에 실패했습니다. 잠시 후 다시 시도해주세요."); }
  if (r.status !== 200) { recordBreakerFailure(key); throw new HttpError(503, "SUPPLIER_VERIFY_FAILED", "공급사 재고 확인에 실패했습니다. 잠시 후 다시 시도해주세요."); }
  if (r.json?.available !== true) { recordBreakerSuccess(key); throw new HttpError(409, "SOLD_OUT", "선택하신 일정의 잔여 재고가 부족합니다."); }
  const netMinor = r.json?.netMinor;
  const netCurrency = String(r.json?.netCurrency || "");
  const rate = table[netCurrency];
  if (!Number.isSafeInteger(netMinor) || netMinor <= 0 || !Number.isFinite(rate) || rate <= 0) {
    recordBreakerFailure(key);
    throw new HttpError(503, "SUPPLIER_PRICE_UNAVAILABLE", "공급사 가격을 확인할 수 없어 예약할 수 없습니다.");
  }
  let live: { totalMinor: number };
  try {
    live = wholesaleKrw({ kind, netMinor, netCurrency, fxToKrw: rate, marginBps: supplier.wholesale_margin_bps as number });
  } catch (e) {
    recordBreakerFailure(key);
    throw new HttpError(503, "WHOLESALE_PRICE_INVALID", `공급사 가격 설정 오류로 예약할 수 없습니다 (${String((e as Error)?.message || "PRICE").slice(0, 120)}).`);
  }
  recordBreakerSuccess(key);
  if (live.totalMinor !== input.expectedTotalMinor) {
    await env.DB.prepare("UPDATE quotes SET status = 'EXPIRED' WHERE id = ?").bind(input.quoteId).run();
    throw new HttpError(409, "PRICE_CHANGED", "가격이 변경되었습니다. 변경된 금액을 확인해주세요.", { previousTotalMinor: input.expectedTotalMinor, newTotalMinor: live.totalMinor });
  }
  return live.totalMinor;
}
