#!/usr/bin/env node
/**
 * S10: SEO audit for the user portal (read-only GETs, so production runs are allowed).
 *
 * Usage: node scripts/seo-audit.mjs [BASE_URL]
 *   BASE_URL defaults to http://localhost:3000 (nuxt dev). For a wrangler dev
 *   user worker pass its URL explicitly (e.g. http://127.0.0.1:8811).
 *
 * Per page it checks: HTTP 200 HTML, non-empty title + description, an exact
 * canonical, the expected hreflang alternates, parseable JSON-LD, visible-text
 * parity for every FAQPage Q&A, and the absence of noindex. Exits 1 on any
 * failure. Detail pages need catalog data, so a local run without a working
 * hub API fails those pages honestly (503 HTML) instead of silently skipping.
 */

const BASE = (process.argv[2] || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

const PAGES = [
  { path: '/', alternates: 7 },
  { path: '/hotels', alternates: 7 },
  { path: '/hotels/detail/htl_seoul_01', alternates: 7 },
  { path: '/faq', alternates: 2 },
  { path: '/terms', alternates: 2 },
  { path: '/help', alternates: 2 },
  { path: '/esim', alternates: 7 },
];

const unesc = (s) => s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&apos;', "'");
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1].toLowerCase(), m[2]]));

let failed = 0;
function check(ok, label, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
}

async function auditPage({ path, alternates }) {
  console.log(`\n## ${path}`);
  let res;
  try {
    res = await fetch(BASE + path, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch (e) {
    check(false, 'fetch', String((e && e.message) || e));
    return;
  }
  check(res.status === 200, `HTTP 200`, `got ${res.status}`);
  if (res.status !== 200) return;
  const ct = res.headers.get('content-type') || '';
  check(ct.includes('text/html'), 'content-type html', ct);
  const html = await res.text();
  // Strip <script>, <style>, and HTML tags before FAQ parity so JSON-LD never self-matches.
  const visibleText = unesc(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );

  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  check(!!(title && title.trim()), 'title non-empty');

  const metas = [...html.matchAll(/<meta\s+[^>]*>/gi)].map((m) => attrs(m[0]));
  const desc = metas.find((m) => m.name === 'description');
  check(!!(desc && desc.content && desc.content.trim()), 'meta description non-empty');
  check(!metas.some((m) => m.name === 'robots' && (m.content || '').toLowerCase().includes('noindex')), 'no noindex robots meta');

  const links = [...html.matchAll(/<link\s+[^>]*>/gi)].map((m) => attrs(m[0]));
  const canonicals = links.filter((l) => l.rel === 'canonical');
  // Canonicals always point at production, even on local runs — compare the path.
  const canonOk = canonicals.length === 1 && (() => { try { return new URL(canonicals[0].href).pathname === path; } catch { return false; } })();
  check(canonOk, 'canonical path exact', JSON.stringify(canonicals.map((l) => l.href)));
  const alts = links.filter((l) => l.rel === 'alternate' && l.hreflang);
  check(alts.length === alternates, `hreflang ×${alternates}`, `got ${alts.length}`);
  check(alts.some((l) => l.hreflang === 'x-default'), 'x-default present');
  check(alts.every((l) => (l.href || '').startsWith('https://')), 'hreflang hrefs absolute https');

  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  check(blocks.length >= 1, `JSON-LD present (×${blocks.length})`);
  let parsed = 0;
  const faqs = [];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b);
      parsed++;
      const nodes = Array.isArray(data) ? data : [data];
      for (const n of nodes) {
        if (n && n['@type'] === 'FAQPage') faqs.push(...(n.mainEntity || []));
        for (const g of (n && n['@graph']) || []) {
          if (g && g['@type'] === 'FAQPage') faqs.push(...(g.mainEntity || []));
        }
      }
    } catch { /* counted below */ }
  }
  check(parsed === blocks.length, `JSON-LD parses (${parsed}/${blocks.length})`);
  if (faqs.length) {
    const missing = faqs.filter((q) => {
      const a = q.acceptedAnswer && (typeof q.acceptedAnswer === 'string' ? q.acceptedAnswer : q.acceptedAnswer.text);
      return !(q.name && visibleText.includes(q.name)) || !(a && visibleText.includes(a));
    });
    check(missing.length === 0, `FAQ visible parity (${faqs.length - missing.length}/${faqs.length})`, `${missing.length} pair(s) not in HTML`);
  } else {
    console.log('  SKIP FAQ parity (no FAQPage on page)');
  }
}

for (const p of PAGES) await auditPage(p);
console.log(failed ? `\nRESULT: ${failed} failing check(s)` : '\nRESULT: all checks passed');
process.exit(failed ? 1 : 0);
