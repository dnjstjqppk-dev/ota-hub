/**
 * Wholesale sell-price math (pure, deterministic, unit-tested).
 *
 * Foreign Net -> KRW -> margin -> PG fee, in integer minor units:
 *   netKrw  = convert(netMinor, netCurrency -> KRW, fxToKrw)
 *   margin  = netKrw * marginBps
 *   fee     = (netKrw + margin) * pgFeeBps
 * Each step rounds half-up exactly once. Margin bands are contractual — ESIM
 * 20~40%, voucher 8~15% — and anything outside throws: the money gates refuse
 * rather than sell at an unapproved margin.
 */
import { convertMinor, percentOf } from "./money.ts";
import { QuoteError } from "./pricing.ts";

export const ESIM_MARGIN_BPS = { min: 2000, max: 4000 };
export const VOUCHER_MARGIN_BPS = { min: 800, max: 1500 };
/** Blended card-fee assumption (3%); callers override when contracted. */
export const WHOLESALE_PG_FEE_BPS = 300;

export interface WholesalePriceInput {
  kind: "ESIM" | "VOUCHER";
  netMinor: number;
  netCurrency: string;
  fxToKrw: number;
  marginBps: number;
  pgFeeBps?: number;
}

export interface WholesalePrice {
  netKrwMinor: number;
  marginMinor: number;
  feeMinor: number;
  totalMinor: number;
}

export function assertWholesaleMargin(kind: "ESIM" | "VOUCHER", bps: unknown): void {
  const band = kind === "ESIM" ? ESIM_MARGIN_BPS : VOUCHER_MARGIN_BPS;
  if (!Number.isInteger(bps) || (bps as number) < band.min || (bps as number) > band.max) {
    throw new QuoteError("MARGIN_OUT_OF_RANGE", `${kind} 마진율은 ${band.min / 100}~${band.max / 100}% 범위여야 합니다.`);
  }
}

export function wholesaleKrw(i: WholesalePriceInput): WholesalePrice {
  if (!Number.isSafeInteger(i.netMinor) || i.netMinor <= 0) {
    throw new QuoteError("INVALID_NET_PRICE", "공급사 Net 가격이 올바르지 않습니다.");
  }
  if (!Number.isFinite(i.fxToKrw) || i.fxToKrw <= 0) {
    throw new QuoteError("FX_RATE_MISSING", "적용할 환율 정보를 확인할 수 없습니다.");
  }
  assertWholesaleMargin(i.kind, i.marginBps);
  const feeBps = i.pgFeeBps ?? WHOLESALE_PG_FEE_BPS;
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new QuoteError("INVALID_PG_FEE", "PG 수수료율이 올바르지 않습니다.");
  }
  const netKrw = convertMinor(i.netMinor, i.netCurrency, "KRW", { [i.netCurrency]: i.fxToKrw, KRW: 1 });
  const margin = percentOf(netKrw, i.marginBps);
  const fee = percentOf(netKrw + margin, feeBps);
  return { netKrwMinor: netKrw, marginMinor: margin, feeMinor: fee, totalMinor: netKrw + margin + fee };
}
