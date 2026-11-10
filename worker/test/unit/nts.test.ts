import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { normalizeBizNo, verifyBusinessNumber } from "../../src/services/business-verify.ts";

/** NTS business-status contract tests against a local stub (C2). */

let handler: (body: any) => { status: number; json: any } = () => ({ status: 500, json: {} });
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const r = handler(body);
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r.json));
  });
});

let stub = "";
before(async () => {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const a = server.address();
  stub = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
after(async () => { await new Promise((res) => server.close(() => res(null))); });

const env = (over: Record<string, string> = {}) => ({ APP_ENV: "test", NTS_API_KEY: "stub-key", NTS_API_BASE: stub, ...over }) as any;

test("C2: hyphens are stripped, non-10-digit numbers rejected", async () => {
  assert.equal(normalizeBizNo("123-45-67890"), "1234567890");
  await assert.rejects(() => verifyBusinessNumber(env(), "12345"), (e: any) => e.code === "INVALID_BIZ_NO");
});

test("C2: only 01 계속사업자 counts as verified", async () => {
  handler = (body) => {
    assert.deepEqual(body, { b_no: ["1234567890"] });
    return { status: 200, json: { data: [{ b_no: "1234567890", b_stt: "계속사업자", b_stt_cd: "01" }] } };
  };
  const ok = await verifyBusinessNumber(env(), "123-45-67890");
  assert.equal(ok.valid, true);
  assert.equal(ok.statusCode, "01");
  handler = () => ({ status: 200, json: { data: [{ b_no: "1234567890", b_stt: "폐업자", b_stt_cd: "03" }] } });
  const dead = await verifyBusinessNumber(env(), "1234567890");
  assert.equal(dead.valid, false);
  assert.equal(dead.status, "폐업자");
});

test("C2: missing key and service errors surface explicitly", async () => {
  await assert.rejects(() => verifyBusinessNumber({ APP_ENV: "test" } as any, "1234567890"), (e: any) => e.code === "NTS_NOT_CONFIGURED");
  handler = () => ({ status: 500, json: {} });
  await assert.rejects(() => verifyBusinessNumber(env(), "1234567890"), (e: any) => e.code === "NTS_LOOKUP_FAILED");
  handler = () => ({ status: 200, json: { data: [] } });
  await assert.rejects(() => verifyBusinessNumber(env(), "1234567890"), (e: any) => e.code === "NTS_LOOKUP_FAILED");
});
