import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDeeplinkParams } from "../../src/affiliate/deeplink-params.ts";
import { buildPartnerUrl, isSubIdShape, mintSubId } from "../../src/affiliate/partner-links.ts";

const q = (s: string) => new URLSearchParams(s);

test("P3: canonical trip context extracts with aliases, drops garbage", () => {
  const p = extractDeeplinkParams(q("dest=HND&origin=ICN&startDate=2026-12-01&endDate=2026-12-05&adults=2&children=1&rooms=1&cabin=business&evil=<script>"));
  assert.deepEqual(p, { dest: "HND", origin: "ICN", startDate: "2026-12-01", endDate: "2026-12-05", adults: 2, children: 1, rooms: 1, cabin: "BUSINESS" });
  const alias = extractDeeplinkParams(q("destination=TYO&checkin=2026-12-01&checkout=2026-12-03"));
  assert.equal(alias.dest, "TYO");
  assert.equal(alias.startDate, "2026-12-01");
  assert.equal(alias.endDate, "2026-12-03");
  const bad = extractDeeplinkParams(q("startDate=2026-13-99&endDate=2026-01-01&adults=99&children=-1&cabin=SPACESHIP&dest="));
  assert.deepEqual(bad, { dest: null, origin: null, startDate: null, endDate: "2026-01-01", adults: null, children: null, rooms: null, cabin: null });
  const inverted = extractDeeplinkParams(q("startDate=2026-12-05&endDate=2026-12-01"));
  assert.equal(inverted.endDate, null);
});

test("P3: partner URLs substitute tracking ids and map params per partner", () => {
  const base = { clickId: "clk_abc", subId: "deadbeef1234", itemId: "h_1", affiliateId: "CID-1", params: extractDeeplinkParams(q("dest=TYO&startDate=2026-12-01&endDate=2026-12-03&adults=2")) };
  const agoda = new URL(buildPartnerUrl({ ...base, template: "https://www.agoda.com/x?cid={affiliate_id}&hid={item_id}&sub={click_id}", partner: "agoda" }));
  assert.equal(agoda.searchParams.get("cid"), "CID-1");
  assert.equal(agoda.searchParams.get("sub"), "clk_abc");
  assert.equal(agoda.searchParams.get("checkIn"), "2026-12-01");
  assert.equal(agoda.searchParams.get("checkOut"), "2026-12-03");
  const sky = new URL(buildPartnerUrl({ ...base, template: "https://www.skyscanner.co.kr/x?sub={sub_id}", partner: "skyscanner", params: extractDeeplinkParams(q("origin=ICN&dest=HND&startDate=2026-12-01&adults=1")) }));
  assert.equal(sky.searchParams.get("sub"), "deadbeef1234");
  assert.equal(sky.searchParams.get("originplace"), "ICN");
  assert.equal(sky.searchParams.get("outbounddate"), "2026-12-01");
  // Template-owned params win; unknown partners keep canonical names (lossless).
  const keep = new URL(buildPartnerUrl({ ...base, template: "https://p.example/x?adults=9", partner: "mystery" }));
  assert.equal(keep.searchParams.get("adults"), "9");
  assert.equal(keep.searchParams.get("startDate"), "2026-12-01");
  assert.throws(() => buildPartnerUrl({ ...base, template: "http://p.example/x", partner: "agoda" }), /PARTNER_URL_NOT_HTTPS/);
});

test("P3: sub-ids are HMAC-bound, stable and shape-guarded", async () => {
  const secret = "test_secret_for_subid_0001";
  const a = await mintSubId(secret, "clk_1");
  assert.equal(a, await mintSubId(secret, "clk_1"));
  assert.ok(isSubIdShape(a));
  assert.notEqual(a, await mintSubId(secret, "clk_2"));
  assert.notEqual(a, await mintSubId("another_test_secret_0002", "clk_1"));
  assert.equal(isSubIdShape("short"), false);
  assert.equal(isSubIdShape(null), false);
  await assert.rejects(mintSubId("too-short", "clk_1"), /SUB_ID_INPUT_INVALID/);
});
