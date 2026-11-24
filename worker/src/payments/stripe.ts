import type { Env } from "../env.ts";
import { constantTimeEqual } from "../lib/crypto.ts";
import type { ConfirmResult, LookupResult, PaymentProvider, RefundResult } from "./provider.ts";

/**
 * TG-17: Stripe Payments adapter (PaymentIntent + 3DS + refunds + disputes).
 *
 * Contract-tested against a local stub (worker/test/unit/stripe.test.ts);
 * go-live needs real keys only. Amounts ride the platform minor convention,
 * which matches Stripe's (zero-decimal currencies as-is, the rest in cents).
 *
 * 3DS: a requires_action PaymentIntent surfaces as ACTION_REQUIRED with the
 * Stripe-hosted action URL. The client completes authentication there, Stripe
 * redirects to /api/v1/payments/stripe/return, and reconciliation finalizes
 * through the normal UNKNOWN→lookup path (no second money movement).
 */

export interface StripeActionRequired {
  outcome: "ACTION_REQUIRED";
  paymentKey: string;
  actionUrl: string;
  raw: unknown;
}

export function stripeProvider(secretKey: string, publishableKey: string | undefined, apiBase?: string, returnBase?: string): PaymentProvider & { actionCapable: true } {
  const base = (apiBase || "").trim() || "https://api.stripe.com";
  const auth = "Basic " + btoa(`${secretKey}:`);
  const mode: "LIVE" | "SANDBOX" = secretKey.startsWith("sk_test_") ? "SANDBOX" : "LIVE";
  const returnUrl = `${(returnBase || "").trim().replace(/\/+$/, "") || "https://getfortrip.com"}/api/v1/payments/stripe/return`;

  async function call(path: string, form: URLSearchParams | null, idem: string, method = "POST"): Promise<{ status: number; body: any } | null> {
    try {
      const res = await fetch(base + path, {
        method,
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idem },
        body: form ? form.toString() : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch {
      return null; // network error / timeout => outcome unknown
    }
  }

  const errCode = (b: any, status: number): string => String(b?.error?.code || b?.error?.type || `HTTP_${status}`);
  const errMsg = (b: any): string => String(b?.error?.message || "Stripe 요청에 실패했습니다.");

  return {
    name: "stripe",
    mode,
    actionCapable: true as const,
    publicConfig: () => ({ provider: "stripe", mode, publishableKey: publishableKey || null }),
    async confirm({ orderId, paymentKey, amountMinor, currency, idempotencyKey, returnUrl: override }): Promise<ConfirmResult | StripeActionRequired> {
      const form = new URLSearchParams({
        amount: String(amountMinor),
        currency: String(currency || "KRW").toLowerCase(),
        payment_method: paymentKey,
        confirmation_method: "automatic",
        confirm: "true",
        return_url: override || returnUrl,
        "metadata[order_id]": orderId,
      });
      const r = await call("/v1/payment_intents", form, idempotencyKey);
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "PG 응답을 확인할 수 없습니다." };
      if (r.status === 200) {
        const st = String(r.body?.status || "");
        if (st === "succeeded") {
          const ch = r.body?.charges?.data?.[0] || {};
          return {
            outcome: "CAPTURED", paymentKey: String(r.body.id), amountMinor: Number(r.body.amount_received),
            method: ch?.payment_method_details?.card?.brand ? `CARD:${String(ch.payment_method_details.card.brand).toUpperCase()}` : "CARD",
            approvedAt: new Date(Number(r.body.created || 0) * 1000).toISOString(), raw: r.body,
          };
        }
        if (st === "requires_action") {
          const url = r.body?.next_action?.redirect_to_url?.url;
          // Stub mode (apiBase set, dev/test only) serves http loopback action
          // URLs; production requires https (open-redirect safety).
          const okUrl = typeof url === "string" && (url.startsWith("https://") ||
            (!!apiBase && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)));
          if (!okUrl) {
            return { outcome: "FAILED", code: "3DS_ACTION_MISSING", message: "3DS 인증 정보를 받지 못했습니다.", raw: r.body };
          }
          return { outcome: "ACTION_REQUIRED", paymentKey: String(r.body.id), actionUrl: url as string, raw: r.body };
        }
        return { outcome: "FAILED", code: errCode(r.body, r.status), message: errMsg(r.body), raw: r.body };
      }
      return { outcome: "FAILED", code: errCode(r.body, r.status), message: errMsg(r.body), raw: r.body };
    },
    async refund({ paymentKey, amountMinor, reason, idempotencyKey }): Promise<RefundResult> {
      const form = new URLSearchParams({ payment_intent: paymentKey, amount: String(amountMinor), reason: "requested_by_customer", "metadata[reason]": reason.slice(0, 200) });
      const r = await call("/v1/refunds", form, idempotencyKey);
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "PG 환불 응답을 확인할 수 없습니다." };
      if (r.status === 200 && String(r.body?.status || "") === "succeeded") {
        return { outcome: "SUCCEEDED", refundId: String(r.body.id), raw: r.body };
      }
      return { outcome: "FAILED", code: errCode(r.body, r.status), message: errMsg(r.body) };
    },
    async lookup({ paymentKey }): Promise<LookupResult> {
      if (!paymentKey) return { outcome: "NOT_CAPTURED" };
      const r = await call(`/v1/payment_intents/${encodeURIComponent(paymentKey)}`, null, `lookup_${paymentKey}`, "GET");
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "PG 조회 실패" };
      if (r.status === 404) return { outcome: "NOT_CAPTURED" };
      if (r.status !== 200) return { outcome: "UNKNOWN", message: `HTTP_${r.status}` };
      const st = String(r.body?.status || "");
      if (st === "succeeded") {
        const ch = r.body?.charges?.data?.[0] || {};
        return {
          outcome: "CAPTURED", paymentKey: String(r.body.id), amountMinor: Number(r.body.amount_received),
          method: ch?.payment_method_details?.card?.brand ? `CARD:${String(ch.payment_method_details.card.brand).toUpperCase()}` : "CARD",
          approvedAt: new Date(Number(r.body.created || 0) * 1000).toISOString(),
        };
      }
      if (st === "canceled") return { outcome: "NOT_CAPTURED" };
      return { outcome: "UNKNOWN", message: st }; // requires_action/payment_method/processing: in flight
    },
  };
}

export interface StripeDispute {
  id: string;
  amountMinor: number;
  currency: string;
  reason: string;
  status: string;
  chargeId: string;
  paymentIntentId: string | null;
}

/** Fetch one dispute + its charge's PaymentIntent (webhook verification path). */
export async function stripeDispute(env: Env, disputeId: string): Promise<StripeDispute | null> {
  try {
    const secret = (env.STRIPE_SECRET_KEY || "").trim();
    if (!secret || !disputeId.startsWith("dp_")) return null;
    const stub = (env.APP_ENV === "development" || env.APP_ENV === "test") ? (env.STRIPE_API_BASE || "").trim() : "";
    const base = stub || "https://api.stripe.com";
    const auth = "Basic " + btoa(`${secret}:`);
    const get = async (path: string): Promise<any | null> => {
      try {
        const res = await fetch(base + path, { headers: { Authorization: auth }, signal: AbortSignal.timeout(15_000) });
        if (res.status !== 200) return null;
        return await res.json().catch(() => null);
      } catch {
        return null;
      }
    };
    const d = await get(`/v1/disputes/${encodeURIComponent(disputeId)}`);
    if (!d || !d.id) return null;
    let paymentIntentId: string | null = null;
    if (d.charge) {
      const ch = await get(`/v1/charges/${encodeURIComponent(String(d.charge))}`);
      if (ch?.payment_intent) paymentIntentId = String(ch.payment_intent);
    }
    return {
      id: String(d.id), amountMinor: Number(d.amount || 0), currency: String(d.currency || "krw").toUpperCase(),
      reason: String(d.reason || "unknown"), status: String(d.status || "unknown"),
      chargeId: String(d.charge || ""), paymentIntentId,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a Stripe webhook signature (Stripe-Signature: t=...,v1=... over
 * `${t}.${rawBody}`, HMAC-SHA256 hex). Pure + unit-tested with a fixed vector.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  try {
    if (!header || !secret) return false;
    const parts = Object.fromEntries(header.split(",").map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? [] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }).filter((e) => e.length === 2) as string[][]);
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1 || !/^\d+$/.test(t)) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5-min replay window
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
    const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
    return v1.length === 64 && constantTimeEqual(hex, v1.toLowerCase());
  } catch {
    return false;
  }
}
