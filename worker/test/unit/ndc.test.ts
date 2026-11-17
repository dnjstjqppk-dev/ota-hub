import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { Env } from "../../src/env.ts";
import { adapterFor, type SupplierContext } from "../../src/suppliers/adapter.ts";
import { liveSupplierAdapter, resolveLiveConfig, supplierApiConfigured, assertSupplierAvailable } from "../../src/suppliers/live-adapter.ts";
import { breakerStatus, resetBreakers } from "../../src/suppliers/circuit.ts";
import { resetFareHotCache } from "../../src/suppliers/fare-cache.ts";
import { bookabilityOf, type SupplierRow } from "../../src/services/catalog.ts";

/**
 * TG-18: NDC adapter contract tests against a local stub of the airline
 * gateway. Proves the order/ticket/cancel roundtrip, idempotent PNR replay,
 * honest error mapping, breaker wiring, and simulator isolation — so
 * production certification only needs real credentials, no code changes.
 */

const KEY = "ndc_unit_secret";
let stub = "";

// Scenario flags (same process as the stub).
const scen = { offers500: false, offersEmpty: false, offersMalformed: false, orders500: false, ordersMalformed: false };
const seen: Array<{ method: string; url: string; auth: string; idem: string; body: any }> = [];
const orderByKey = new Map<string, { reference: string; pnr: string }>();
let orderSeq = 0;
let orderCalls = 0;
let ticketCalls = 0;

const offerShape = (id: string) => ({
  offerId: id, airline: "KE", flightNo: "KE703", from: "ICN", to: "NRT",
  date: "2027-01-10", amountMinor: 605000, currency: "KRW", expiresAt: "2027-01-10T00:00:00Z",
});

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    seen.push({ method: req.method || "", url: req.url || "", auth: String(req.headers.authorization || ""), idem: String(req.headers["idempotency-key"] || ""), body });
    const send = (status: number, json: any) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (String(req.headers.authorization || "") !== `Bearer ${KEY}`) return send(401, { code: "UNAUTHORIZED", message: "bad key" });
    const m = req.method || "";
    const u = (req.url || "").split("?")[0];
    if (m === "POST" && u === "/offers") {
      if (scen.offers500) return send(500, { code: "GATEWAY_DOWN" });
      if (String(body.airline || "") === "ZZ") return send(400, { code: "UNKNOWN_AIRLINE", message: "no such airline" });
      if (scen.offersEmpty) return send(200, { offers: [] });
      if (scen.offersMalformed) return send(200, { offers: [{ offerId: "broken" }] });
      return send(200, { offers: [offerShape("off_1"), offerShape("off_2")] });
    }
    if (m === "POST" && u === "/orders") {
      orderCalls += 1;
      const key = String(body.idempotencyKey || "");
      const replay = orderByKey.get(key);
      if (replay) return send(409, { code: "ORDER_DUPLICATE", ...replay });
      if (scen.orders500) return send(500, { code: "GATEWAY_DOWN" });
      if (String(body.flightNo || "") === "XX000") return send(400, { code: "NO_AVAILABILITY", message: "sold out" });
      if (scen.ordersMalformed) return send(200, { reference: "NDC-BAD" });
      orderSeq += 1;
      const row = { reference: `NDC-REF-${orderSeq}`, pnr: "KB7Q2X" };
      orderByKey.set(key, row);
      return send(200, row);
    }
    const ticket = u.match(/^\/orders\/(.+)\/ticket$/);
    if (m === "POST" && ticket) {
      ticketCalls += 1;
      if (ticket[1].includes("FAIL")) return send(400, { code: "TICKETING_REJECTED", message: "rejected" });
      return send(200, { ticketNumbers: ["180-1111111111", "180-2222222222"] });
    }
    const cancel = u.match(/^\/orders\/(.+)\/cancel$/);
    if (m === "POST" && cancel) {
      if (cancel[1].includes("REJ")) return send(409, { code: "CANCEL_REJECTED", message: "non-refundable" });
      return send(200, { cancelled: true, reference: cancel[1] });
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
beforeEach(() => {
  resetBreakers();
  resetFareHotCache();
  orderByKey.clear();
  orderSeq = 0;
  orderCalls = 0;
  ticketCalls = 0;
  scen.offers500 = scen.offersEmpty = scen.offersMalformed = scen.orders500 = scen.ordersMalformed = false;
});

// Manifest DB: one flight + one booking with two travelers.
function manifestDb(flightNo = "KE703") {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (sql.includes("FROM bookings")) {
                return args[0] === "bkg_missing" ? null : ({ service_start: "2027-01-10T10:10:00Z" } as T);
              }
              if (sql.includes("FROM flights")) {
                return args[0] === "flt_missing" ? null : ({ flight_number: flightNo, departure_airport: "ICN", arrival_airport: "NRT" } as T);
              }
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              if (sql.includes("FROM booking_travelers")) {
                if (args[0] === "bkg_empty") return { results: [] };
                return { results: [
                  { traveler_type: "ADULT", last_name_en: "KIM", first_name_en: "MINJI", birth_date: "1990-01-01", nationality: "KOR" },
                  { traveler_type: "ADULT", last_name_en: "LEE", first_name_en: "JUN", birth_date: "1988-02-02", nationality: "KOR" },
                ] as T[] };
              }
              return { results: [] };
            },
            async run(): Promise<unknown> { return { meta: { changes: 0 } }; },
          };
        },
      };
    },
  };
}

const envFor = (db: any, extra: Record<string, string> = {}): Env => ({
  APP_ENV: "test",
  DB: db,
  NDC_API_BASE: stub,
  NDC_API_KEY: KEY,
  ...extra,
} as unknown as Env);

const ctx = (bookingId: string, itemId = "flt_ke703", domain = "FLIGHT"): SupplierContext => ({
  bookingId, domain, itemId, travelerCount: 2, supplierReference: null, simulation: {},
});

const ndc = (db: any = manifestDb(), extra: Record<string, string> = {}) => {
  const env = envFor(db, extra);
  const cfg = resolveLiveConfig(env, "ndc");
  assert.ok(cfg);
  return { env, adapter: liveSupplierAdapter(env, cfg!) };
};

test("ndc: offers map the live list; empty is OK, 4xx FAILED, 5xx/malformed UNKNOWN", async () => {
  const { adapter } = ndc();
  const q = { origin: "ICN", destination: "NRT", date: "2027-01-10", adults: 2 };
  const ok = await adapter.offers!(q);
  assert.equal(ok.outcome, "OK");
  if (ok.outcome !== "OK") return;
  assert.equal(ok.offers.length, 2);
  assert.equal(ok.offers[0].amountMinor, 605000);
  assert.equal(seen[seen.length - 1].auth, `Bearer ${KEY}`);

  scen.offersEmpty = true;
  const empty = await adapter.offers!(q);
  assert.equal(empty.outcome, "OK");
  assert.deepEqual((empty as any).offers, []);
  scen.offersEmpty = false;

  const bad = await adapter.offers!({ ...q, airline: "ZZ" });
  assert.equal(bad.outcome, "FAILED");
  assert.equal((bad as any).code, "UNKNOWN_AIRLINE");

  scen.offers500 = true;
  assert.equal((await adapter.offers!(q)).outcome, "UNKNOWN");
  scen.offers500 = false;
  scen.offersMalformed = true;
  assert.equal((await adapter.offers!(q)).outcome, "UNKNOWN");
});

test("ndc: book posts the manifest and confirms the PNR", async () => {
  const { adapter } = ndc();
  const r = await adapter.book(ctx("bkg_1"));
  assert.equal(r.outcome, "CONFIRMED");
  if (r.outcome !== "CONFIRMED") return;
  assert.equal(r.reference, "NDC-REF-1");
  assert.match(r.pnr || "", /^[A-Z0-9]{6}$/);
  const posted = seen[seen.length - 1];
  assert.equal(posted.url, "/orders");
  assert.equal(posted.idem, "ord_bkg_1");
  assert.equal(posted.body.flightNo, "KE703");
  assert.equal(posted.body.from, "ICN");
  assert.equal(posted.body.serviceDate, "2027-01-10");
  assert.equal(posted.body.travelers.length, 2);
  assert.equal(posted.body.travelers[0].lastNameEn, "KIM");
  assert.ok(!("passportNumber" in posted.body.travelers[0]), "v1 never transmits passport numbers");
});

test("ndc: red drill 1 — fulfil retry replays the same PNR, never a second one", async () => {
  const { adapter } = ndc();
  const first = await adapter.book(ctx("bkg_replay"));
  const second = await adapter.book(ctx("bkg_replay"));
  assert.equal(first.outcome, "CONFIRMED");
  assert.equal(second.outcome, "CONFIRMED");
  assert.deepEqual(second, first);
  assert.equal(orderSeq, 1);
});

test("ndc: book maps refusal/5xx/malformed honestly", async () => {
  const soldOut = ndc(manifestDb("XX000"));
  const f = await soldOut.adapter.book(ctx("bkg_2"));
  assert.equal(f.outcome, "FAILED");
  assert.equal((f as any).code, "NO_AVAILABILITY");

  const { adapter } = ndc();
  scen.orders500 = true;
  assert.equal((await adapter.book(ctx("bkg_3"))).outcome, "UNKNOWN");
  scen.orders500 = false;
  scen.ordersMalformed = true;
  const malformed = await adapter.book(ctx("bkg_4"));
  assert.equal(malformed.outcome, "UNKNOWN");
});

test("ndc: non-flight domains and missing manifests never confirm", async () => {
  const { adapter } = ndc();
  const dom = await adapter.book(ctx("bkg_5", "htl_x", "HOTEL"));
  assert.equal(dom.outcome, "FAILED");
  assert.equal((dom as any).code, "SUPPLIER_DOMAIN_UNSUPPORTED");
  assert.equal(breakerStatus("ndc").state, "CLOSED");
  assert.equal((await adapter.book(ctx("bkg_missing"))).outcome, "UNKNOWN");
  assert.equal((await adapter.book(ctx("bkg_6", "flt_missing"))).outcome, "UNKNOWN");
  assert.equal((await adapter.book(ctx("bkg_empty"))).outcome, "UNKNOWN");
});

test("ndc: ticket issues numbers; cancel cancels or honestly rejects", async () => {
  const { adapter } = ndc();
  const t = await adapter.ticket({ ...ctx("bkg_7"), supplierReference: "NDC-REF-9" });
  assert.equal(t.outcome, "ISSUED");
  if (t.outcome !== "ISSUED") return;
  assert.equal(t.ticketNumbers.length, 2);
  const tf = await adapter.ticket({ ...ctx("bkg_8"), supplierReference: "NDC-FAIL-1" });
  assert.equal(tf.outcome, "FAILED");
  assert.equal((await adapter.ticket(ctx("bkg_9"))).outcome, "FAILED");

  const c = await adapter.cancel({ ...ctx("bkg_10"), supplierReference: "NDC-REF-9" });
  assert.equal(c.outcome, "CANCELLED");
  const rej = await adapter.cancel({ ...ctx("bkg_11"), supplierReference: "NDC-REJ-1" });
  assert.equal(rej.outcome, "REJECTED");
  assert.equal((await adapter.cancel(ctx("bkg_12"))).outcome, "UNKNOWN");
});

test("ndc: configuration resolves honestly across envs", () => {
  const dev = envFor(manifestDb());
  assert.ok(resolveLiveConfig(dev, "ndc"));
  assert.equal(supplierApiConfigured(dev, "ndc"), true);
  assert.equal(supplierApiConfigured(envFor(manifestDb(), { NDC_API_KEY: "" }), "ndc"), false);
  assert.equal(supplierApiConfigured(envFor(manifestDb(), { NDC_API_BASE: "" }), "ndc"), false);
  assert.equal(supplierApiConfigured(envFor(manifestDb(), { NDC_API_BASE: "ftp://x/y" }), "ndc"), false);
  assert.equal(supplierApiConfigured(undefined, "ndc"), false);
  assert.equal(supplierApiConfigured(dev, "simulator"), false);
  // Production refuses loopback stubs but honors https gateways.
  const prodStub = envFor(manifestDb()) as any;
  prodStub.APP_ENV = "production";
  assert.equal(resolveLiveConfig(prodStub, "ndc"), null);
  const prodLive = envFor(manifestDb(), { NDC_API_BASE: "https://ndc.example.com" }) as any;
  prodLive.APP_ENV = "production";
  assert.ok(resolveLiveConfig(prodLive, "ndc"));
  // adapterFor without env (or without keys) fails honestly, never throws.
  assert.equal(adapterFor("ndc").name, "none");
  assert.equal(adapterFor("ndc", envFor(manifestDb(), { NDC_API_KEY: "" })).name, "none");
  assert.equal(adapterFor("ndc", dev).name, "ndc");
});

test("ndc: bookability sells LIVE only when configured", () => {
  const row = (over: Partial<SupplierRow>): SupplierRow => ({
    id: "sup", name: "s", adapter: "ndc", integration_status: "LIVE",
    transaction_model: "MERCHANT_OF_RECORD", settlement_rate_bps: 9000, ...over,
  });
  const dev = envFor(manifestDb());
  const live = bookabilityOf(dev, row({}));
  assert.equal(live.bookable, true);
  assert.equal(live.mode, "LIVE");
  assert.equal(bookabilityOf(envFor(manifestDb(), { NDC_API_KEY: "" }), row({})).reason, "SUPPLIER_API_NOT_CONFIGURED");
  assert.equal(bookabilityOf(dev, row({ integration_status: "NOT_INTEGRATED" })).bookable, false);
  assert.equal(bookabilityOf(dev, row({ adapter: "gds" })).bookable, false);
});

test("ndc: red drill 2 — three failures trip the breaker; book short-circuits, ticket still attempts", async () => {
  const db = manifestDb("XX000");
  const env = envFor(db, { SUPPLIER_BREAKER_COOLDOWN_MS: "60000" });
  const cfg = resolveLiveConfig(env, "ndc")!;
  const adapter = liveSupplierAdapter(env, cfg);
  assert.equal((await adapter.book(ctx("trip_1"))).outcome, "FAILED");
  assert.equal((await adapter.book(ctx("trip_2"))).outcome, "FAILED");
  assert.equal((await adapter.book(ctx("trip_3"))).outcome, "FAILED");
  assert.equal(breakerStatus("ndc").state, "OPEN");
  const callsBefore = orderCalls;
  const short = await adapter.book(ctx("trip_4"));
  assert.equal(short.outcome, "FAILED");
  assert.equal((short as any).code, "SUPPLIER_CIRCUIT_OPEN");
  assert.equal(orderCalls, callsBefore, "no supplier call while OPEN");
  // The money gate refuses with 503 + alternates while OPEN.
  await assert.rejects(() => assertSupplierAvailable({ ...env, DB: manifestDb() as any }, "ndc", null), (e: unknown) => {
    const h = e as any;
    return h.status === 503 && h.code === "SUPPLIER_CIRCUIT_OPEN" && h.details.retryAfterSec > 0 && Array.isArray(h.details.alternates);
  });
  // Non-live adapters and null routes pass through untouched.
  await assertSupplierAvailable(env, "simulator", null);
  await assertSupplierAvailable(env, null, null);
  // Ticket unwinds are never short-circuited.
  const tBefore = ticketCalls;
  await adapter.ticket({ ...ctx("trip_5"), supplierReference: "NDC-REF-9" });
  assert.equal(ticketCalls, tBefore + 1);
});

test("ndc: simulator stays isolated — simulation never steers live adapters", async () => {
  const { adapter } = ndc();
  assert.equal(adapterFor("simulator", envFor(manifestDb())).name, "simulator");
  const r = await adapter.book({ ...ctx("bkg_sim"), simulation: { supplier: "fail", ticketing: "fail", cancel: "reject" } });
  assert.equal(r.outcome, "CONFIRMED");
});
