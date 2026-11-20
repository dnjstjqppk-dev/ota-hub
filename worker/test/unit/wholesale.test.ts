/**
 * Phase 2 wholesale: config gates, Net+margin+fee pricing, eSIM/voucher
 * adapters, 500 ms pre-checkout verify, and artefact parsing. All supplier
 * answers come from the loopback stub below; nothing is mocked in the code.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { Env } from "../../src/env.ts";
import { HttpError } from "../../src/lib/http.ts";
import { resetBreakers, recordBreakerFailure } from "../../src/suppliers/circuit.ts";
import { adapterFor, type SupplierContext } from "../../src/suppliers/adapter.ts";
import { resolveWholesaleConfig, wholesaleConfigured, wholesaleKind, wholesaleBreakerKey } from "../../src/suppliers/wholesale-config.ts";
import { esimWholesaleAdapter } from "../../src/suppliers/wholesale-esim.ts";
import { voucherWholesaleAdapter } from "../../src/suppliers/wholesale-voucher.ts";
import { wholesaleKrw } from "../../src/domain/wholesale-pricing.ts";
import { verifyWholesaleQuote } from "../../src/services/wholesale-verify.ts";
import { tryParseWholesaleArtefacts, voucherArtefacts } from "../../src/domain/wholesale-artefacts.ts";
import { assertWholesaleDomain, bookabilityOf, type SupplierRow } from "../../src/services/catalog.ts";
import { fakeDb } from "./_fakedb.ts";

let stub = "";
let mode: "ok" | "malformed" | "refuse" = "ok";
const orderByKey = new Map<string, string>();
let orderSeq = 0;

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const send = (status: number, json: any) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (String(req.headers.authorization || "") !== "Bearer unit_secret") return send(401, { code: "UNAUTHORIZED" });
    const u = (req.url || "").split("?")[0];
    const idem = String(body.idempotencyKey || req.headers["idempotency-key"] || "");
    if (u === "/verify") {
      if (body.sku === "SKU_SLOW") return setTimeout(() => send(200, { available: true, netMinor: 1, netCurrency: "USD" }), 700);
      if (body.sku === "SKU_SOLDOUT") return send(200, { available: false });
      if (body.sku === "SKU_OK") return send(200, { available: true, netMinor: 1000, netCurrency: "USD" });
      return send(404, { code: "SKU_UNKNOWN" });
    }
    const order = u.match(/^\/(esim|voucher)\/orders$/);
    if (req.method === "POST" && order) {
      if (mode === "refuse") return send(400, { code: "NO_AVAILABILITY", message: "sold out" });
      if (mode === "malformed") return send(200, { nope: true });
      const replay = orderByKey.get(idem);
      if (replay) return send(409, { code: "ORDER_DUPLICATE", reference: replay });
      orderSeq += 1;
      const ref = `WS-${orderSeq}`;
      orderByKey.set(idem, ref);
      return send(200, { reference: ref });
    }
    const cred = u.match(/^\/esim\/orders\/(.+)\/credentials$/);
    if (req.method === "POST" && cred) {
      if (mode === "malformed") return send(200, { nope: true });
      return send(200, { lpa: "LPA:1$SMDP.IO$AC-1", qrPayload: "LPA:1$SMDP.IO$AC-1$XX", iccid: "8982" });
    }
    const tkt = u.match(/^\/voucher\/orders\/(.+)\/tickets$/);
    if (req.method === "POST" && tkt) {
      if (mode === "malformed") return send(200, { vouchers: [{ nope: 1 }] });
      return send(200, { vouchers: [{ code: "VCH-1", barcode: "BC-1", pdfUrl: "https://cdn.example.com/v/1.pdf" }] });
    }
    const cxl = u.match(/^\/(esim|voucher)\/orders\/(.+)\/cancel$/);
    if (req.method === "POST" && cxl) {
      if (cxl[2].includes("REJ")) return send(409, { code: "CANCEL_REJECTED", message: "non-refundable" });
      return send(200, { cancelled: true, reference: cxl[2] });
    }
    return send(404, { code: "NOT_FOUND" });
  });
});

before(async () => {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const a = server.address();
  stub = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
after(async () => { await new Promise((res) => server.close(() => res(null))); });
beforeEach(() => { resetBreakers(); orderByKey.clear(); orderSeq = 0; mode = "ok"; });

function dbFor(first: (sql: string) => unknown, opts: { all?: (sql: string) => unknown[]; runs?: string[] } = {}) {
  return fakeDb({
    first: (sql) => first(sql),
    all: (sql) => (opts.all ? opts.all(sql) : []),
    run: (sql) => { opts.runs?.push(sql); return { meta: { changes: 1 } }; },
  });
}

const envFor = (db: any, appEnv = "test"): Env => ({
  APP_ENV: appEnv,
  DB: db,
  WHOLESALE_TIQETS_API_BASE: stub,
  WHOLESALE_TIQETS_API_KEY: "unit_secret",
  WHOLESALE_ROAMIFY_API_BASE: stub,
  WHOLESALE_ROAMIFY_API_KEY: "unit_secret",
} as unknown as Env);

const sup = (o: Partial<SupplierRow> = {}): SupplierRow => ({
  id: "sup_ws", name: "ws", adapter: "wholesale", integration_status: "LIVE",
  transaction_model: "AGENCY", settlement_rate_bps: 9000,
  wholesale_vendor: "tiqets", wholesale_margin_bps: 1000, ...o,
} as SupplierRow);

const ctx = (domain: string, ref: string | null = null): SupplierContext => ({
  bookingId: "bkg_ws1", domain, itemId: "act_1", travelerCount: 2, supplierReference: ref, simulation: {},
});

test("wholesale config: loopback in test, https-only in production, no silent vendor", () => {
  const env = envFor(dbFor(() => null));
  assert.equal(wholesaleKind("tiqets"), "VOUCHER");
  assert.equal(wholesaleKind("roamify"), "ESIM");
  assert.equal(wholesaleKind("nope"), null);
  assert.ok(resolveWholesaleConfig(env, "tiqets"));
  assert.equal(resolveWholesaleConfig(env, "klook"), null);
  assert.equal(resolveWholesaleConfig(env, "nope"), null);
  assert.equal(wholesaleConfigured(env, "tiqets"), true);
  assert.equal(wholesaleConfigured(env, null), false);
  assert.equal(wholesaleConfigured(undefined, "tiqets"), false);
  const prod = envFor(dbFor(() => null), "production");
  assert.equal(resolveWholesaleConfig(prod, "tiqets"), null);
});

test("wholesale pricing: Net + FX + margin + PG fee in integer minor units", () => {
  const esim = wholesaleKrw({ kind: "ESIM", netMinor: 1000, netCurrency: "USD", fxToKrw: 1350, marginBps: 3000 });
  assert.deepEqual(esim, { netKrwMinor: 13500, marginMinor: 4050, feeMinor: 527, totalMinor: 18077 });
  const v = wholesaleKrw({ kind: "VOUCHER", netMinor: 2000, netCurrency: "EUR", fxToKrw: 1450, marginBps: 1000 });
  assert.deepEqual(v, { netKrwMinor: 29000, marginMinor: 2900, feeMinor: 957, totalMinor: 32857 });
  const krw = wholesaleKrw({ kind: "VOUCHER", netMinor: 10000, netCurrency: "KRW", fxToKrw: 1, marginBps: 800 });
  assert.equal(krw.netKrwMinor, 10000);
  assert.throws(() => wholesaleKrw({ kind: "ESIM", netMinor: 100, netCurrency: "USD", fxToKrw: 1350, marginBps: 1500 }), (e: any) => e?.code === "MARGIN_OUT_OF_RANGE");
  assert.throws(() => wholesaleKrw({ kind: "VOUCHER", netMinor: 100, netCurrency: "USD", fxToKrw: 1350, marginBps: 2000 }), (e: any) => e?.code === "MARGIN_OUT_OF_RANGE");
  assert.throws(() => wholesaleKrw({ kind: "VOUCHER", netMinor: 0, netCurrency: "USD", fxToKrw: 1350, marginBps: 1000 }), (e: any) => e?.code === "INVALID_NET_PRICE");
});

test("eSIM adapter: order, replay, credentials, cancel, domain guard", async () => {
  const env = envFor(dbFor((sql) => (sql.includes("FROM bookings") ? { supplier_id: "sup_ws" } : sql.includes("FROM wholesale_skus") ? { sku: "ESIM-PLAN-1" } : null)));
  const cfg = resolveWholesaleConfig(env, "roamify")!;
  const a = esimWholesaleAdapter(env, cfg);
  assert.equal(a.name, "wholesale:roamify");
  const b = await a.book(ctx("ESIM"));
  assert.equal(b.outcome, "CONFIRMED");
  if (b.outcome !== "CONFIRMED") return;
  assert.deepEqual(await a.book(ctx("ESIM")), b);
  const t = await a.ticket(ctx("ESIM", b.reference));
  assert.equal(t.outcome, "ISSUED");
  if (t.outcome !== "ISSUED") return;
  assert.deepEqual(t.ticketNumbers, ["esim:lpa:LPA:1$SMDP.IO$AC-1", "esim:qr:LPA:1$SMDP.IO$AC-1$XX"]);
  const c = await a.cancel(ctx("ESIM", b.reference));
  assert.equal(c.outcome, "CANCELLED");
  assert.equal((await a.book(ctx("ACTIVITY"))).outcome, "FAILED");
  const rej = await a.cancel(ctx("ESIM", "WS-REJ"));
  assert.equal(rej.outcome, "REJECTED");
});

test("voucher adapter: order, tickets, cancel; malformed and refused answers never confirm", async () => {
  const env = envFor(dbFor((sql) => (sql.includes("FROM bookings") ? { supplier_id: "sup_ws", service_start: "2027-03-01T00:00:00Z" } : sql.includes("FROM wholesale_skus") ? { sku: "V-1" } : null)));
  const cfg = resolveWholesaleConfig(env, "tiqets")!;
  const a = voucherWholesaleAdapter(env, cfg);
  const b = await a.book(ctx("ACTIVITY"));
  assert.equal(b.outcome, "CONFIRMED");
  if (b.outcome !== "CONFIRMED") return;
  const t = await a.ticket(ctx("ACTIVITY", b.reference));
  assert.equal(t.outcome, "ISSUED");
  if (t.outcome !== "ISSUED") return;
  assert.deepEqual(t.ticketNumbers, ["voucher:code:VCH-1", "voucher:barcode:BC-1", "voucher:pdf:https://cdn.example.com/v/1.pdf"]);
  mode = "malformed";
  assert.equal((await a.ticket(ctx("ACTIVITY", b.reference))).outcome, "UNKNOWN");
  mode = "refuse";
  const f = await a.book({ ...ctx("ACTIVITY"), bookingId: "bkg_ws2" });
  assert.equal(f.outcome, "FAILED");
  if (f.outcome === "FAILED") assert.equal(f.code, "NO_AVAILABILITY");
  mode = "ok";
  assert.equal((await a.book(ctx("HOTEL"))).outcome, "FAILED");
});

test("adapterFor: wholesale resolves by vendor, unconfigured resolves honestly", () => {
  const env = envFor(dbFor(() => null));
  assert.equal(adapterFor("wholesale", env, "tiqets").name, "wholesale:tiqets");
  assert.equal(adapterFor("wholesale", env, "roamify").name, "wholesale:roamify");
  assert.equal(adapterFor("wholesale", env, "klook").name, "none");
  assert.equal(adapterFor("wholesale", env, null).name, "none");
});

test("verify: live match passes, drift expires the quote, stockout refuses", async () => {
  const runs: string[] = [];
  const db = dbFor(
    (sql) => (sql.includes("FROM wholesale_skus") ? { sku: "SKU_OK" } : null),
    { all: (sql) => (sql.includes("FROM fx_rates") ? [{ currency: "USD", rate_to_krw: 1350 }] : []), runs },
  );
  const env = envFor(db);
  const live = wholesaleKrw({ kind: "VOUCHER", netMinor: 1000, netCurrency: "USD", fxToKrw: 1350, marginBps: 1000 });
  const input = { domain: "ACTIVITY", itemId: "act_1", serviceDate: "2027-03-01", quantity: 2, expectedTotalMinor: live.totalMinor, quoteId: "qt_1" };
  assert.equal(await verifyWholesaleQuote(env, sup(), input), live.totalMinor);
  await assert.rejects(verifyWholesaleQuote(env, sup(), { ...input, expectedTotalMinor: live.totalMinor - 1 }), (e: any) => e instanceof HttpError && (e as any).code === "PRICE_CHANGED");
  assert.ok(runs.some((s) => s.includes("UPDATE quotes SET status = 'EXPIRED'")));
  const soldDb = dbFor(
    (sql) => (sql.includes("FROM wholesale_skus") ? { sku: "SKU_SOLDOUT" } : null),
    { all: () => [{ currency: "USD", rate_to_krw: 1350 }] },
  );
  await assert.rejects(verifyWholesaleQuote(envFor(soldDb), sup(), input), (e: any) => e instanceof HttpError && (e as any).code === "SOLD_OUT");
});

test("verify: timeout, unmapped SKU, unset margin, and open breaker fail closed", async () => {
  const slowDb = dbFor(
    (sql) => (sql.includes("FROM wholesale_skus") ? { sku: "SKU_SLOW" } : null),
    { all: () => [{ currency: "USD", rate_to_krw: 1350 }] },
  );
  const input = { domain: "ACTIVITY", itemId: "act_1", serviceDate: "2027-03-01", quantity: 1, expectedTotalMinor: 1, quoteId: "qt_2" };
  await assert.rejects(verifyWholesaleQuote(envFor(slowDb), sup(), input), (e: any) => e instanceof HttpError && (e as any).code === "SUPPLIER_VERIFY_TIMEOUT");
  const unmappedDb = dbFor(() => null, { all: () => [{ currency: "USD", rate_to_krw: 1350 }] });
  await assert.rejects(verifyWholesaleQuote(envFor(unmappedDb), sup(), input), (e: any) => e instanceof HttpError && (e as any).code === "WHOLESALE_SKU_UNMAPPED");
  const okDb = dbFor(
    (sql) => (sql.includes("FROM wholesale_skus") ? { sku: "SKU_OK" } : null),
    { all: () => [{ currency: "USD", rate_to_krw: 1350 }] },
  );
  await assert.rejects(verifyWholesaleQuote(envFor(okDb), sup({ wholesale_margin_bps: null }), input), (e: any) => e instanceof HttpError && (e as any).code === "WHOLESALE_MARGIN_UNSET");
  recordBreakerFailure(wholesaleBreakerKey("tiqets"));
  recordBreakerFailure(wholesaleBreakerKey("tiqets"));
  recordBreakerFailure(wholesaleBreakerKey("tiqets"));
  await assert.rejects(verifyWholesaleQuote(envFor(okDb), sup(), input), (e: any) => e instanceof HttpError && (e as any).code === "SUPPLIER_CIRCUIT_OPEN");
});

test("artefacts: typed strings parse, unknown prefixes and http PDFs are rejected", () => {
  const p = tryParseWholesaleArtefacts(["esim:lpa:LPA:1$X", "esim:qr:QRX", "voucher:code:C1", "voucher:pdf:https://cdn.example.com/a.pdf"]);
  assert.deepEqual(p, { lpa: "LPA:1$X", qr: "QRX", codes: ["C1"], barcodes: [], pdfUrls: ["https://cdn.example.com/a.pdf"], raw: ["esim:lpa:LPA:1$X", "esim:qr:QRX", "voucher:code:C1", "voucher:pdf:https://cdn.example.com/a.pdf"] });
  assert.equal(tryParseWholesaleArtefacts(["180-3333333333"]), null);
  assert.equal(tryParseWholesaleArtefacts(["voucher:pdf:http://cdn.example.com/a.pdf"]), null);
  assert.equal(tryParseWholesaleArtefacts(["voucher:code:"]), null);
  assert.equal(tryParseWholesaleArtefacts([]), null);
  assert.equal(tryParseWholesaleArtefacts(["voucher:code:C1", "bogus:x"]), null);
  assert.deepEqual(voucherArtefacts([{ code: "C1", pdfUrl: "https://cdn.example.com/a.pdf" }]), ["voucher:code:C1", "voucher:pdf:https://cdn.example.com/a.pdf"]);
  assert.equal(voucherArtefacts([{ code: "C1", pdfUrl: "http://cdn.example.com/a.pdf" }]), null);
  assert.equal(voucherArtefacts([{ nope: 1 }]), null);
});

test("catalog gates: wholesale sells LIVE+configured, voucher/eSIM domains only", () => {
  const env = envFor(dbFor(() => null));
  assert.equal(bookabilityOf(env, sup()).bookable, true);
  assert.equal(bookabilityOf(env, sup()).mode, "LIVE");
  const uncfg = bookabilityOf(env, sup({ wholesale_vendor: "klook" }));
  assert.equal(uncfg.bookable, false);
  assert.equal(uncfg.reason, "SUPPLIER_API_NOT_CONFIGURED");
  assert.equal(bookabilityOf(env, sup({ integration_status: "NOT_INTEGRATED" })).bookable, false);
  assert.doesNotThrow(() => assertWholesaleDomain("ACTIVITY", sup()));
  assert.doesNotThrow(() => assertWholesaleDomain("ESIM", sup()));
  assert.throws(() => assertWholesaleDomain("HOTEL", sup()), (e: any) => e instanceof HttpError && (e as any).code === "WHOLESALE_DOMAIN_UNSUPPORTED");
  assert.doesNotThrow(() => assertWholesaleDomain("HOTEL", sup({ adapter: "direct_contract" })));
});
