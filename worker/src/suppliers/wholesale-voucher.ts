/**
 * Voucher wholesale fulfilment (Tiqets / Bemyguest / Klook / KKday B2B shape).
 *
 * Contract (against the vendor base URL):
 *   POST /voucher/orders {productRef, serviceDate, quantity, idempotencyKey}
 *     -> 200 {reference} | 409 {code, reference} (idempotent replay)
 *   POST /voucher/orders/{reference}/tickets
 *     -> 200 {vouchers: [{code, barcode?, pdfUrl?}]}
 *   POST /voucher/orders/{reference}/cancel -> 200 {cancelled: true}
 *                                            | 409 {code: "CANCEL_REJECTED"}
 * Artefacts: `voucher:code:` / `voucher:barcode:` / `voucher:pdf:` (https
 * only). ACTIVITY domain only. No contracted credentials means this adapter is
 * never constructed — QR/barcode/PDF values always come from the supplier.
 */
import type { Env } from "../env.ts";
import { voucherArtefacts } from "../domain/wholesale-artefacts.ts";
import type { BookResult, CancelResult, SupplierAdapter, SupplierContext, TicketResult } from "./adapter.ts";
import { breakerAllows, breakerCooldownMs, recordBreakerFailure, recordBreakerSuccess } from "./circuit.ts";
import type { WholesaleConfig } from "./wholesale-config.ts";
import { wholesaleBreakerKey } from "./wholesale-config.ts";
import { asNonEmptyString, wholesaleFail, wholesalePost, wholesaleSku } from "./wholesale-client.ts";

const TIMEOUT_MS = 15_000;

export function voucherWholesaleAdapter(env: Env, cfg: WholesaleConfig): SupplierAdapter {
  const key = wholesaleBreakerKey(cfg.vendor);
  const idem = (p: string, c: SupplierContext) => `${p}_${c.bookingId}`;
  return {
    name: `wholesale:${cfg.vendor}`,
    async book(c): Promise<BookResult> {
      if (c.domain !== "ACTIVITY") return { outcome: "FAILED", code: "SUPPLIER_DOMAIN_UNSUPPORTED", message: "해당 공급사는 투어·티켓 상품만 처리합니다." };
      if (!breakerAllows(key, { cooldownMs: breakerCooldownMs(env) })) {
        return { outcome: "FAILED", code: "SUPPLIER_CIRCUIT_OPEN", message: "공급사 연결에 일시적 문제가 있어 예약을 받을 수 없습니다." };
      }
      const bk = await env.DB.prepare("SELECT supplier_id, service_start FROM bookings WHERE id = ?").bind(c.bookingId).first<{ supplier_id: string; service_start: string }>();
      const sku = bk ? await wholesaleSku(env.DB, bk.supplier_id, "ACTIVITY", c.itemId) : null;
      if (!bk || !sku) return { outcome: "UNKNOWN", message: "상품 연결 정보를 확인할 수 없습니다." };
      const r = await wholesalePost(cfg, "/voucher/orders", { productRef: sku, serviceDate: String(bk.service_start).slice(0, 10), quantity: Math.max(1, c.travelerCount), idempotencyKey: idem("ord", c) }, idem("ord", c), TIMEOUT_MS);
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
      const r = await wholesalePost(cfg, `/voucher/orders/${encodeURIComponent(ref)}/tickets`, { idempotencyKey: idem("tkt", c) }, idem("tkt", c), TIMEOUT_MS);
      if (!r || r.status >= 500) { recordBreakerFailure(key); return { outcome: "UNKNOWN", message: "이용권 응답을 확인할 수 없습니다." }; }
      if (r.status === 200) {
        const out = voucherArtefacts(r.json?.vouchers);
        if (out) { recordBreakerSuccess(key); return { outcome: "ISSUED", ticketNumbers: out }; }
        recordBreakerFailure(key);
        return { outcome: "UNKNOWN", message: "이용권 응답 형식이 올바르지 않습니다." };
      }
      recordBreakerFailure(key);
      const f = wholesaleFail(r.json, r.status);
      return { outcome: "FAILED", code: f.code, message: f.message };
    },
    async cancel(c): Promise<CancelResult> {
      const ref = c.supplierReference;
      if (!ref) return { outcome: "UNKNOWN", message: "취소할 공급사 주문 참조가 없습니다." };
      const r = await wholesalePost(cfg, `/voucher/orders/${encodeURIComponent(ref)}/cancel`, { idempotencyKey: idem("cxl", c) }, idem("cxl", c), TIMEOUT_MS);
      if (!r || r.status >= 500) { recordBreakerFailure(key); return { outcome: "UNKNOWN", message: "취소 응답을 확인할 수 없습니다." }; }
      if (r.status === 200 && r.json?.cancelled === true) { recordBreakerSuccess(key); return { outcome: "CANCELLED", reference: String(r.json?.reference || ref) }; }
      if (r.status === 409 || r.status === 400) { const f = wholesaleFail(r.json, r.status); return { outcome: "REJECTED", message: f.message }; }
      recordBreakerFailure(key);
      return { outcome: "UNKNOWN", message: "취소 응답 형식이 올바르지 않습니다." };
    },
  };
}
