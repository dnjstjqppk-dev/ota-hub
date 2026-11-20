/**
 * eSIM wholesale fulfilment (Roamify / RedteaGO / Airalo Partner shape).
 *
 * Contract (against the vendor base URL):
 *   POST /esim/orders {planRef, quantity, idempotencyKey}
 *     -> 200 {reference, iccid?} | 409 {code, reference} (idempotent replay)
 *   POST /esim/orders/{reference}/credentials -> 200 {lpa, qrPayload, iccid?}
 *   POST /esim/orders/{reference}/cancel -> 200 {cancelled: true}
 *                                          | 409 {code: "CANCEL_REJECTED"}
 * Artefact strings: `esim:lpa:<LPA>` / `esim:qr:<payload>`. ESIM domain only.
 * Without contracted credentials this adapter is never constructed, so nothing
 * here can mint an eSIM on its own (Zero-Mock: no ICCID/QR is ever invented).
 */
import type { Env } from "../env.ts";
import type { BookResult, CancelResult, SupplierAdapter, SupplierContext, TicketResult } from "./adapter.ts";
import { breakerAllows, breakerCooldownMs, recordBreakerFailure, recordBreakerSuccess } from "./circuit.ts";
import type { WholesaleConfig } from "./wholesale-config.ts";
import { wholesaleBreakerKey } from "./wholesale-config.ts";
import { asNonEmptyString, wholesaleFail, wholesalePost, wholesaleSku } from "./wholesale-client.ts";

const TIMEOUT_MS = 15_000;

export function esimWholesaleAdapter(env: Env, cfg: WholesaleConfig): SupplierAdapter {
  const key = wholesaleBreakerKey(cfg.vendor);
  const idem = (p: string, c: SupplierContext) => `${p}_${c.bookingId}`;
  return {
    name: `wholesale:${cfg.vendor}`,
    async book(c): Promise<BookResult> {
      if (c.domain !== "ESIM") return { outcome: "FAILED", code: "SUPPLIER_DOMAIN_UNSUPPORTED", message: "해당 공급사는 eSIM 상품만 처리합니다." };
      if (!breakerAllows(key, { cooldownMs: breakerCooldownMs(env) })) {
        return { outcome: "FAILED", code: "SUPPLIER_CIRCUIT_OPEN", message: "공급사 연결에 일시적 문제가 있어 예약을 받을 수 없습니다." };
      }
      const sid = await env.DB.prepare("SELECT supplier_id FROM bookings WHERE id = ?").bind(c.bookingId).first<{ supplier_id: string }>();
      const sku = sid ? await wholesaleSku(env.DB, sid.supplier_id, "ESIM", c.itemId) : null;
      if (!sku) return { outcome: "UNKNOWN", message: "상품 연결 정보를 확인할 수 없습니다." };
      const r = await wholesalePost(cfg, "/esim/orders", { planRef: sku, quantity: Math.max(1, c.travelerCount), idempotencyKey: idem("ord", c) }, idem("ord", c), TIMEOUT_MS);
      if (!r || r.status >= 500) { recordBreakerFailure(key); return { outcome: "UNKNOWN", message: "공급사 응답을 확인할 수 없습니다." }; }
      if (r.status === 200 || r.status === 409) {
        const reference = asNonEmptyString(r.json?.reference);
        if (reference) { recordBreakerSuccess(key); return { outcome: "CONFIRMED", reference, pnr: null }; }
        if (r.status === 409) { recordBreakerFailure(key); const f = wholesaleFail(r.json, r.status); return { outcome: "FAILED", code: f.code, message: f.message }; }
        recordBreakerFailure(key);
        return { outcome: "UNKNOWN", message: "공급사 응답 형식이 올바르지 않습니다." };
      }
      recordBreakerFailure(key);
      const f = wholesaleFail(r.json, r.status);
      return { outcome: "FAILED", code: f.code, message: f.message };
    },
    async ticket(c): Promise<TicketResult> {
      const ref = c.supplierReference;
      if (!ref) return { outcome: "FAILED", code: "TICKET_NO_REFERENCE", message: "발급할 공급사 주문 참조가 없습니다." };
      const r = await wholesalePost(cfg, `/esim/orders/${encodeURIComponent(ref)}/credentials`, { idempotencyKey: idem("cred", c) }, idem("cred", c), TIMEOUT_MS);
      if (!r || r.status >= 500) { recordBreakerFailure(key); return { outcome: "UNKNOWN", message: "개통 정보 응답을 확인할 수 없습니다." }; }
      if (r.status === 200) {
        const lpa = asNonEmptyString(r.json?.lpa);
        const qr = asNonEmptyString(r.json?.qrPayload);
        if (lpa && qr) { recordBreakerSuccess(key); return { outcome: "ISSUED", ticketNumbers: [`esim:lpa:${lpa}`, `esim:qr:${qr}`] }; }
        recordBreakerFailure(key);
        return { outcome: "UNKNOWN", message: "개통 정보 형식이 올바르지 않습니다." };
      }
      recordBreakerFailure(key);
      const f = wholesaleFail(r.json, r.status);
      return { outcome: "FAILED", code: f.code, message: f.message };
    },
    async cancel(c): Promise<CancelResult> {
      const ref = c.supplierReference;
      if (!ref) return { outcome: "UNKNOWN", message: "취소할 공급사 주문 참조가 없습니다." };
      const r = await wholesalePost(cfg, `/esim/orders/${encodeURIComponent(ref)}/cancel`, { idempotencyKey: idem("cxl", c) }, idem("cxl", c), TIMEOUT_MS);
      if (!r || r.status >= 500) { recordBreakerFailure(key); return { outcome: "UNKNOWN", message: "취소 응답을 확인할 수 없습니다." }; }
      if (r.status === 200 && r.json?.cancelled === true) { recordBreakerSuccess(key); return { outcome: "CANCELLED", reference: String(r.json?.reference || ref) }; }
      if (r.status === 409 || r.status === 400) { const f = wholesaleFail(r.json, r.status); return { outcome: "REJECTED", message: f.message }; }
      recordBreakerFailure(key);
      return { outcome: "UNKNOWN", message: "취소 응답 형식이 올바르지 않습니다." };
    },
  };
}
