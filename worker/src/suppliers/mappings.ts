import { HttpError } from "../lib/http.ts";

/**
 * TG-18: IATA airport/airline reference lookups (`airport_mappings`,
 * `airline_mappings`). Validators are pure (unit-tested); loaders take a
 * minimal DbLike so tests inject a fake.
 */

export interface AirportMapping {
  code: string;
  city_ko: string;
  city_en: string;
  country_code: string;
  active: number;
}

export interface AirlineMapping {
  code: string;
  name_ko: string;
  name_en: string;
  active: number;
}

type DbLike = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

/** "icn" -> "ICN", garbage -> null. */
export function normalizeAirportCode(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

/** "ke" -> "KE" (2–3 alphanumerics), garbage -> null. */
export function normalizeAirlineCode(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{2,3}$/.test(s) ? s : null;
}

/**
 * Pure route validation against already-loaded rows. Unknown (or inactive)
 * airports fail closed with 400: the supplier must never be asked to price
 * a route the platform cannot name.
 */
export function assertKnownAirports(origin: string, destination: string, rows: AirportMapping[]): void {
  const known = new Set(rows.filter((r) => r.active === 1).map((r) => r.code));
  if (!known.has(origin)) throw new HttpError(400, "UNKNOWN_AIRPORT", `알 수 없는 출발 공항 코드입니다: ${origin}`, { code: origin });
  if (!known.has(destination)) throw new HttpError(400, "UNKNOWN_AIRPORT", `알 수 없는 도착 공항 코드입니다: ${destination}`, { code: destination });
}

export function assertKnownAirline(code: string, row: AirlineMapping | null): void {
  if (!row || row.active !== 1) throw new HttpError(400, "UNKNOWN_AIRLINE", `알 수 없는 항공사 코드입니다: ${code}`, { code });
}

export async function loadAirports(db: DbLike, codes: string[]): Promise<AirportMapping[]> {
  if (codes.length === 0) return [];
  const rows = await db.prepare(`SELECT code, city_ko, city_en, country_code, active FROM airport_mappings WHERE code IN (${codes.map(() => "?").join(",")})`).bind(...codes).all<AirportMapping>();
  return rows.results;
}

export async function loadAirline(db: DbLike, code: string): Promise<AirlineMapping | null> {
  return db.prepare("SELECT code, name_ko, name_en, active FROM airline_mappings WHERE code = ?").bind(code).first<AirlineMapping>();
}

export async function listMappings(db: DbLike): Promise<{ airports: AirportMapping[]; airlines: AirlineMapping[] }> {
  const airports = await db.prepare("SELECT code, city_ko, city_en, country_code, active FROM airport_mappings ORDER BY code").bind().all<AirportMapping>();
  const airlines = await db.prepare("SELECT code, name_ko, name_en, active FROM airline_mappings ORDER BY code").bind().all<AirlineMapping>();
  return { airports: airports.results, airlines: airlines.results };
}
