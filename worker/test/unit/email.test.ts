import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmailConfigured, renderOutboxEmail } from "../../src/services/email-service.ts";

test("isEmailConfigured: only a non-empty RESEND_API_KEY counts", () => {
  assert.equal(isEmailConfigured({} as any), false);
  assert.equal(isEmailConfigured({ RESEND_API_KEY: "  " } as any), false);
  assert.equal(isEmailConfigured({ RESEND_API_KEY: "re_test_123" } as any), true);
});

test("PASSWORD_RESET: renders a link email, rejects non-https links and bad JSON", () => {
  const ok = renderOutboxEmail("PASSWORD_RESET", JSON.stringify({ link: "https://getfortrip.com/reset-password?token=abc" }), "https://getfortrip.com");
  assert.ok(ok && ok.subject.includes("비밀번호 재설정") && ok.html.includes("reset-password?token=abc"));
  assert.equal(renderOutboxEmail("PASSWORD_RESET", JSON.stringify({ link: "http://evil.test/x" }), "https://getfortrip.com"), null);
  assert.equal(renderOutboxEmail("PASSWORD_RESET", "{nope", "https://getfortrip.com"), null);
});

test("booking templates: include the booking number and escape HTML", () => {
  const c = renderOutboxEmail("BOOKING_CONFIRMED", JSON.stringify({ bookingNumber: 'GFT-1"><script>' }), "https://getfortrip.com/");
  assert.ok(c && c.html.includes("GFT-1&quot;&gt;&lt;script&gt;"));
  assert.ok(!c!.html.includes("<script>"));
  const t = renderOutboxEmail("FLIGHT_TICKETED", JSON.stringify({ bookingId: "bkg_1" }), "https://getfortrip.com");
  assert.ok(t && t.html.includes("bkg_1") && t.html.includes("/my/bookings"));
  assert.equal(renderOutboxEmail("BOOKING_CONFIRMED", JSON.stringify({}), "https://getfortrip.com"), null);
});

test("unknown templates are never rendered", () => {
  assert.equal(renderOutboxEmail("MARKETING_BLAST", JSON.stringify({}), "https://getfortrip.com"), null);
});

test("C3: payment/cancel/refund/reject templates render with amounts and escape HTML", () => {
  const pay = renderOutboxEmail("PAYMENT_COMPLETED", JSON.stringify({ bookingNumber: "GFT-9", amountMinor: 123456 }), "https://getfortrip.com");
  assert.ok(pay && pay.subject.includes("결제") && pay.html.includes("123,456원") && pay.html.includes("GFT-9"));
  assert.equal(renderOutboxEmail("PAYMENT_COMPLETED", JSON.stringify({ bookingNumber: "GFT-9" }), "https://getfortrip.com"), null);
  const cx = renderOutboxEmail("BOOKING_CANCELLED", JSON.stringify({ bookingNumber: 'GFT-1"><b>' }), "https://getfortrip.com");
  assert.ok(cx && cx.html.includes("GFT-1&quot;&gt;&lt;b&gt;") && !cx.html.includes('"><b>'));
  const rf = renderOutboxEmail("REFUND_COMPLETED", JSON.stringify({ bookingId: "bkg_2", amountMinor: 50000 }), "https://getfortrip.com");
  assert.ok(rf && rf.subject.includes("50,000원") && rf.html.includes("bkg_2"));
  const rj = renderOutboxEmail("SUPPLIER_REJECTED", JSON.stringify({ bookingNumber: "GFT-3" }), "https://getfortrip.com");
  assert.ok(rj && rj.subject.includes("공급사") && rj.html.includes("전액 환불"));
});

test("C3: SMS/KAKAO enqueue fails closed (no sender exists)", async () => {
  const { outboxInsert } = await import("../../src/services/email-service.ts");
  const fakeDb = { prepare: () => ({ bind: () => ({}) }) } as any;
  assert.throws(() => outboxInsert(fakeDb, "SMS", "010-0000-0000", "X", {}), /not implemented/);
  assert.throws(() => outboxInsert(fakeDb, "KAKAO", "010-0000-0000", "X", {}), /not implemented/);
  assert.doesNotThrow(() => outboxInsert(fakeDb, "EMAIL", "a@b.c", "X", {}));
});
