#!/usr/bin/env node
/**
 * C7: snapshot the public catalog for prerendering + first paint.
 *
 *   node scripts/gen-seo-snapshot.mjs
 *
 * Fetches GET /api/v1/seo/snapshot and writes:
 *   frontend-user/data/generatedCatalog.json  (first-paint facts per product)
 *   frontend-user/prerender-routes.json       (detail routes to prerender)
 *
 * Sources, in order: PRERENDER_API_BASE env, local wrangler dev (:8799),
 * currently deployed production API. When none answers, the committed files
 * are kept untouched so the build still works (possibly with older routes).
 */
import { writeFileSync, existsSync } from "node:fs";

const bases = [
  process.env.PRERENDER_API_BASE,
  "http://localhost:8799/api/v1",
  "https://ota-hub.dnjstjqppk.workers.dev/api/v1",
].filter(Boolean);

let snap = null;
let used = "";
for (const base of bases) {
  try {
    const res = await fetch(`${base}/seo/snapshot`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) continue;
    const j = await res.json();
    if (j && j.success && Array.isArray(j.routes)) {
      snap = j;
      used = base;
      break;
    }
  } catch {
    // try the next source
  }
}

if (!snap) {
  const have = existsSync("frontend-user/data/generatedCatalog.json") && existsSync("frontend-user/prerender-routes.json");
  console.log(`gen-seo-snapshot: no API answered; ${have ? "keeping committed files" : "WARNING: no snapshot files exist"}`);
  process.exit(0);
}

const products = {};
for (const p of snap.products || []) {
  if (!p || !p.domain || !p.id) continue;
  (products[p.domain] ||= {})[p.id] = {
    name: p.name ?? null,
    city: p.city ?? null,
    image: p.image ?? null,
    priceKrw: p.priceKrw ?? null,
    score: p.score ?? null,
    reviewCount: p.reviewCount ?? 0,
  };
}
writeFileSync("frontend-user/data/generatedCatalog.json", JSON.stringify({ generatedAt: snap.generatedAt, via: used, products }, null, 1) + "\n");
writeFileSync("frontend-user/prerender-routes.json", JSON.stringify(snap.routes, null, 1) + "\n");
console.log(`gen-seo-snapshot: ${snap.routes.length} routes from ${used}`);
