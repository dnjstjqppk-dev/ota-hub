import { test } from "node:test";
import assert from "node:assert/strict";
import { generateText, scrubBlocked, scrubOutput, scrubPii } from "../../src/services/ai-service.ts";

/** TG-21: output filter (red drill 2) + generation fallback contract. */

test("ai: PII patterns mask, ordinary text passes through", () => {
  assert.equal(scrubPii("메일 a@b.co.kr 로 보내줘"), "메일 [이메일] 로 보내줘");
  assert.equal(scrubPii("전화 010-1234-5678"), "전화 [연락처]");
  assert.equal(scrubPii("02-123-4567 로 연락"), "[연락처] 로 연락");
  assert.equal(scrubPii("여권 M12345678 지참"), "여권 [여권번호] 지참");
  assert.equal(scrubPii("주민 900101-1234567"), "주민 [주민번호]");
  assert.equal(scrubPii("계좌 12345678901234"), "계좌 [번호]");
  // Near-misses stay: 6-char PNRs, short numbers, flight numbers.
  assert.equal(scrubPii("PNR AB7Q2X"), "PNR AB7Q2X");
  assert.equal(scrubPii("KE703 편"), "KE703 편");
  assert.equal(scrubPii("3박 4일"), "3박 4일");
});

test("ai: blocklist masks case-insensitively", () => {
  assert.ok(!scrubBlocked("이 씨발 호텔").includes("씨발"));
  assert.ok(scrubBlocked("이 씨발 호텔").includes("■■"));
  assert.equal(scrubBlocked("보통 문장"), "보통 문장");
});

test("ai: generateText resolves unavailable/error/null instead of throwing", async () => {
  const env = {} as any;
  assert.deepEqual(await generateText(env, { system: "s", user: "u" }), { text: null, source: "unavailable" });
  const ok = await generateText(env, { system: "s", user: "u" }, { run: async () => ({ response: "  답이다 a@b.co.kr " }) });
  assert.deepEqual(ok, { text: "답이다 [이메일]", source: "ai" });
  const empty = await generateText(env, { system: "s", user: "u" }, { run: async () => ({}) });
  assert.deepEqual(empty, { text: null, source: "error" });
  const boom = await generateText(env, { system: "s", user: "u" }, { run: async () => { throw new Error("down"); } });
  assert.deepEqual(boom, { text: null, source: "error" });
});
