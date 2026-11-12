import { test } from "node:test";
import assert from "node:assert/strict";
import { pageMeta, pageParams } from "../../src/lib/pagination.ts";

const url = (q: string) => new URL(`https://test.local/x${q}`);

// #110: shared pagination parsing and metadata.
test("pagination: page/pageSize clamp, legacy limit honored, meta math", () => {
  assert.deepEqual(pageParams(url("?page=2&pageSize=50")), { page: 2, pageSize: 50, offset: 50 });
  assert.deepEqual(pageParams(url("?page=0&pageSize=9999")), { page: 1, pageSize: 200, offset: 0 });
  assert.deepEqual(pageParams(url("?limit=5")), { page: 1, pageSize: 5, offset: 0 });
  assert.deepEqual(pageParams(url("?page=bogus&pageSize=bogus")), { page: 1, pageSize: 20, offset: 0 });
  assert.deepEqual(pageParams(url(""), 10, 50), { page: 1, pageSize: 10, offset: 0 });
  assert.deepEqual(pageMeta(0, 1, 20), { page: 1, pageSize: 20, total: 0, totalPages: 1 });
  assert.deepEqual(pageMeta(41, 2, 20), { page: 2, pageSize: 20, total: 41, totalPages: 3 });
});
