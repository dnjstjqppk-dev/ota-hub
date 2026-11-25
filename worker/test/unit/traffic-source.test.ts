import { test } from "node:test";
import assert from "node:assert/strict";
import { attributionFromRequest, classifyTrafficSource, ownHostsOf } from "../../src/services/traffic-source.ts";

const OWN = ["getfortrip.com"];

test("ai engines classify from referrer hosts, subdomains, and utm", () => {
  for (const h of [
    "https://chatgpt.com/share/x", "https://chat.openai.com/c/1", "https://openai.com/index",
    "https://www.perplexity.ai/search?q=1", "https://copilot.microsoft.com/c/2",
    "https://gemini.google.com/app/3", "https://claude.ai/chat/4", "https://www.anthropic.com/x",
    "https://meta.ai/chat", "https://grok.com/share", "https://x.ai/api", "https://you.com/search",
    "https://poe.com/bot",
  ]) {
    assert.equal(classifyTrafficSource({ referrer: h }, OWN), "ai_answer", h);
  }
  for (const u of ["chatgpt", "perplexity", "copilot", "gemini", "claude", "grok"]) {
    assert.equal(classifyTrafficSource({ utmSource: u }, OWN), "ai_answer", u);
  }
  assert.equal(classifyTrafficSource({ utmSource: "google", utmMedium: "cpc" }, OWN), "paid");
});

test("organic social referral direct and self-exclusion", () => {
  assert.equal(classifyTrafficSource({ referrer: "https://www.google.co.kr/search?q=1" }, OWN), "organic");
  assert.equal(classifyTrafficSource({ referrer: "https://search.naver.com/search.naver?query=1" }, OWN), "organic");
  assert.equal(classifyTrafficSource({ referrer: "https://www.bing.com/search?q=1" }, OWN), "organic");
  assert.equal(classifyTrafficSource({ utmSource: "naver" }, OWN), "organic");
  assert.equal(classifyTrafficSource({ referrer: "https://www.instagram.com/p/1" }, OWN), "social");
  assert.equal(classifyTrafficSource({ referrer: "https://x.com/a/status/1" }, OWN), "social");
  assert.equal(classifyTrafficSource({ utmSource: "newsletter", utmMedium: "email", referrer: "https://blog.example.com/p" }, OWN), "referral");
  assert.equal(classifyTrafficSource({ referrer: "https://blog.example.com/p" }, OWN), "referral");
  assert.equal(classifyTrafficSource({ utmSource: "partner", utmMedium: "cpc" }, OWN), "paid");
  assert.equal(classifyTrafficSource({}, OWN), "direct");
  assert.equal(classifyTrafficSource({ referrer: "not a url [[[" }, OWN), "direct");
  assert.equal(classifyTrafficSource({ referrer: "https://getfortrip.com/hotels" }, OWN), "direct");
  assert.equal(classifyTrafficSource({ referrer: "https://en.getfortrip.com/x" }, OWN), "direct");
  assert.equal(classifyTrafficSource({ referrer: "http://localhost:3000/" }, [...OWN, "localhost", "127.0.0.1"]), "direct");
  assert.equal(ownHostsOf({ PUBLIC_SITE_URL: "https://getfortrip.com/" } as any)[0], "getfortrip.com");
});

test("attribution headers map to source plus session, absence stays null", () => {
  const req = (h: Record<string, string>) => new Request("https://x.test/api/v1/hotels", { headers: h });
  assert.equal(attributionFromRequest(req({})), null);
  assert.deepEqual(attributionFromRequest(req({ "X-Session-Id": "s1" }), OWN), { source: "direct", sessionId: "s1" });
  assert.deepEqual(
    attributionFromRequest(req({ "X-Session-Id": "s2", "X-Landing-Ref": "https://claude.ai/chat/9", "X-Landing-Utm": "utm_source=x&utm_medium=y" }), OWN),
    { source: "ai_answer", sessionId: "s2" },
  );
  assert.deepEqual(
    attributionFromRequest(req({ "X-Landing-Ref": "https://www.google.com/search", "X-Landing-Utm": "utm_medium=cpc" }), OWN),
    { source: "paid", sessionId: null },
  );
});
