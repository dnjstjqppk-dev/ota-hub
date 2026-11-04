/**
 * Money primitives. All amounts are stored and computed as integers in the
 * currency's minor unit (KRW: 0 decimals, USD: 2 decimals, JPY: 0 decimals...).
 * Floating point is only used when applying an FX rate, and the result is
 * rounded exactly once.
 */

export const CURRENCY_DECIMALS: Record<string, number> = {
  KRW: 0,
  JPY: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CNY: 2,
};

/** Currencies the platform can actually charge. Limited by PG contract (KRW only today). */
export const CHARGE_CURRENCIES = ["KRW"] as const;

export function decimalsOf(currency: string): number {
  const d = CURRENCY_DECIMALS[currency.toUpperCase()];
  if (d === undefined) throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
  return d;
}

export function assertMinor(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`INVALID_MINOR_AMOUNT:${label}=${value}`);
  }
  return value;
}

/** Convert a major-unit catalog value (e.g. 550000 KRW stored as REAL) into minor units. */
export function toMinor(major: number, currency: string): number {
  if (!Number.isFinite(major)) throw new Error(`INVALID_AMOUNT:${major}`);
  const d = decimalsOf(currency);
  // Round half away from zero on the decimal representation to avoid 1.005 -> 1.00 drift.
  const sign = major < 0 ? -1 : 1;
  const scaled = Number((Math.abs(major) * 10 ** d).toFixed(6));
  return assertMinor(sign * Math.round(scaled));
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** decimalsOf(currency);
}

/** Integer percentage of an amount, rounded half-up. rateBps = basis points (10000 = 100%). */
export function percentOf(minor: number, rateBps: number): number {
  assertMinor(minor);
  assertMinor(rateBps, "rateBps");
  return Math.floor((minor * rateBps + 5000) / 10000);
}

/**
 * Convert an amount between currencies using a rate expressed as
 * "1 unit of `from` = rateToKrw KRW" style tables.
 */
export function convertMinor(
  minor: number,
  from: string,
  to: string,
  rateToKrw: Record<string, number>,
): number {
  if (from === to) return minor;
  const fromRate = rateToKrw[from];
  const toRate = rateToKrw[to];
  if (!fromRate || !toRate) throw new Error(`FX_RATE_MISSING:${from}->${to}`);
  const major = toMajor(minor, from) * fromRate / toRate;
  return toMinor(major, to);
}

export function formatMinor(minor: number, currency: string, locale = "ko-KR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimalsOf(currency),
    maximumFractionDigits: decimalsOf(currency),
  }).format(toMajor(minor, currency));
}
