import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEnvelope, buildEvent, captureException, parseDsn, parseStack, scrubPII,
} from "../../src/lib/sentry.ts";
import type { Env } from "../../src/env.ts";

const DSN = "https://abc123public@example.com/42";
const envWithDsn = { SENTRY_DSN: DSN, APP_ENV: "test" } as Env;
const envWithoutDsn = { APP_ENV: "test" } as Env;

test("sentry: DSN parsing accepts https/http project DSNs, rejects junk", () => {
  assert.deepEqual(parseDsn(DSN), { protocol: "https", host: "example.com", projectId: "42", publicKey: "abc123public" });
  assert.deepEqual(parseDsn("http://key@selfhost.local:9000/7")?.projectId, "7");
  assert.equal(parseDsn(""), null);
  assert.equal(parseDsn("not-a-url"), null);
  assert.equal(parseDsn("https://example.com/42"), null); // no public key
  assert.equal(parseDsn("https://key@example.com/nope"), null); // non-numeric project
  assert.equal(parseDsn("ftp://key@example.com/42"), null);
});

test("sentry: PII scrubbing redacts emails and secret query params", () => {
  assert.equal(scrubPII("contact dnjstjqp@naver.com please"), "contact [email] please");
  assert.equal(
    scrubPII("https://x.test/cb?token=abc&next=/ok&password=hunter2"),
    "https://x.test/cb?token=[redacted]&next=/ok&password=[redacted]",
  );
  assert.equal(scrubPII("plain message"), "plain message");
});

test("sentry: stack parsing keeps file/line/col, oldest call first", () => {
  const frames = parseStack("Error: boom\n    at outer (app.js:10:5)\n    at inner (lib.js:3:1)\n    at async weird");
  assert.equal(frames.length, 2);
  assert.equal(frames[0].filename, "lib.js");
  assert.equal(frames[0].lineno, 3);
  assert.equal(frames[1].function, "outer");
});

test("sentry: event carries a 32-hex id, level, request context, scrubbed message", () => {
  const event = buildEvent(new TypeError("bad dnjstjqp@naver.com"), { url: "https://h.test/api?token=t", method: "GET", environment: "test" });
  assert.match(String(event.event_id), /^[0-9a-f]{32}$/);
  assert.equal(event.level, "error");
  assert.equal(event.environment, "test");
  const exc = (event.exception as any).values[0];
  assert.equal(exc.type, "TypeError");
  assert.ok(!String(exc.value).includes("@"), String(exc.value));
  assert.equal((event.request as any).url, "https://h.test/api?token=[redacted]");
});

test("sentry: envelope posts to /api/{project}/envelope/ with auth header", () => {
  const req = buildEnvelope(DSN, buildEvent(new Error("x")));
  assert.ok(req);
  assert.equal(req!.url, "https://example.com/api/42/envelope/");
  assert.match(req!.headers["X-Sentry-Auth"], /sentry_key=abc123public/);
  const lines = req!.body.split("\n");
  assert.equal(lines.length, 4); // header, item header, payload, trailing newline
  assert.equal(JSON.parse(lines[1]).type, "event");
  assert.equal(JSON.parse(lines[2]).level, "error");
  assert.equal(buildEnvelope("junk", {}), null);
});

test("sentry: capture sends the envelope through waitUntil (red drill)", async () => {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const waited: Promise<unknown>[] = [];
  const ok = captureException(
    envWithDsn,
    { waitUntil: (p) => void waited.push(p) },
    new Error("worker blew up"),
    { url: "https://h.test/api/v1/x", method: "POST" },
    async (url, init) => void calls.push({ url, init }),
  );
  assert.equal(ok, true);
  await Promise.all(waited);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.com/api/42/envelope/");
  const payload = JSON.parse(String(calls[0].init.body).split("\n")[2]);
  assert.equal(payload.exception.values[0].value, "worker blew up");
  assert.equal(payload.environment, "test");
});

test("sentry: capture is a silent no-op without a DSN or with a bad DSN", () => {
  let called = 0;
  const transport = async () => void called++;
  assert.equal(captureException(envWithoutDsn, null, new Error("x"), {}, transport), false);
  assert.equal(captureException({ SENTRY_DSN: "junk" } as Env, null, new Error("x"), {}, transport), false);
  assert.equal(called, 0);
});

test("sentry: capture never throws, even with a failing transport", () => {
  assert.doesNotThrow(() =>
    captureException(envWithDsn, null, null, {}, async () => { throw new Error("net down"); }),
  );
  assert.doesNotThrow(() => captureException({} as Env, null, undefined));
});

test("sentry: event carries the release tag when configured, omits it otherwise", () => {
  assert.equal(buildEvent(new Error("x"), { release: "abc1234" }).release, "abc1234");
  assert.equal("release" in buildEvent(new Error("x"), {}), false);
  assert.equal("release" in buildEvent(new Error("x"), { release: "" }), false);
});

test("sentry: capture forwards SENTRY_RELEASE from env into the payload", async () => {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const waited: Promise<unknown>[] = [];
  const ok = captureException(
    { SENTRY_DSN: DSN, SENTRY_RELEASE: "deadbee", APP_ENV: "test" } as Env,
    { waitUntil: (p) => void waited.push(p) },
    new Error("tagged"),
    {},
    async (url, init) => void calls.push({ url, init }),
  );
  assert.equal(ok, true);
  await Promise.all(waited);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(String(calls[0].init.body).split("\n")[2]).release, "deadbee");
});
