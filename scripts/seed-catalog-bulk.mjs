#!/usr/bin/env node
/**
 * TG-15: bulk-seed synthetic hotels into an isolated local D1 for the 100k-row
 * load assumption (list/detail p95 on a big table, LIMIT 100 paging).
 *   node scripts/seed-catalog-bulk.mjs <PERSIST_DIR> [COUNT]
 * One recursive-CTE INSERT (no 100k-round-trip loop). Synthetic rows are
 * prefixed htl_load_ and never touch production (localhost persist only).
 */
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const persist = process.argv[2];
const count = Math.max(1, Math.min(500000, parseInt(process.argv[3] || "100000", 10) || 100000));
if (!persist) {
  console.error("usage: node scripts/seed-catalog-bulk.mjs <PERSIST_DIR> [COUNT]");
  process.exit(1);
}

const sql = `INSERT INTO hotels (id, name_ko, name_en, city, country, address, base_price_krw)
WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < ${count})
SELECT 'htl_load_' || x, '부하호텔 ' || x, 'Load Hotel ' || x,
  CASE x % 5 WHEN 0 THEN '서울' WHEN 1 THEN '도쿄' WHEN 2 THEN '오사카' WHEN 3 THEN '방콕' ELSE '파리' END,
  '한국', '주소 ' || x, 50000 + (x % 200) * 1000 FROM c;`;

const file = join(tmpdir(), `bulk-seed-${Date.now()}.sql`);
writeFileSync(file, sql, "utf8");
execSync(`npx wrangler d1 execute ota_local --local -c wrangler.local.jsonc --persist-to "${persist}" --file "${file}"`, { stdio: "inherit" });
const out = execSync(
  `npx wrangler d1 execute ota_local --local -c wrangler.local.jsonc --persist-to "${persist}" --json --command "SELECT COUNT(*) AS c FROM hotels WHERE id LIKE 'htl_load_%'"`,
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
console.log(`bulk-seeded hotels: ${JSON.parse(out)[0].results[0].c} (want ${count})`);
