import { test } from "node:test";
import assert from "node:assert/strict";
import { productMd } from "../../src/seo/product-md.ts";
import { fakeDb } from "./_fakedb.ts";

const env = (db: any) => ({ PUBLIC_SITE_URL: "https://getfortrip.com", DB: db }) as any;

const HOTEL: any = {
  id: "H1", is_active: 1, name_ko: "테스트 호텔", city: "서울", base_price_krw: 85000,
  review_score: 4.8, review_count: 120, partner_id: "ptn_htl_01", updated_at: "2026-11-20T00:00:00Z",
};
const DIRECT = { id: "ptn_htl_01", adapter: "direct_contract", integration_status: "LIVE", transaction_model: "DIRECT" };
const POLICY = { free_cancel_hours: 24, tiers_json: '[{"hours_before":72,"refund_bps":10000}]', note: null };

const dbFor = (hotel: any, supplier: any, policy: any) => fakeDb({
  first: (sql: string, params: unknown[]) => {
    if (sql.includes("FROM hotels") || sql.includes("FROM activities")) return params[0] === hotel?.id ? hotel : null;
    if (sql.includes("FROM suppliers")) return supplier;
    if (sql.includes("FROM product_policies")) return policy;
    return null;
  },
});

test("seo md: full hotel sheet format", async () => {
  const r = await productMd(env(dbFor(HOTEL, DIRECT, POLICY)), "HOTEL", "H1");
  assert.equal(r.status, 200);
  assert.ok(r.headers.get("Content-Type")!.includes("text/markdown"));
  assert.equal(await r.text(), [
    "- 상품명: 테스트 호텔",
    "- 도시: 서울",
    "- 가격: 85,000원 (KRW, 1박 기준, 세금 별도)",
    "- 판매 방식: 직판",
    "- 취소 규정: 24시간 전까지 무료 취소 / 72시간 전 100% 환불",
    "- 평점: 4.8 (리뷰 120건)",
    "- 정규 URL: https://getfortrip.com/hotels/detail/H1",
    "- 최종 갱신: 2026-11-20T00:00:00Z",
    "",
  ].join("\n"));
});

test("seo md: 404 for unknown domain, bad id, missing or inactive product", async () => {
  const db = dbFor(HOTEL, DIRECT, POLICY);
  for (const [d, id] of [["ESIM", "H1"], ["HOTEL", "bad id"], ["HOTEL", "H9"]]) {
    const r = await productMd(env(db), d, id);
    assert.equal(r.status, 404);
  }
  const dbOff = dbFor({ ...HOTEL, is_active: 0 }, DIRECT, POLICY);
  assert.equal((await productMd(env(dbOff), "HOTEL", "H1")).status, 404);
});

test("seo md: rating omitted at zero, cancel/updated omitted when absent", async () => {
  const r = await productMd(env(dbFor({ ...HOTEL, review_count: 0 }, DIRECT, null)), "hotel", "H1");
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.doesNotMatch(body, /평점/);
  assert.doesNotMatch(body, /취소 규정/);
  assert.match(body, /- 판매 방식: 직판/);
  const r2 = await productMd(env(dbFor({ ...HOTEL, review_score: null, updated_at: null }, DIRECT, POLICY)), "HOTEL", "H1");
  const b2 = await r2.text();
  assert.doesNotMatch(b2, /평점/);
  assert.doesNotMatch(b2, /최종 갱신/);
  assert.match(b2, /- 취소 규정: 24시간 전까지 무료 취소/);
});

test("seo md: affiliate and unbookable sales modes, activity domain", async () => {
  const aff = { id: "ptn_x", adapter: "link", integration_status: "LIVE", transaction_model: "AFFILIATE" };
  const r = await productMd(env(dbFor(HOTEL, aff, null)), "HOTEL", "H1");
  assert.match(await r.text(), /- 판매 방식: 제휴/);
  const r2 = await productMd(env(dbFor(HOTEL, null, null)), "HOTEL", "H1");
  assert.match(await r2.text(), /- 판매 방식: 구매 불가/);
  const act = { id: "A9", is_active: 1, title: "야경 투어", city: "서울", price_krw: 59000, review_score: 4.9, review_count: 7, partner_id: "ptn_tour_01", updated_at: "2026-11-21" };
  const r3 = await productMd(env(dbFor(act, DIRECT, null)), "ACTIVITY", "A9");
  const b3 = await r3.text();
  assert.match(b3, /- 상품명: 야경 투어/);
  assert.match(b3, /- 가격: 59,000원 \(KRW, 1인 기준, 추가 세금 없음\)/);
  assert.match(b3, /- 정규 URL: https:\/\/getfortrip\.com\/things-to-do\/detail\/A9/);
});
