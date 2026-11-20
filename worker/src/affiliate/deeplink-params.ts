/**
 * Canonical trip context for affiliate deeplinks (Phase 3).
 *
 * The catalog UI collects destination / dates / party / room options; /out/
 * forwards them to the partner so the traveler lands on a matching search
 * instead of a bare homepage. Pure: extract + validate only, no mapping.
 * Unknown keys are dropped; every known key survives (lossless by allowlist).
 */

export interface DeeplinkParams {
  dest: string | null;
  origin: string | null;
  startDate: string | null;
  endDate: string | null;
  adults: number | null;
  children: number | null;
  rooms: number | null;
  cabin: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACE = /^[A-Za-z0-9가-힣\s\-.,()]{1,64}$/u;
const CABIN = /^(ECONOMY|PREMIUM_ECONOMY|BUSINESS|FIRST)$/;

function cleanDate(v: string | null): string | null {
  if (!v || !DATE.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(t) ? null : v;
}

function cleanInt(v: string | null, min: number, max: number): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function cleanPlace(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim().slice(0, 64);
  return PLACE.test(t) ? t : null;
}

/**
 * @example extractDeeplinkParams(new URLSearchParams("dest=HND&adults=2"))
 * // { dest: "HND", origin: null, ..., adults: 2, ... }
 */
export function extractDeeplinkParams(q: URLSearchParams): DeeplinkParams {
  const start = cleanDate(q.get("startDate") ?? q.get("checkin") ?? q.get("date"));
  const end = cleanDate(q.get("endDate") ?? q.get("checkout"));
  return {
    dest: cleanPlace(q.get("dest") ?? q.get("destination")),
    origin: cleanPlace(q.get("origin")),
    startDate: start,
    // A range ending before it starts is garbage; a lone end date is kept.
    endDate: end && (!start || end >= start) ? end : null,
    adults: cleanInt(q.get("adults"), 1, 9),
    children: cleanInt(q.get("children"), 0, 8),
    rooms: cleanInt(q.get("rooms"), 1, 9),
    cabin: (() => { const c = (q.get("cabin") || "").toUpperCase(); return CABIN.test(c) ? c : null; })(),
  };
}
