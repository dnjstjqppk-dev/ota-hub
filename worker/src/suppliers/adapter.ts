/**
 * Supplier adapters. A booking is only confirmed when the supplier says so.
 *
 * - simulator: deterministic test double (development/test only). Scenario is
 *   chosen per booking via `simulation` in the booking request.
 * - direct_contract: inventory contracted directly with a partner and held in
 *   our database. Confirmation is performed by an operator / partner in the
 *   admin OMS (book() returns PENDING), never automatically.
 * - api: placeholder for real supplier APIs (bed-banks etc.). No such
 *   integration exists today; calls return FAILED rather than fake success.
 * - ndc: airline direct-connect fulfilment (TG-18). Needs env (base + key);
 *   without it, calls fail honestly as SUPPLIER_NOT_CONFIGURED.
 * - gds: aggregator fulfilment (TG-18). Same configuration rule as ndc.
 */
import type { Env } from "../env.ts";
import { newId } from "../lib/crypto.ts";
import { liveSupplierAdapter, resolveLiveConfig } from "./live-adapter.ts";
import { resolveWholesaleConfig } from "./wholesale-config.ts";
import { esimWholesaleAdapter } from "./wholesale-esim.ts";
import { voucherWholesaleAdapter } from "./wholesale-voucher.ts";

export type BookResult =
  | { outcome: "CONFIRMED"; reference: string; pnr: string | null }
  | { outcome: "PENDING"; reference: string | null }
  | { outcome: "FAILED"; code: string; message: string }
  | { outcome: "UNKNOWN"; message: string };

export type TicketResult =
  | { outcome: "ISSUED"; ticketNumbers: string[] }
  | { outcome: "FAILED"; code: string; message: string }
  | { outcome: "UNKNOWN"; message: string };

export type CancelResult =
  | { outcome: "CANCELLED"; reference: string }
  | { outcome: "REJECTED"; message: string }
  | { outcome: "UNKNOWN"; message: string };

export interface Simulation {
  supplier?: "confirm" | "fail" | "timeout" | "pending";
  ticketing?: "ok" | "fail" | "timeout";
  cancel?: "ok" | "reject" | "timeout";
}

export interface SupplierContext {
  bookingId: string;
  domain: string;
  itemId: string;
  travelerCount: number;
  supplierReference: string | null;
  simulation: Simulation;
}

export interface FlightOffer {
  offerId: string;
  airline: string;
  flightNo: string;
  from: string;
  to: string;
  date: string;
  amountMinor: number;
  currency: string;
  expiresAt: string;
}

export interface OfferQuery {
  origin: string;
  destination: string;
  date: string;
  adults: number;
  airline?: string;
}

export type OfferResult =
  | { outcome: "OK"; offers: FlightOffer[] }
  | { outcome: "FAILED"; code: string; message: string }
  | { outcome: "UNKNOWN"; message: string };

export interface SupplierAdapter {
  name: string;
  book(c: SupplierContext): Promise<BookResult>;
  ticket(c: SupplierContext): Promise<TicketResult>;
  cancel(c: SupplierContext): Promise<CancelResult>;
  /** Live offer shopping (TG-18). Absent on adapters without offer support. */
  offers?(q: OfferQuery): Promise<OfferResult>;
}

function ref(prefix: string): string {
  return `${prefix}-${newId("x").slice(2, 12).toUpperCase()}`;
}

function pnr(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => a[b % a.length]).join("");
}

export const simulatorAdapter: SupplierAdapter = {
  name: "simulator",
  async book(c) {
    switch (c.simulation.supplier || "confirm") {
      case "fail":
        return { outcome: "FAILED", code: "NO_AVAILABILITY", message: "공급사 잔여 재고 없음 (시뮬레이터)" };
      case "timeout":
        return { outcome: "UNKNOWN", message: "공급사 응답 시간 초과 (시뮬레이터)" };
      case "pending":
        return { outcome: "PENDING", reference: ref("SIM") };
      default:
        return { outcome: "CONFIRMED", reference: ref("SIM"), pnr: c.domain === "FLIGHT" ? pnr() : null };
    }
  },
  async ticket(c) {
    if (c.simulation.ticketing === "fail") return { outcome: "FAILED", code: "TICKETING_REJECTED", message: "발권 거절 (시뮬레이터)" };
    if (c.simulation.ticketing === "timeout") return { outcome: "UNKNOWN", message: "발권 응답 시간 초과 (시뮬레이터)" };
    return { outcome: "ISSUED", ticketNumbers: Array.from({ length: c.travelerCount }, (_, i) => `999-${String(Date.now()).slice(-7)}${i}`) };
  },
  async cancel(c) {
    if (c.simulation.cancel === "reject") return { outcome: "REJECTED", message: "공급사 취소 거절 (시뮬레이터)" };
    if (c.simulation.cancel === "timeout") return { outcome: "UNKNOWN", message: "공급사 취소 응답 없음 (시뮬레이터)" };
    return { outcome: "CANCELLED", reference: ref("SIMCXL") };
  },
};

export const directContractAdapter: SupplierAdapter = {
  name: "direct_contract",
  async book() {
    // Operator / partner must confirm in the OMS.
    return { outcome: "PENDING", reference: null };
  },
  async ticket() {
    return { outcome: "FAILED", code: "TICKETING_NOT_SUPPORTED", message: "직계약 상품은 발권 대상이 아닙니다." };
  },
  async cancel(c) {
    // Direct-contract cancellations are recorded locally; partner is notified via outbox.
    return { outcome: "CANCELLED", reference: `DC-CXL-${c.bookingId.slice(-8)}` };
  },
};

const notIntegrated: SupplierAdapter = {
  name: "none",
  async book() {
    return { outcome: "FAILED", code: "SUPPLIER_NOT_INTEGRATED", message: "공급사 연동이 없습니다." };
  },
  async ticket() {
    return { outcome: "FAILED", code: "SUPPLIER_NOT_INTEGRATED", message: "공급사 연동이 없습니다." };
  },
  async cancel() {
    return { outcome: "UNKNOWN", message: "공급사 연동이 없어 취소를 자동 처리할 수 없습니다." };
  },
};

const notConfigured: SupplierAdapter = {
  name: "none",
  async book() {
    return { outcome: "FAILED", code: "SUPPLIER_NOT_CONFIGURED", message: "공급사 API 설정이 없어 예약할 수 없습니다." };
  },
  async ticket() {
    return { outcome: "FAILED", code: "SUPPLIER_NOT_CONFIGURED", message: "공급사 API 설정이 없어 발권할 수 없습니다." };
  },
  async cancel() {
    // Never unwind blindly: without a configured API the cancel cannot be
    // verified at the supplier, so it parks for manual review.
    return { outcome: "UNKNOWN", message: "공급사 API 설정이 없어 취소를 자동 처리할 수 없습니다." };
  },
};

/**
 * TG-18: ndc/gds need env (API base + key + DB manifest). Without env — or
 * without a usable base/key pair — they resolve to the honest notConfigured
 * adapter instead of throwing, so every caller keeps working.
 */
export function adapterFor(name: string, env?: Env, vendor?: string | null): SupplierAdapter {
  if (name === "simulator") return simulatorAdapter;
  if (name === "direct_contract") return directContractAdapter;
  if (name === "ndc" || name === "gds") {
    if (!env) return notConfigured;
    const cfg = resolveLiveConfig(env, name);
    if (!cfg) return notConfigured;
    return liveSupplierAdapter(env, cfg);
  }
  if (name === "wholesale") {
    const cfg = env && vendor ? resolveWholesaleConfig(env, vendor) : null;
    if (!env || !cfg) return notConfigured;
    return cfg.kind === "ESIM" ? esimWholesaleAdapter(env, cfg) : voucherWholesaleAdapter(env, cfg);
  }
  return notIntegrated;
}
