/**
 * Travel-wholesale connector registry (Phase 2).
 *
 * eSIM: roamify / redteago / airalo. Ticket/voucher: tiqets / bemyguest /
 * klook / kkday. A vendor sells only with a contracted base+key pair in env;
 * anything else resolves to null and the money gates refuse honestly — there
 * is no mock vendor, no demo key, and no silent fallback.
 */
import { isNonProduction, type Env } from "../env.ts";

export type WholesaleKind = "ESIM" | "VOUCHER";
export type WholesaleVendor =
  | "roamify" | "redteago" | "airalo"
  | "tiqets" | "bemyguest" | "klook" | "kkday";

export const WHOLESALE_VENDORS: WholesaleVendor[] = [
  "roamify", "redteago", "airalo", "tiqets", "bemyguest", "klook", "kkday",
];

const KIND: Record<WholesaleVendor, WholesaleKind> = {
  roamify: "ESIM", redteago: "ESIM", airalo: "ESIM",
  tiqets: "VOUCHER", bemyguest: "VOUCHER", klook: "VOUCHER", kkday: "VOUCHER",
};

const ENV_SUFFIX: Record<WholesaleVendor, string> = {
  roamify: "ROAMIFY", redteago: "REDTEAGO", airalo: "AIRALO",
  tiqets: "TIQETS", bemyguest: "BEMY_GUEST", klook: "KLOOK", kkday: "KKDAY",
};

export interface WholesaleConfig {
  vendor: WholesaleVendor;
  kind: WholesaleKind;
  apiBase: string;
  apiKey: string;
}

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

export function wholesaleKind(vendor: unknown): WholesaleKind | null {
  return typeof vendor === "string" && vendor in KIND
    ? KIND[vendor as WholesaleVendor]
    : null;
}

/** Usable base/key pair, or null. Same trust model as NDC/GDS + Toss keys. */
export function resolveWholesaleConfig(env: Env, vendor: unknown): WholesaleConfig | null {
  if (typeof vendor !== "string" || !(vendor in KIND)) return null;
  const v = vendor as WholesaleVendor;
  const sfx = ENV_SUFFIX[v];
  const base = String((env as any)[`WHOLESALE_${sfx}_API_BASE`] || "").trim().replace(/\/+$/, "");
  const key = String((env as any)[`WHOLESALE_${sfx}_API_KEY`] || "");
  if (!base || !key) return null;
  const loopback = LOOPBACK.test(base + "/");
  if (loopback && !isNonProduction(env)) return null;
  if (!loopback && !base.startsWith("https://")) return null;
  return { vendor: v, kind: KIND[v], apiBase: base, apiKey: key };
}

/** Sale gate: the vendor sells only when contracted credentials exist. */
export function wholesaleConfigured(env: Env | undefined, vendor: unknown): boolean {
  return !!env && resolveWholesaleConfig(env, vendor) !== null;
}

/** Per-vendor circuit-breaker key (never share breakers across vendors). */
export function wholesaleBreakerKey(vendor: WholesaleVendor): string {
  return `wholesale:${vendor}`;
}
