import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/lib/http.ts";
import {
  assertKnownAirline,
  assertKnownAirports,
  listMappings,
  loadAirline,
  loadAirports,
  normalizeAirlineCode,
  normalizeAirportCode,
  type AirlineMapping,
  type AirportMapping,
} from "../../src/suppliers/mappings.ts";

/** TG-18: IATA mapping validators are pure; loaders run against a fake DB. */

const AIRPORTS: AirportMapping[] = [
  { code: "ICN", city_ko: "서울/인천", city_en: "Seoul/Incheon", country_code: "KR", active: 1 },
  { code: "NRT", city_ko: "도쿄/나리타", city_en: "Tokyo/Narita", country_code: "JP", active: 1 },
  { code: "XXX", city_ko: "폐항", city_en: "Closed", country_code: "XX", active: 0 },
];
const AIRLINES: AirlineMapping[] = [
  { code: "KE", name_ko: "대한항공", name_en: "Korean Air", active: 1 },
  { code: "ZZ", name_ko: "퇴출", name_en: "Defunct", active: 0 },
];

function fakeDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (sql.includes("FROM airline_mappings")) {
                return (AIRLINES.find((a) => a.code === args[0]) || null) as T | null;
              }
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              if (sql.includes("FROM airport_mappings") && sql.includes("IN (")) {
                return { results: AIRPORTS.filter((a) => (args as string[]).includes(a.code)) as T[] };
              }
              if (sql.includes("FROM airport_mappings")) return { results: AIRPORTS as T[] };
              if (sql.includes("FROM airline_mappings")) return { results: AIRLINES as T[] };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

test("mappings: code normalization accepts IATA shapes only", () => {
  assert.equal(normalizeAirportCode("icn"), "ICN");
  assert.equal(normalizeAirportCode(" ICN "), "ICN");
  assert.equal(normalizeAirportCode("IC"), null);
  assert.equal(normalizeAirportCode("ICN1"), null);
  assert.equal(normalizeAirportCode(""), null);
  assert.equal(normalizeAirportCode(null), null);
  assert.equal(normalizeAirlineCode("ke"), "KE");
  assert.equal(normalizeAirlineCode("7c"), "7C");
  assert.equal(normalizeAirlineCode("K"), null);
  assert.equal(normalizeAirlineCode("KE11"), null);
});

test("mappings: unknown or inactive airports fail closed with UNKNOWN_AIRPORT", () => {
  assertKnownAirports("ICN", "NRT", AIRPORTS);
  for (const [o, d] of [["XXX", "NRT"], ["ICN", "XXX"], ["AAA", "NRT"], ["ICN", "BBB"]]) {
    assert.throws(() => assertKnownAirports(o, d, AIRPORTS), (e: unknown) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.status, 400);
      assert.equal(e.code, "UNKNOWN_AIRPORT");
      return true;
    });
  }
});

test("mappings: unknown or inactive airlines fail closed with UNKNOWN_AIRLINE", () => {
  assertKnownAirline("KE", AIRLINES[0]);
  for (const row of [null, AIRLINES[1]]) {
    assert.throws(() => assertKnownAirline("ZZ", row), (e: unknown) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.code, "UNKNOWN_AIRLINE");
      return true;
    });
  }
});

test("mappings: loaders read the mapping tables", async () => {
  const db = fakeDb();
  assert.deepEqual((await loadAirports(db, ["ICN", "NRT"])).map((r) => r.code), ["ICN", "NRT"]);
  assert.deepEqual(await loadAirports(db, []), []);
  assert.equal((await loadAirline(db, "KE"))?.name_en, "Korean Air");
  assert.equal(await loadAirline(db, "QQ"), null);
  const all = await listMappings(db);
  assert.equal(all.airports.length, 3);
  assert.equal(all.airlines.length, 2);
});
