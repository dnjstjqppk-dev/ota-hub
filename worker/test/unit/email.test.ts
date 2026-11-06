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
