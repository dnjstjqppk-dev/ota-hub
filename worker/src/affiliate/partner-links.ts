/**
 * Partner deeplink builder (Phase 3): canonical trip context -> partner URL.
 *
 * Each partner documents its own search-param names; the table below maps the
 * canonical DeeplinkParams onto them. Partners ignore unknown params, so the
 * default mapping keeps canonical names (lossless) for unmapped partners.
 * Pure: no DB, no fetch. The template host is never rewritten.
 *
 * Also mints the partner-facing Sub-ID: HMAC-SHA256(partner_secret,
 * "sub:"+click_id) truncated to 24 hex chars. Unforgeable without the
 * secret; postbacks match it against the recorded click (see routes).
 */
import type { DeeplinkParams } from "./deeplink-params.ts";
import { hmacSha256Hex } from "../lib/crypto.ts";

const SUB_ID_SHAPE = /^[0-9a-f]{24}$/;

/** Mint the partner-facing token for a click (secret = partner's postback secret, 24+ chars). */
export async function mintSubId(partnerSecret: string, clickId: string): Promise<string> {
  if (!partnerSecret || partnerSecret.length < 24 || !clickId) throw new Error("SUB_ID_INPUT_INVALID");
  return (await hmacSha256Hex(partnerSecret, `sub:${clickId}`)).slice(0, 24);
}

/** Shape guard for sub-ids arriving on postback (exact DB match decides). */
export function isSubIdShape(v: unknown): v is string {
  return typeof v === "string" && SUB_ID_SHAPE.test(v);
}

/** Canonical key -> partner query-param name, per partner_id. */
const PARTNER_MAP: Record<string, Partial<Record<keyof DeeplinkParams, string>>> = {
  // trip hotel-affiliate search (?checkin=&checkout=&adults=&children=&rooms=).
  trip: { dest: "destination", startDate: "checkin", endDate: "checkout", adults: "adults", children: "children", rooms: "rooms" },
  // Agoda partner search (checkIn/checkOut/los/rooms/adults/children).
  agoda: { dest: "destination", startDate: "checkIn", endDate: "checkOut", adults: "adults", children: "children", rooms: "rooms" },
  // Klook activity pages: keep canonical date/party; aid+aff_sub ride in the template.
  klook: { startDate: "date", adults: "adults", children: "children" },
  // MyRealTrip offer pages: canonical pass-through.
  myrealtrip: { dest: "destination", startDate: "startDate", endDate: "endDate", adults: "adults", children: "children" },
  // Skyscanner classic flight search params.
  skyscanner: { origin: "originplace", dest: "destinationplace", startDate: "outbounddate", endDate: "inbounddate", adults: "adults", children: "children", cabin: "cabinclass" },
  // Travelpayouts Hotellook search (marker rides in the template).
  travelpayouts: { dest: "destination", startDate: "checkIn", endDate: "checkOut", adults: "adults", children: "children" },
};

export interface PartnerUrlOpts {
  template: string;
  partner: string;
  clickId: string;
  subId: string;
  itemId: string;
  affiliateId: string;
  params: DeeplinkParams;
}

/**
 * Substitute tracking placeholders, then append mapped trip context for keys
 * the template does not already set. Throws on non-https templates.
 */
export function buildPartnerUrl(o: PartnerUrlOpts): string {
  const filled = o.template
    .replaceAll("{click_id}", encodeURIComponent(o.clickId))
    .replaceAll("{sub_id}", encodeURIComponent(o.subId))
    .replaceAll("{item_id}", encodeURIComponent(o.itemId))
    .replaceAll("{affiliate_id}", encodeURIComponent(o.affiliateId));
  const u = new URL(filled);
  if (u.protocol !== "https:") throw new Error("PARTNER_URL_NOT_HTTPS");
  const map = PARTNER_MAP[o.partner] || {};
  (Object.keys(o.params) as (keyof DeeplinkParams)[]).forEach((k) => {
    const v = o.params[k];
    if (v === null) return;
    const name = map[k] || k;
    if (!u.searchParams.has(name)) u.searchParams.set(name, String(v));
  });
  return u.toString();
}
