/**
 * Payment provider abstraction.
 *
 * - "toss": Toss Payments server-side confirm/cancel/lookup. Request/response
 *   shapes are contract-tested against a stub (worker/test/unit/toss.test.ts);
 *   only real merchant keys are still pending (test_ first, then live_).
 * - "sandbox": deterministic local simulator for automated tests. Refused unless
 *   APP_ENV is development/test, and every payment it produces is tagged
 *   mode=SANDBOX in the database and UI.
 *
 * When no provider is configured, payments are disabled and the API says so.
 */
import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { HttpError } from "../lib/http.ts";

export type ConfirmResult =
  | { outcome: "CAPTURED"; paymentKey: string; amountMinor: number; method: string; approvedAt: string; raw: unknown }
  | { outcome: "FAILED"; code: string; message: string; raw: unknown }
  | { outcome: "UNKNOWN"; message: string };

export type RefundResult =
  | { outcome: "SUCCEEDED"; refundId: string; raw: unknown }
  | { outcome: "FAILED"; code: string; message: string }
  | { outcome: "UNKNOWN"; message: string };

export type LookupResult =
  | { outcome: "CAPTURED"; paymentKey: string; amountMinor: number; method: string; approvedAt: string }
  | { outcome: "NOT_CAPTURED" }
  | { outcome: "UNKNOWN"; message: string };

export interface PaymentProvider {
  name: string;
  mode: "LIVE" | "SANDBOX";
  publicConfig(): Record<string, unknown>;
  confirm(i: { orderId: string; paymentKey: string; amountMinor: number; currency: string; idempotencyKey: string }): Promise<ConfirmResult>;
  refund(i: { paymentKey: string; amountMinor: number; reason: string; idempotencyKey: string }): Promise<RefundResult>;
  lookup(i: { orderId: string; paymentKey: string | null; amountMinor: number }): Promise<LookupResult>;
}

// ---------------------------------------------------------------------------
// Sandbox simulator. paymentKey format: "sbx_<scenario>_<random>"
//   ok          -> captured
//   declined    -> card declined
//   timeout     -> provider response lost (payment actually captured; lookup reveals it)
//   refundfail  -> captured, but every refund attempt fails
//   mismatch    -> captured a different amount (exercises the PG_AMOUNT_MISMATCH path)
//   lost        -> provider response lost and nothing captured (lookup reveals NOT_CAPTURED)
// ---------------------------------------------------------------------------
export function sandboxProvider(): PaymentProvider {
  const scenario = (key: string) => key.split("_")[1] || "ok";
  return {
    name: "sandbox",
    mode: "SANDBOX",
    publicConfig: () => ({ provider: "sandbox", mode: "SANDBOX", scenarios: ["ok", "declined", "timeout", "refundfail", "mismatch", "lost"] }),
    async confirm({ paymentKey, amountMinor }) {
      if (!/^sbx_[a-z]+_[A-Za-z0-9]{6,}$/.test(paymentKey)) {
        return { outcome: "FAILED", code: "INVALID_PAYMENT_KEY", message: "유효하지 않은 결제 키입니다.", raw: null };
      }
      const s = scenario(paymentKey);
      if (s === "declined") return { outcome: "FAILED", code: "REJECT_CARD_PAYMENT", message: "카드사에서 결제를 거절했습니다. (테스트)", raw: { scenario: s } };
      if (s === "timeout") return { outcome: "UNKNOWN", message: "PG 응답 시간 초과 (테스트)" };
      if (s === "lost") return { outcome: "UNKNOWN", message: "PG 응답 분실, 미결제 확인됨 (테스트)" };
      if (s === "mismatch") return { outcome: "CAPTURED", paymentKey, amountMinor: amountMinor + 1, method: "CARD(SANDBOX)", approvedAt: new Date().toISOString(), raw: { scenario: s } };
      return { outcome: "CAPTURED", paymentKey, amountMinor, method: "CARD(SANDBOX)", approvedAt: new Date().toISOString(), raw: { scenario: s } };
    },
    async refund({ paymentKey, idempotencyKey }) {
      if (scenario(paymentKey) === "refundfail") return { outcome: "FAILED", code: "REFUND_REJECTED", message: "PG 환불 실패 (테스트)" };
      return { outcome: "SUCCEEDED", refundId: `sbx_rf_${idempotencyKey}`, raw: null };
    },
    async lookup({ paymentKey, amountMinor }) {
      if (!paymentKey) return { outcome: "NOT_CAPTURED" };
      const s = scenario(paymentKey);
      if (s === "declined" || s === "lost") return { outcome: "NOT_CAPTURED" };
      // For "timeout" the simulated PG did capture: reconciliation must discover it.
      return { outcome: "CAPTURED", paymentKey, amountMinor, method: "CARD(SANDBOX)", approvedAt: new Date().toISOString() };
    },
  };
}

// ---------------------------------------------------------------------------
// Toss Payments (server-to-server). Docs: https://docs.tosspayments.com/reference
// ---------------------------------------------------------------------------
export function tossProvider(secretKey: string, clientKey: string | undefined, apiBase?: string): PaymentProvider {
  const base = (apiBase || "").trim() || "https://api.tosspayments.com/v1";
  const auth = "Basic " + btoa(`${secretKey}:`);
  const mode: "LIVE" | "SANDBOX" = secretKey.startsWith("test_") ? "SANDBOX" : "LIVE";

  async function call(path: string, init: RequestInit & { idem?: string }): Promise<{ status: number; body: any } | null> {
    try {
      const headers: Record<string, string> = { Authorization: auth, "Content-Type": "application/json" };
      if (init.idem) headers["Idempotency-Key"] = init.idem;
      const res = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(15_000) });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch {
      return null; // network error / timeout => outcome unknown
    }
  }

  return {
    name: "toss",
    mode,
    publicConfig: () => ({ provider: "toss", mode, clientKey: clientKey || null }),
    async confirm({ orderId, paymentKey, amountMinor, idempotencyKey }) {
      const r = await call("/payments/confirm", { method: "POST", body: JSON.stringify({ paymentKey, orderId, amount: amountMinor }), idem: idempotencyKey });
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "PG 응답을 확인할 수 없습니다." };
      if (r.status === 200 && r.body?.status === "DONE") {
        return { outcome: "CAPTURED", paymentKey: r.body.paymentKey, amountMinor: Number(r.body.totalAmount), method: String(r.body.method || "CARD"), approvedAt: String(r.body.approvedAt || new Date().toISOString()), raw: r.body };
      }
      return { outcome: "FAILED", code: String(r.body?.code || `HTTP_${r.status}`), message: String(r.body?.message || "결제 승인에 실패했습니다."), raw: r.body };
    },
    async refund({ paymentKey, amountMinor, reason, idempotencyKey }) {
      const r = await call(`/payments/${encodeURIComponent(paymentKey)}/cancel`, { method: "POST", body: JSON.stringify({ cancelReason: reason.slice(0, 200), cancelAmount: amountMinor }), idem: idempotencyKey });
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "PG 환불 응답을 확인할 수 없습니다." };
      if (r.status === 200) {
        const last = Array.isArray(r.body?.cancels) ? r.body.cancels[r.body.cancels.length - 1] : null;
        return { outcome: "SUCCEEDED", refundId: String(last?.transactionKey || idempotencyKey), raw: r.body };
      }
      return { outcome: "FAILED", code: String(r.body?.code || `HTTP_${r.status}`), message: String(r.body?.message || "환불에 실패했습니다.") };
    },
    async lookup({ orderId }) {
      const r = await call(`/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "PG 조회 실패" };
      if (r.status === 404) return { outcome: "NOT_CAPTURED" };
      if (r.status === 200 && r.body?.status === "DONE") {
        return { outcome: "CAPTURED", paymentKey: r.body.paymentKey, amountMinor: Number(r.body.totalAmount), method: String(r.body.method || "CARD"), approvedAt: String(r.body.approvedAt) };
      }
      return r.status === 200 ? { outcome: "NOT_CAPTURED" } : { outcome: "UNKNOWN", message: `HTTP_${r.status}` };
    },
  };
}

/** Resolve the configured provider, or null if payments are disabled. */
export function getPaymentProvider(env: Env): PaymentProvider | null {
  const p = (env.PAYMENT_PROVIDER || "").toLowerCase();
  if (p === "sandbox") {
    if (!isNonProduction(env)) return null; // never in production
    return sandboxProvider();
  }
  if (p === "toss" && env.TOSS_SECRET_KEY) {
    // TOSS_API_BASE exists only to aim the contract tests at a stub. Production always talks to Toss.
    const stub = isNonProduction(env) ? (env.TOSS_API_BASE || "").trim() : "";
    return tossProvider(env.TOSS_SECRET_KEY, env.TOSS_CLIENT_KEY, stub || undefined);
  }
  return null;
}

export function requirePaymentProvider(env: Env): PaymentProvider {
  const p = getPaymentProvider(env);
  if (!p) throw new HttpError(503, "PAYMENTS_DISABLED", "현재 온라인 결제가 활성화되어 있지 않습니다. (PG 계약/설정 대기)");
  return p;
}
