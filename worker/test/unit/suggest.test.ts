import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildIndex, isChoseongQuery, levenshtein, likeEscape, normalize, parseDomain, placeSuggestion, rankPlaces, toChoseong,
  type PlaceRow,
} from "../../src/services/suggest-service.ts";

/** Parse the seed rows of migration 0006 so tests rank against the real reference data. */
function seedRows(): PlaceRow[] {
  const sql = readFileSync(new URL("../../migrations/0006_places.sql", import.meta.url), "utf8");
  const rows: PlaceRow[] = [];
  const re = /^\('([^']+)','([A-Z]+)',(NULL|'[^']*'),'([A-Z]{2})',(NULL|'[^']*'),'((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)',(\d+)\)[,;]$/gm;
  const s = (v: string) => (v === "NULL" ? null : v.slice(1, -1));
  for (const m of sql.matchAll(re)) {
    rows.push({ id: m[1], place_type: m[2] as PlaceRow["place_type"], code: s(m[3]), country_code: m[4], parent_id: s(m[5]), name_ko: m[6].replace(/''/g, "'"), name_en: m[7].replace(/''/g, "'"), aliases: m[8].replace(/''/g, "'"), popularity: Number(m[9]) });
  }
  return rows;
}

const ROWS = seedRows();
const INDEX = buildIndex(ROWS);
const BY_ID = new Map(ROWS.map((r) => [r.id, r]));
const top = (q: string, domain: Parameters<typeof rankPlaces>[2], n = 3) => rankPlaces(INDEX, q, domain, n).map((r) => r.p.row.id);

test("seed: parsed every place row, ids unique, parents exist", () => {
  assert.ok(ROWS.length > 200, `expected >200 seed rows, got ${ROWS.length}`);
  assert.equal(new Set(ROWS.map((r) => r.id)).size, ROWS.length);
  for (const r of ROWS) {
    if (r.parent_id) assert.ok(BY_ID.has(r.parent_id), `${r.id} parent ${r.parent_id} missing`);
    assert.ok(BY_ID.has(`ctr_${r.country_code}`), `${r.id} country ${r.country_code} missing`);
  }
  for (const r of ROWS.filter((r) => r.place_type === "AIRPORT")) assert.match(r.code || "", /^[A-Z]{3}$/, r.id);
});

test("normalize: case, width, diacritics, punctuation and spaces", () => {
  assert.equal(normalize("  Ｔokyo  "), "tokyo");
  assert.equal(normalize("Đà Nẵng"), "đanang"); // đ has no decomposition; tone marks drop
  assert.equal(normalize("Zürich"), "zurich");
  assert.equal(normalize("St. Pancras-Intl"), "stpancrasintl");
  assert.equal(normalize("신 오사카 역"), "신오사카역");
});

test("choseong: hangul initials, detection", () => {
  assert.equal(toChoseong("도쿄"), "ㄷㅋ");
  assert.equal(toChoseong("서울역 KTX"), "ㅅㅇㅇ KTX");
  assert.ok(isChoseongQuery("ㄷㅋ"));
  assert.ok(!isChoseongQuery("도ㅋ"));
});

test("levenshtein is bounded", () => {
  assert.equal(levenshtein("tokyo", "tokyo", 1), 0);
  assert.equal(levenshtein("tokio", "tokyo", 1), 1);
  assert.equal(levenshtein("abcdef", "uvwxyz", 2), 3);
});

test("likeEscape escapes SQL wildcards", () => {
  assert.equal(likeEscape("100%_a\\b"), "100\\%\\_a\\\\b");
});

test("parseDomain maps aliases and rejects unknown values", () => {
  assert.equal(parseDomain("activities"), "things-to-do");
  assert.equal(parseDomain("FLIGHTS"), "flights");
  assert.equal(parseDomain("<script>"), "all");
  assert.equal(parseDomain(null), "all");
});

test("flights: IATA code is an exact top hit", () => {
  assert.equal(top("ICN", "flights", 1)[0], "apt_ICN");
  assert.equal(top("nrt", "flights", 1)[0], "apt_NRT");
  assert.equal(top("TYO", "flights", 1)[0], "cty_TYO");
});

test("flights: Korean, English, alias and former names", () => {
  assert.ok(top("나리타", "flights").includes("apt_NRT"));
  assert.ok(top("haneda", "flights").includes("apt_HND"));
  assert.ok(top("인천공항", "flights").includes("apt_ICN"));
  assert.ok(top("동경", "flights").includes("cty_TYO"));
  assert.ok(top("사이공", "flights", 5).includes("cty_SGN"));
});

test("flights never offer a place without an IATA code", () => {
  for (const r of rankPlaces(INDEX, "", "flights", 500)) assert.ok(r.p.row.code, r.p.row.id);
  assert.ok(!top("교토", "flights", 10).includes("cty_KYO"));
});

test("typo tolerance: one-letter mistakes still find the place", () => {
  assert.ok(top("tokio", "hotels").includes("cty_TYO"));
  assert.ok(top("bangkokk", "hotels").includes("cty_BKK"));
  assert.ok(top("barcelna", "hotels").includes("cty_BCN"));
});

test("choseong search finds Korean names", () => {
  assert.ok(top("ㄷㅋ", "hotels").includes("cty_TYO"));
  assert.ok(top("ㅅㅇㅇ", "trains").includes("stn_kr_seoul"));
});

test("domains restrict place types", () => {
  for (const r of rankPlaces(INDEX, "", "trains", 100)) assert.equal(r.p.row.place_type, "STATION");
  for (const r of rankPlaces(INDEX, "", "esim", 100)) assert.equal(r.p.row.place_type, "COUNTRY");
  for (const r of rankPlaces(INDEX, "부산", "cruise", 10)) assert.ok(["PORT", "CITY"].includes(r.p.row.place_type));
});

test("prefix beats substring; exact beats prefix", () => {
  const ids = top("오사카", "all", 5);
  assert.equal(ids[0], "cty_OSA");
});

test("empty query returns popular places ordered by editorial weight, no fabricated counts", () => {
  const items = rankPlaces(INDEX, "", "hotels", 6).map(({ p, score }) => placeSuggestion(p.row, "hotels", BY_ID, score));
  assert.equal(items.length, 6);
  for (const it of items) {
    assert.ok(!/\d+\s*(개|편|대|명)/.test(`${it.title}${it.subtitle}${it.badge}`), `no fake counts in ${it.title}`);
  }
});

test("suggestion carries identifiers and a target url the page understands", () => {
  const nrt = placeSuggestion(BY_ID.get("apt_NRT")!, "flights", BY_ID, 1000);
  assert.equal(nrt.code, "NRT");
  assert.equal(nrt.value, "나리타국제공항 (NRT)");
  assert.equal(nrt.target_url, "/flights/search?dest=NRT");
  assert.match(nrt.subtitle, /도쿄, 일본/);

  const shinjuku = placeSuggestion(BY_ID.get("reg_tyo_shinjuku")!, "hotels", BY_ID, 1);
  assert.equal(shinjuku.target_url, "/hotels/list?city=" + encodeURIComponent("신주쿠"));

  const jejuCar = placeSuggestion(BY_ID.get("cty_CJU")!, "cars", BY_ID, 1);
  assert.equal(jejuCar.target_url, "/cars/list?city=" + encodeURIComponent("제주"));

  const icnTransfer = placeSuggestion(BY_ID.get("apt_ICN")!, "transfers", BY_ID, 1);
  assert.equal(icnTransfer.target_url, "/transfers/list?airport=ICN");

  const jp = placeSuggestion(BY_ID.get("ctr_JP")!, "esim", BY_ID, 1);
  assert.equal(jp.target_url, "/esim?country=JP");

  const port = placeSuggestion(BY_ID.get("prt_kr_busan")!, "cruise", BY_ID, 1);
  assert.equal(port.target_url, null, "no cruise catalog: selecting a port must not navigate to a fake page");
});
