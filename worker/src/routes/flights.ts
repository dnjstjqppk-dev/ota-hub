/**
 * TG-18: live flight offer shopping (NDC/GDS).
 *
 * GET /api/v1/flights/offers?origin=ICN&destination=NRT&date=YYYY-MM-DD
 *   &adults=2&airline=KE&supplier=ndc
 *
 * Airport/airline codes validate against the mapping tables first (unknown
 * codes fail closed with 400 — the supplier is never asked to price a route
 * the platform cannot name). Live answers cache for 15 minutes (fare-cache);
 * when the supplier call fails, the freshest stale row serves with
 * stale:true instead of a 502.
 */
import type { Env } from "../env.ts";
import { HttpError, json, str } from "../lib/http.ts";
import { rateLimit } from "../lib/auth.ts";
import { adapterFor } from "../suppliers/adapter.ts";
import { assertKnownAirline, assertKnownAirports, loadAirline, loadAirports, normalizeAirlineCode, normalizeAirportCode } from "../suppliers/mappings.ts";
import { fareCacheGet, fareCacheSet, fareCacheStale, fareCacheKey } from "../suppliers/fare-cache.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleFlights(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/v1/flights/offers") return null;
  if (request.method !== "GET") return json({ error: "지원하지 않는 메서드입니다.", code: "METHOD_NOT_ALLOWED" }, 405);
  await rateLimit(request, env, "flights_offers", 120, 60);

  const supplier = str(url.searchParams.get("supplier") || "ndc", 10).toLowerCase();
  if (supplier !== "ndc" && supplier !== "gds") {
    throw new HttpError(400, "INVALID_SUPPLIER", "supplier는 ndc 또는 gds여야 합니다.");
  }
  const origin = normalizeAirportCode(url.searchParams.get("origin"));
  const destination = normalizeAirportCode(url.searchParams.get("destination"));
  if (!origin || !destination) throw new HttpError(400, "INVALID_ROUTE", "origin·destination은 IATA 3-letter 코드여야 합니다.");
  if (origin === destination) throw new HttpError(400, "INVALID_ROUTE", "출발지와 도착지가 같습니다.");
  const date = str(url.searchParams.get("date"), 10);
  if (!DATE_RE.test(date)) throw new HttpError(400, "INVALID_DATE", "date는 YYYY-MM-DD 형식이어야 합니다.");
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) throw new HttpError(400, "INVALID_DATE", "과거 날짜는 조회할 수 없습니다.");
  if (date > "2028-01-01") throw new HttpError(400, "DATE_TOO_FAR", "조회 가능 범위를 초과했습니다.");
  const adults = Math.floor(Number(url.searchParams.get("adults") || "1"));
  if (!Number.isSafeInteger(adults) || adults < 1 || adults > 9) {
    throw new HttpError(400, "INVALID_TRAVELERS", "adults는 1–9명이어야 합니다.");
  }
  const airlineRaw = url.searchParams.get("airline");
  const airline = airlineRaw === null || airlineRaw === "" ? null : normalizeAirlineCode(airlineRaw);
  if (airlineRaw !== null && airlineRaw !== "" && !airline) {
    throw new HttpError(400, "INVALID_AIRLINE", "airline은 2–3자 영숫자 코드여야 합니다.");
  }

  const rows = await loadAirports(env.DB, [origin, destination]);
  assertKnownAirports(origin, destination, rows);
  if (airline) assertKnownAirline(airline, await loadAirline(env.DB, airline));

  const key = fareCacheKey(supplier, origin, destination, date, adults, airline);
  const hit = await fareCacheGet(env.DB, key);
  if (hit) {
    return json({ success: true, offers: hit.offers, meta: { cached: true, stale: false, source: hit.source, supplier, origin, destination, date, cachedAt: new Date(hit.cachedAtMs).toISOString() } });
  }

  const adapter = adapterFor(supplier, env);
  if (!adapter.offers) {
    throw new HttpError(409, "SUPPLIER_OFFERS_UNSUPPORTED", "해당 공급사의 실시간 요금 조회가 설정되지 않았습니다.", { supplier });
  }
  const r = await adapter.offers({ origin, destination, date, adults, airline: airline ?? undefined });
  if (r.outcome === "OK") {
    await fareCacheSet(env.DB, key, r.offers);
    return json({ success: true, offers: r.offers, meta: { cached: false, stale: false, source: "live", supplier, origin, destination, date } });
  }
  if (r.outcome === "FAILED") {
    throw new HttpError(502, "SUPPLIER_OFFERS_FAILED", "공급사 요금 조회가 거절되었습니다.", { code: r.code });
  }
  const stale = await fareCacheStale(env.DB, key);
  if (stale) {
    return json({ success: true, offers: stale.offers, meta: { cached: true, stale: true, source: stale.source, supplier, origin, destination, date, cachedAt: new Date(stale.cachedAtMs).toISOString() } });
  }
  throw new HttpError(502, "SUPPLIER_OFFERS_FAILED", "공급사 요금 조회에 실패했습니다.");
}
