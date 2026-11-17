import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDigestFor, digestBatch, fallbackDigest } from "../../src/services/review-digest.ts";
import { fakeDb } from "./_fakedb.ts";

/** TG-21: review digest fallback quotes, AI path, and batch recompute. */

const ROWS = [
  { rating: 5, comment: "뷰가 끝내줘요 010-1111-2222", created_at: "2026-11-10T00:00:00Z" },
  { rating: 4, comment: "조식 괜찮음", created_at: "2026-11-09T00:00:00Z" },
  { rating: 2, comment: "시끄러움", created_at: "2026-11-08T00:00:00Z" },
];

test("digest: fallback quotes top reviews with PII scrubbed", () => {
  const fb = fallbackDigest(ROWS);
  assert.equal(fb.avgRating, 3.7);
  assert.ok(fb.summary.includes("평점 3.7 (3개 리뷰)"));
  assert.ok(fb.summary.includes("[연락처]"), "quoted PII is masked");
  assert.ok(!fb.summary.includes("010-1111"));
  assert.deepEqual(fallbackDigest([]), { summary: "", avgRating: null });
});

function digestDb(reviews: any[], products?: any[]) {
  const writes: string[] = [];
  const db = fakeDb({
    all: (sql) => {
      if (sql.includes("SELECT DISTINCT domain_type")) return products || [];
      if (sql.includes("FROM reviews WHERE")) return reviews;
      return [];
    },
    run: (sql) => {
      writes.push(sql);
      return { meta: { changes: 1 } };
    },
  });
  return { db, writes };
}

test("digest: AI summary wins when usable, fallback covers the rest", async () => {
  const ai = { run: async () => ({ response: "AI 요약문" }) };
  const { db, writes } = digestDb(ROWS);
  const r = await computeDigestFor({ DB: db } as any, "HOTEL", "h1", ai as any);
  assert.equal(r?.source, "ai");
  assert.equal(r?.summary, "AI 요약문");
  assert.equal(r?.reviewCount, 3);
  assert.ok(writes.some((s) => s.includes("INTO review_digests")));

  const dead = { run: async () => { throw new Error("down"); } };
  const fb2 = digestDb(ROWS);
  const r2 = await computeDigestFor({ DB: fb2.db } as any, "HOTEL", "h1", dead as any);
  assert.equal(r2?.source, "fallback");
  assert.ok(r2!.summary.includes("평점"));
});

test("digest: products without visible reviews clear their row", async () => {
  const { db, writes } = digestDb([]);
  assert.equal(await computeDigestFor({ DB: db } as any, "HOTEL", "h9"), null);
  assert.ok(writes.some((s) => s.includes("DELETE FROM review_digests")));
});

test("digest: batch walks every reviewed product (or a scope)", async () => {
  const { db } = digestDb(ROWS, [{ domain: "HOTEL", item_id: "h1" }, { domain: "HOTEL", item_id: "h2" }]);
  const dead = { run: async () => { throw new Error("down"); } };
  const all = await digestBatch({ DB: db } as any, undefined, dead as any);
  assert.deepEqual(all, { computed: 2, cleared: 0 });
  const one = await digestBatch({ DB: db } as any, { domain: "HOTEL", itemId: "h1" }, dead as any);
  assert.deepEqual(one, { computed: 1, cleared: 0 });
});
