import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../../src/lib/auth.ts";
import { fakeDb, fakeRequest } from "./_fakedb.ts";

const envFor = (count: number, throws = false) => ({
  DB: fakeDb({
    first: () => {
      if (throws) throw new Error("db down");
      return { c: count };
    },
    run: () => {
      if (throws) throw new Error("db down");
      return { meta: { changes: 1 } };
    },
  }),
}) as any;

const req = () => fakeRequest({ "CF-Connecting-IP": "198.51.100.7" });

// #110: the limiter trips at the configured count and fails closed on DB errors.
test("rateLimit: allows under the limit, 429s at it, 503s when blind", async () => {
  await rateLimit(req(), envFor(19), "bkt", 20, 60);
  await assert.rejects(rateLimit(req(), envFor(20), "bkt", 20, 60), (e: any) => e.code === "TOO_MANY_REQUESTS");
  await assert.rejects(rateLimit(req(), envFor(0, true), "bkt", 20, 60), (e: any) => e.code === "RATE_LIMIT_UNAVAILABLE");
});
