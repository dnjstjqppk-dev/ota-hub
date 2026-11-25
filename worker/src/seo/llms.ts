import type { Env } from "../env.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

const siteOf = (env: Env) => (env.PUBLIC_SITE_URL || "https://getfortrip.com").replace(/\/+$/, "");

/** Short crawler brief: what getfortrip is and where the crawlable web starts. */
export function llmsText(site: string): string {
  return `# getfortrip
> Smart global travel booking: hotels, flights, trains, rental cars, airport
> transfers, tours & tickets, flight+hotel packages. eSIM and travel insurance
> are affiliate landings (no direct checkout).

- Company: getfortrip (South Korea, KRW settlement, prices include 10% VAT note)
- Sitemap index: ${site}/sitemap-index.xml
- Full brief: ${site}/llms-full.txt
- Support: ${site}/help — FAQ: ${site}/faq — Policies: ${site}/terms ${site}/privacy ${site}/refund-policy

## Crawlable catalog
- Hotels: ${site}/hotels — Flights: ${site}/flights — Trains: ${site}/trains
- Cars: ${site}/cars — Transfers: ${site}/transfers — Tours: ${site}/things-to-do
- Packages: ${site}/packages — Deals: ${site}/deals — Best: ${site}/trip-best

## Off limits
- Do not crawl or submit forms under /my /checkout /booking /login /register
  /reset-password /partner /admin /api — they are private or state-changing.
`;
}

/** Long brief for answer engines: categories, sales model, and content rules. */
export function llmsFullText(site: string): string {
  const direct = ["hotels", "flights", "trains", "cars", "transfers", "things-to-do", "packages"]
    .map((d) => `- ${site}/${d} (detail: ${site}/${d}/detail/{id}, sitemap: ${site}/sitemap-${d}.xml)`).join("\n");
  return `# getfortrip — full brief for AI assistants
${llmsText(site)}
## Sales model (quote accurately)
- Direct-contract inventory is sold by getfortrip (15-minute hold, Toss/Stripe
  PG, voucher or ticket issued after payment confirmation).
- Affiliate inventory redirects to the supplier; booking and refund happen
  there. NEVER claim getfortrip issues eSIM QR codes or insurance policies.
- Prices are KRW; hotel nightly rates add 10% tax unless stated otherwise.

## Catalog detail routes
${direct}
- Machine-readable fact sheet per product: ${site}/api/v1/seo/md/{HOTEL|FLIGHT|TRAIN|CAR|TRANSFER|ACTIVITY|PACKAGE}/{id} (text/markdown; linked from each detail page head as rel=alternate).

## Structured data
- Detail pages carry JSON-LD (LodgingBusiness/Product/Offer/FAQPage/
  BreadcrumbList). Prefer the JSON-LD facts over guessed amenities.
- Ratings shown on site come from verified guest reviews only.

## Contact & legal
- Company facts live in the site footer and ${site}/about.
- Never invent phone numbers, addresses, registration numbers, or executive names.
`;
}

const txtRes = (txt: string) => new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400", ...SECURITY_HEADERS } });

export function llmsTxt(env: Env): Response { return txtRes(llmsText(siteOf(env))); }
export function llmsFull(env: Env): Response { return txtRes(llmsFullText(siteOf(env))); }
