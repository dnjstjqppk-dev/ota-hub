/**
 * Search autocomplete engine.
 *
 * Places (countries, cities, airports, stations, ports, districts, landmarks)
 * come from the `places` reference table and are ranked in memory: the table is
 * small, and in-memory scoring gives prefix, Korean initial-consonant (초성) and
 * typo-tolerant matching that SQL LIKE cannot. Products come from the live
 * catalog tables with escaped LIKE queries.
 *
 * Every suggestion carries a stable identifier (place id + IATA / ISO code, or
 * product id) so the caller never has to re-parse display text.
 */
import type { Env } from "../env.ts";

export type PlaceType = "COUNTRY" | "CITY" | "REGION" | "AIRPORT" | "STATION" | "PORT" | "LANDMARK";

export interface PlaceRow {
  id: string;
  place_type: PlaceType;
  code: string | null;
  country_code: string;
  parent_id: string | null;
  name_ko: string;
  name_en: string;
  aliases: string;
  popularity: number;
}

export interface Suggestion {
  id: string;
  kind: "place" | "product";
  type: string;            // UI icon type: city | airport | station | port | region | landmark | country | hotel | activity | car | transfer | package | flight | train
  place_type?: PlaceType;
  code?: string | null;    // IATA / ISO code when the item has one
  country_code?: string;
  title: string;           // display label
  subtitle: string;
  value: string;           // text to place in the input after selection
  target_url: string | null;
  domain: string;
  badge: string;
  score: number;
}

export const SUGGEST_DOMAINS = ["all", "hotels", "flights", "trains", "cars", "transfers", "things-to-do", "packages", "esim", "insurance", "cruise"] as const;
export type SuggestDomain = (typeof SUGGEST_DOMAINS)[number];

/** Place types each search box may offer. */
export const DOMAIN_PLACE_TYPES: Record<SuggestDomain, PlaceType[]> = {
  all: ["CITY", "COUNTRY", "AIRPORT", "REGION", "LANDMARK", "STATION", "PORT"],
  hotels: ["CITY", "REGION", "LANDMARK", "COUNTRY"],
  flights: ["AIRPORT", "CITY"],
  trains: ["STATION"],
  cars: ["AIRPORT", "CITY", "STATION"],
  transfers: ["AIRPORT", "CITY", "REGION", "LANDMARK"],
  "things-to-do": ["CITY", "LANDMARK", "REGION", "COUNTRY"],
  packages: ["CITY", "COUNTRY"],
  esim: ["COUNTRY"],
  insurance: ["COUNTRY"],
  cruise: ["PORT", "CITY"],
};

export function parseDomain(raw: string | null): SuggestDomain {
  const d = (raw || "").trim().toLowerCase();
  if (d === "activities") return "things-to-do";
  return (SUGGEST_DOMAINS as readonly string[]).includes(d) ? (d as SuggestDomain) : "all";
}

// ------------------------------------------------------------------ text normalisation

const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** NFKC, lower case, strip diacritics, whitespace and punctuation. Keeps letters/digits of every script. */
export function normalize(s: string): string {
  // Hangul compatibility jamo (ㄱ..ㅣ, typed for 초성 search) are kept as-is:
  // NFKC would turn them into conjoining jamo that no longer match.
  return String(s || "")
    .split(/([ㄱ-ㆎ]+)/)
    .map((part, i) => (i % 2 ? part : part.normalize("NFKD").replace(/[̀-ͯ]/g, "").normalize("NFKC")))
    .join("")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Hangul syllables → initial consonants ("도쿄" → "ㄷㅋ"). Other characters are kept. */
export function toChoseong(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHOSEONG[Math.floor((c - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

export function isChoseongQuery(q: string): boolean {
  return q.length > 0 && /^[ㄱ-ㅎ]+$/.test(q);
}

/** Bounded Levenshtein distance; returns max+1 once the distance exceeds `max`. */
export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Escape a user string for SQL `LIKE ? ESCAPE '\'`. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

// ------------------------------------------------------------------ place index

export interface IndexedPlace {
  row: PlaceRow;
  keys: string[];      // normalised names + aliases
  words: string[];     // normalised individual words (for word-prefix matches)
  cho: string;         // 초성 of the Korean name
  code: string;        // lower-case code or ""
}

export function buildIndex(rows: PlaceRow[]): IndexedPlace[] {
  return rows.map((row) => {
    const names = [row.name_ko, row.name_en, ...String(row.aliases || "").split("|")].filter(Boolean);
    const keys = [...new Set(names.map(normalize).filter(Boolean))];
    const words = [...new Set(names.flatMap((n) => n.split(/[\s\-–/().,]+/)).map(normalize).filter((w) => w.length >= 2))];
    return { row, keys, words, cho: normalize(toChoseong(row.name_ko)), code: (row.code || "").toLowerCase() };
  });
}

/** Text-match score for one place, or 0 when it does not match. */
export function matchScore(p: IndexedPlace, q: string): number {
  if (!q) return 0;
  if (p.code && q === p.code) return p.row.place_type === "AIRPORT" || p.row.place_type === "CITY" ? 1000 : 900;
  let best = 0;
  for (const k of p.keys) {
    if (k === q) best = Math.max(best, 950);
    else if (k.startsWith(q)) best = Math.max(best, 800 - Math.min(100, (k.length - q.length) * 4));
    else if (k.includes(q)) best = Math.max(best, q.length >= 2 ? 450 : 0);
  }
  if (best < 650) for (const w of p.words) if (w.startsWith(q)) { best = Math.max(best, 650); break; }
  if (isChoseongQuery(q)) {
    if (p.cho.startsWith(q)) best = Math.max(best, 600);
    else if (q.length >= 2 && p.cho.includes(q)) best = Math.max(best, 350);
  }
  if (best === 0 && q.length >= 4 && !isChoseongQuery(q)) {
    // Typo tolerance: compare against the start of each key of a similar length.
    const max = q.length >= 7 ? 2 : 1;
    for (const k of [...p.keys, ...p.words]) {
      const d = levenshtein(q, k.slice(0, q.length + 1), max);
      const d2 = levenshtein(q, k.slice(0, q.length), max);
      const dm = Math.min(d, d2);
      if (dm <= max) best = Math.max(best, 300 - dm * 60);
    }
  }
  return best;
}

const TYPE_WEIGHT: Partial<Record<SuggestDomain, Partial<Record<PlaceType, number>>>> = {
  flights: { AIRPORT: 40, CITY: 30 },
  hotels: { CITY: 40, REGION: 30, LANDMARK: 20, COUNTRY: 0 },
  all: { CITY: 40, COUNTRY: 25, AIRPORT: 20, REGION: 15, LANDMARK: 15 },
  cars: { AIRPORT: 40, CITY: 30 },
  transfers: { AIRPORT: 40, CITY: 20, REGION: 25 },
};

export function rankPlaces(index: IndexedPlace[], rawQ: string, domain: SuggestDomain, limit: number): Array<{ p: IndexedPlace; score: number }> {
  const q = normalize(rawQ);
  const types = new Set(DOMAIN_PLACE_TYPES[domain]);
  const out: Array<{ p: IndexedPlace; score: number }> = [];
  for (const p of index) {
    if (!types.has(p.row.place_type)) continue;
    // A flight search needs an IATA code: skip cities without one.
    if (domain === "flights" && !p.row.code) continue;
    const m = q ? matchScore(p, q) : 1;
    if (m <= 0) continue;
    const score = (q ? m : 0) + (TYPE_WEIGHT[domain]?.[p.row.place_type] ?? 0) + Math.min(100, p.row.popularity) * 0.6;
    out.push({ p, score });
  }
  out.sort((a, b) => b.score - a.score || a.p.row.name_ko.localeCompare(b.p.row.name_ko, "ko"));
  return out.slice(0, limit);
}

// ------------------------------------------------------------------ presentation

const TYPE_LABEL: Record<PlaceType, string> = {
  COUNTRY: "국가", CITY: "도시", REGION: "지역", AIRPORT: "공항", STATION: "기차역", PORT: "크루즈 항구", LANDMARK: "명소",
};

/** Where selecting a place leads for each search box, matching the query params the pages read. */
export function placeTargetUrl(row: PlaceRow, domain: SuggestDomain, byId: Map<string, PlaceRow>): string | null {
  const enc = encodeURIComponent;
  const city = row.place_type === "CITY" ? row : row.parent_id ? byId.get(row.parent_id) : undefined;
  const cityName = city && city.place_type === "CITY" ? city.name_ko : row.name_ko;
  switch (domain) {
    case "flights": return row.code ? `/flights/search?dest=${enc(row.code)}` : null;
    case "trains": return row.place_type === "STATION" ? `/trains/search?dep=${enc(row.name_ko)}` : null;
    case "cars": return `/cars/list?city=${enc(row.place_type === "AIRPORT" ? row.name_ko : cityName)}`;
    case "transfers": return row.place_type === "AIRPORT" && row.code ? `/transfers/list?airport=${enc(row.code)}` : `/transfers/list?destination=${enc(row.name_ko)}`;
    case "things-to-do": return row.place_type === "COUNTRY" ? `/things-to-do?q=${enc(row.name_ko)}` : row.place_type === "CITY" ? `/things-to-do?city=${enc(row.name_ko)}` : `/things-to-do?q=${enc(row.name_ko)}`;
    case "packages": return `/packages/list?city=${enc(cityName)}`;
    case "esim": return `/esim?country=${enc(row.country_code)}`;
    case "insurance": return `/insurance?country=${enc(row.country_code)}`;
    case "cruise": return null; // no cruise catalog yet
    default:
      if (row.place_type === "AIRPORT") return `/flights/search?dest=${enc(row.code || "")}`;
      if (row.place_type === "STATION") return `/trains/search?dep=${enc(row.name_ko)}`;
      if (row.place_type === "LANDMARK") return `/things-to-do?q=${enc(row.name_ko)}`;
      if (row.place_type === "COUNTRY") return `/things-to-do?q=${enc(row.name_ko)}`;
      return `/hotels/list?city=${enc(row.place_type === "REGION" ? row.name_ko : cityName)}`;
  }
}

export function placeSuggestion(row: PlaceRow, domain: SuggestDomain, byId: Map<string, PlaceRow>, score: number): Suggestion {
  const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
  const country = byId.get(`ctr_${row.country_code}`);
  const where = [parent && parent.id !== country?.id ? parent.name_ko : null, country && country.id !== row.id ? country.name_ko : null].filter(Boolean).join(", ");
  // Codes matter where travellers know them: airports everywhere, city codes only in flight search.
  const showCode = row.code && (row.place_type === "AIRPORT" || (row.place_type === "CITY" && domain === "flights"));
  const codeLabel = showCode ? ` (${row.code})` : "";
  const title = `${row.name_ko}${codeLabel}`;
  const subtitle = [row.name_en, where].filter(Boolean).join(" · ");
  // Flight boxes keep the code in the input so the search API receives an exact IATA code.
  const value = domain === "flights" && row.code ? `${row.name_ko} (${row.code})` : row.name_ko;
  return {
    id: row.id, kind: "place", type: row.place_type.toLowerCase(), place_type: row.place_type,
    code: row.code, country_code: row.country_code, title, subtitle, value,
    target_url: placeTargetUrl(row, domain, byId), domain, badge: TYPE_LABEL[row.place_type],
    score: Math.round(score),
  };
}

// ------------------------------------------------------------------ data access

let cache: { at: number; rows: PlaceRow[]; index: IndexedPlace[]; byId: Map<string, PlaceRow> } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Loads and indexes active places. Returns null when the table does not exist yet (migration not applied). */
export async function loadPlaces(env: Env): Promise<{ index: IndexedPlace[]; byId: Map<string, PlaceRow> } | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  try {
    const res = await env.DB.prepare(
      "SELECT id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity FROM places WHERE is_active = 1"
    ).all<PlaceRow>();
    const rows = res.results || [];
    cache = { at: Date.now(), rows, index: buildIndex(rows), byId: new Map(rows.map((r) => [r.id, r])) };
    return cache;
  } catch (e) {
    console.error("places unavailable", e);
    return null;
  }
}

/** For tests: drop the in-isolate cache. */
export function resetPlacesCache(): void { cache = null; }

/** IATA airport codes served by a city code (TYO → NRT, HND). Empty when the code is not a known city. */
export async function airportsForCityCode(env: Env, code: string): Promise<string[]> {
  const data = await loadPlaces(env);
  if (!data) return [];
  const city = data.byId.get(`cty_${code.toUpperCase()}`);
  if (!city) return [];
  return data.index
    .filter((p) => p.row.place_type === "AIRPORT" && p.row.parent_id === city.id && p.row.code)
    .map((p) => p.row.code as string);
}

type ProductQuery = { domains: SuggestDomain[]; sql: string; params: (q: string) => unknown[]; map: (r: any) => Omit<Suggestion, "score" | "domain"> & { domain?: string } };

const PRODUCT_QUERIES: ProductQuery[] = [
  {
    domains: ["all", "hotels"],
    sql: "SELECT id, name_ko, name_en, city, country, star_rating FROM hotels WHERE name_ko LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\' OR neighborhood LIKE ? ESCAPE '\\' LIMIT 6",
    params: (q) => [q, q, q, q],
    map: (h) => ({ id: h.id, kind: "product", type: "hotel", title: h.name_ko, subtitle: [h.name_en, h.city, h.country].filter(Boolean).join(" · "), value: h.name_ko, target_url: `/hotels/detail/${encodeURIComponent(h.id)}`, badge: h.star_rating ? `${h.star_rating}성급 호텔` : "호텔", domain: "hotels" }),
  },
  {
    domains: ["all", "things-to-do"],
    sql: "SELECT id, title, city, country, category FROM activities WHERE title LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' LIMIT 5",
    params: (q) => [q, q],
    map: (a) => ({ id: a.id, kind: "product", type: "activity", title: a.title, subtitle: [a.city, a.country].filter(Boolean).join(" · "), value: a.title, target_url: `/things-to-do/detail/${encodeURIComponent(a.id)}`, badge: "투어·티켓", domain: "things-to-do" }),
  },
  {
    domains: ["all", "cars"],
    sql: "SELECT id, company_name, vehicle_model, vehicle_type, pickup_location FROM cars WHERE company_name LIKE ? ESCAPE '\\' OR vehicle_model LIKE ? ESCAPE '\\' OR pickup_location LIKE ? ESCAPE '\\' LIMIT 4",
    params: (q) => [q, q, q],
    map: (c) => ({ id: c.id, kind: "product", type: "car", title: `${c.company_name} · ${c.vehicle_model}`, subtitle: [c.pickup_location, c.vehicle_type].filter(Boolean).join(" · "), value: c.pickup_location || c.company_name, target_url: `/cars/detail/${encodeURIComponent(c.id)}`, badge: "렌터카", domain: "cars" }),
  },
  {
    domains: ["all", "transfers"],
    sql: "SELECT id, service_title, airport_code, destination_area FROM transfers WHERE service_title LIKE ? ESCAPE '\\' OR destination_area LIKE ? ESCAPE '\\' LIMIT 4",
    params: (q) => [q, q],
    map: (t) => ({ id: t.id, kind: "product", type: "transfer", code: t.airport_code, title: t.service_title, subtitle: `${t.airport_code} → ${t.destination_area}`, value: t.destination_area, target_url: `/transfers/detail/${encodeURIComponent(t.id)}`, badge: "공항 이동", domain: "transfers" }),
  },
  {
    domains: ["all", "packages"],
    sql: "SELECT id, title, destination_city FROM packages WHERE title LIKE ? ESCAPE '\\' OR destination_city LIKE ? ESCAPE '\\' LIMIT 4",
    params: (q) => [q, q],
    map: (p) => ({ id: p.id, kind: "product", type: "package", title: p.title, subtitle: p.destination_city || "", value: p.destination_city || p.title, target_url: `/packages/detail/${encodeURIComponent(p.id)}`, badge: "패키지", domain: "packages" }),
  },
  {
    domains: ["all", "flights"],
    sql: "SELECT id, flight_number, airline_name, departure_airport, arrival_airport FROM flights WHERE flight_number LIKE ? ESCAPE '\\' OR airline_name LIKE ? ESCAPE '\\' LIMIT 4",
    params: (q) => [q, q],
    map: (f) => ({ id: f.id, kind: "product", type: "flight", code: f.arrival_airport, title: `${f.airline_name} ${f.flight_number}`, subtitle: `${f.departure_airport} → ${f.arrival_airport}`, value: `${f.arrival_airport}`, target_url: `/flights/search?origin=${encodeURIComponent(f.departure_airport)}&dest=${encodeURIComponent(f.arrival_airport)}`, badge: "운항편", domain: "flights" }),
  },
  {
    domains: ["all", "trains"],
    sql: "SELECT id, train_number, train_type, departure_station, arrival_station FROM trains WHERE train_number LIKE ? ESCAPE '\\' OR train_type LIKE ? ESCAPE '\\' LIMIT 4",
    params: (q) => [q, q],
    map: (t) => ({ id: t.id, kind: "product", type: "train", title: `${t.train_type} ${t.train_number}`, subtitle: `${t.departure_station} → ${t.arrival_station}`, value: t.departure_station, target_url: `/trains/search?dep=${encodeURIComponent(t.departure_station)}&arr=${encodeURIComponent(t.arrival_station)}`, badge: "열차", domain: "trains" }),
  },
  {
    domains: ["all", "esim"],
    sql: "SELECT DISTINCT country_code, country_name FROM esim_plans WHERE is_active = 1 AND (country_name LIKE ? ESCAPE '\\' OR country_code LIKE ? ESCAPE '\\') LIMIT 4",
    params: (q) => [q, q],
    map: (e) => ({ id: `esim_${e.country_code}`, kind: "product", type: "esim", code: e.country_code, country_code: e.country_code, title: `${e.country_name} eSIM`, subtitle: "판매 중인 eSIM 요금제", value: e.country_name, target_url: `/esim?country=${encodeURIComponent(e.country_code)}`, badge: "eSIM", domain: "esim" }),
  },
];

export interface SuggestResult {
  items: Suggestion[];
  degraded: boolean;   // places table unavailable: only product matches returned
}

export async function suggest(env: Env, rawQ: string, domain: SuggestDomain, limit = 10): Promise<SuggestResult> {
  const q = String(rawQ || "").trim().slice(0, 60);
  const places = await loadPlaces(env);
  const items: Suggestion[] = [];

  if (places) {
    for (const { p, score } of rankPlaces(places.index, q, domain, limit)) {
      items.push(placeSuggestion(p.row, domain, places.byId, score));
    }
  }

  const nq = normalize(q);
  if (nq.length >= 2 && !isChoseongQuery(nq)) {
    const like = `%${likeEscape(q)}%`;
    const queries = PRODUCT_QUERIES.filter((pq) => pq.domains.includes(domain));
    const results = await Promise.all(queries.map(async (pq) => {
      try {
        return ((await env.DB.prepare(pq.sql).bind(...pq.params(like)).all()).results || []).map(pq.map);
      } catch (e) {
        console.error("suggest product query failed", e);
        return [];
      }
    }));
    for (const rows of results) {
      for (const r of rows) {
        const nTitle = normalize(r.title);
        const s = nTitle === nq ? 900 : nTitle.startsWith(nq) ? 700 : 500;
        items.push({ ...r, domain: r.domain || domain, score: s } as Suggestion);
      }
    }
  }

  // De-duplicate by id, keep best score, places first on ties.
  const seen = new Map<string, Suggestion>();
  for (const it of items) {
    const prev = seen.get(it.id);
    if (!prev || it.score > prev.score) seen.set(it.id, it);
  }
  const sorted = [...seen.values()].sort((a, b) => b.score - a.score || (a.kind === "place" ? -1 : 1));
  return { items: sorted.slice(0, limit), degraded: !places };
}
