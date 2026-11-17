import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BREAKER_DEFAULT_COOLDOWN_MS,
  BREAKER_THRESHOLD,
  breakerAllows,
  breakerCooldownMs,
  breakerStatus,
  recordBreakerFailure,
  recordBreakerSuccess,
  resetBreakers,
} from "../../src/suppliers/circuit.ts";

/** TG-18: circuit-breaker state machine (fake clock, no I/O). */

beforeEach(() => resetBreakers());

test("circuit: closed by default, trips after 3 consecutive failures", () => {
  assert.equal(BREAKER_THRESHOLD, 3);
  assert.equal(breakerStatus("ndc", { now: 1000 }).state, "CLOSED");
  recordBreakerFailure("ndc", { now: 1000 });
  recordBreakerFailure("ndc", { now: 1001 });
  assert.equal(breakerStatus("ndc", { now: 1002 }).state, "CLOSED");
  assert.equal(breakerAllows("ndc", { now: 1002 }), true);
  recordBreakerFailure("ndc", { now: 1003 });
  const st = breakerStatus("ndc", { now: 1004 });
  assert.equal(st.state, "OPEN");
  assert.equal(st.failures, 3);
  assert.ok(st.retryAfterSec > 0);
  assert.equal(breakerAllows("ndc", { now: 1004 }), false);
});

test("circuit: success resets the failure count before the trip", () => {
  recordBreakerFailure("ndc", { now: 1 });
  recordBreakerFailure("ndc", { now: 2 });
  recordBreakerSuccess("ndc");
  recordBreakerFailure("ndc", { now: 3 });
  recordBreakerFailure("ndc", { now: 4 });
  assert.equal(breakerStatus("ndc", { now: 5 }).state, "CLOSED");
});

test("circuit: half-open probe after cooldown; success closes, failure re-opens", () => {
  const cd = 60_000;
  recordBreakerFailure("ndc", { now: 0 });
  recordBreakerFailure("ndc", { now: 0 });
  recordBreakerFailure("ndc", { now: 0 });
  assert.equal(breakerStatus("ndc", { now: cd - 1, cooldownMs: cd }).state, "OPEN");
  assert.equal(breakerStatus("ndc", { now: cd, cooldownMs: cd }).state, "HALF");
  assert.equal(breakerAllows("ndc", { now: cd, cooldownMs: cd }), true);
  // Failed probe re-arms the full cooldown from the probe time.
  recordBreakerFailure("ndc", { now: cd });
  assert.equal(breakerStatus("ndc", { now: cd + cd - 1, cooldownMs: cd }).state, "OPEN");
  assert.equal(breakerStatus("ndc", { now: cd + cd, cooldownMs: cd }).state, "HALF");
  recordBreakerSuccess("ndc");
  const st = breakerStatus("ndc", { now: cd + cd + 1, cooldownMs: cd });
  assert.equal(st.state, "CLOSED");
  assert.equal(st.failures, 0);
  assert.equal(st.retryAfterSec, 0);
});

test("circuit: breakers are independent per adapter", () => {
  recordBreakerFailure("ndc", { now: 0 });
  recordBreakerFailure("ndc", { now: 0 });
  recordBreakerFailure("ndc", { now: 0 });
  assert.equal(breakerStatus("ndc", { now: 1 }).state, "OPEN");
  assert.equal(breakerStatus("gds", { now: 1 }).state, "CLOSED");
});

test("circuit: cooldown parses and clamps (default 300000, 1000–3600000)", () => {
  assert.equal(BREAKER_DEFAULT_COOLDOWN_MS, 300_000);
  assert.equal(breakerCooldownMs({}), 300_000);
  assert.equal(breakerCooldownMs({ SUPPLIER_BREAKER_COOLDOWN_MS: "3000" }), 3000);
  assert.equal(breakerCooldownMs({ SUPPLIER_BREAKER_COOLDOWN_MS: "nope" }), 300_000);
  assert.equal(breakerCooldownMs({ SUPPLIER_BREAKER_COOLDOWN_MS: "10" }), 1000);
  assert.equal(breakerCooldownMs({ SUPPLIER_BREAKER_COOLDOWN_MS: "99999999" }), 3_600_000);
});
