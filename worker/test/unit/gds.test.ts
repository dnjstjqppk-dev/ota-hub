import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { Env } from "../../src/env.ts";
import { adapterFor, type SupplierContext } from "../../src/suppliers/adapter.ts";
import { liveSupplierAdapter, resolveLiveConfig, supplierApiConfigured } from "../../src/suppliers/live-adapter.ts";
import { breakerStatus, resetBreakers } from "../../src/suppliers/circuit.ts";

/**
 * TG-18: GDS adapter delta over the shared live-adapter core (proven in
 * ndc.test.ts): key-separated scenario state, the cancel-rejection path that
 * must NOT trip the breaker, and breaker independence between adapters.
 */

const KEY = "gds_unit_secret";
let stub = "";
const seen: Array<{ url: string; auth: string; body: any }> = [];
const orderByKey = new Map<string, { reference: string; pnr: string }>();
let orderSeq = 0;
const failNdcOnly = { on: false };

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    seen.push({ url: req.url || "", auth: String(req.headers.authorization || ""), body });
    const send = (status: number, json: any) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const key = String(req.headers.authorization || "").replace(/^Bearer /, "");
    if (key !== KEY && key !== "ndc_unit_secret") return send(401, { code: "UNAUTHORIZED" });
    const m = req.method || "";
    const u = (req.url || "").split("?")[0];
    if (m === "POST" && u === "/offers") {
      return send(200, { offers: [{ offerId: "gds_off_1", airline: "KE", flightNo: "KE703", from: "ICN", to: "NRT", date: "2027-01-10", amountMinor: 610000, currency: "KRW", expiresAt: "2027-01-10T00:00:00Z" }] });
    }
    if (m === "POST" && u === "/orders") {
      const idem = String(body.idempotencyKey || "");
      const replay = orderByKey.get(`${key}:${idem}`);
      if (replay) return send(409, { code: "ORDER_DUPLICATE", ...replay });
      if (failNdcOnly.on && key === "ndc_unit_secret") return send(400, { code: "NO_AVAILABILITY", message: "sold out" });
      orderSeq += 1;
      const row = { reference: `GDS-REF-${orderSeq}`, pnr: "PX4M9Q" };
      orderByKey.set(`${key}:${idem}`, row);
      return send(200, row);
    }
    const ticket = u.match(/^\/orders\/(.+)\/ticket$/);
    if (m === "POST" && ticket) return send(200, { ticketNumbers: ["180-3333333333"] });
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
  orderByKey.clear();
  orderSeq = 0;
  failNdcOnly.on = false;
});

function manifestDb() {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (sql.includes("FROM bookings")) return { service_start: "2027-01-10T10:10:00Z" } as T;
              if (sql.includes("FROM flights")) return { flight_number: "KE703", departure_airport: "ICN", arrival_airport: "NRT" } as T;
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              if (sql.includes("FROM booking_travelers")) {
                return { results: [{ traveler_type: "ADULT", last_name_en: "KIM", first_name_en: "MINJI", birth_date: "1990-01-01", nationality: "KOR" }] as T[] };
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

const envFor = (name: "ndc" | "gds", key: string): Env => ({
  APP_ENV: "test",
  DB: manifestDb(),
  NDC_API_BASE: stub,
  NDC_API_KEY: "ndc_unit_secret",
  GDS_API_BASE: stub,
  GDS_API_KEY: key,
  SUPPLIER_BREAKER_COOLDOWN_MS: "60000",
} as unknown as Env);

const ctx = (bookingId: string, supplierReference: string | null = null): SupplierContext => ({
  bookingId, domain: "FLIGHT", itemId: "flt_ke703", travelerCount: 1, supplierReference, simulation: {},
});

const gds = (key = KEY) => {
  const env = envFor("gds", key);
  const cfg = resolveLiveConfig(env, "gds");
  assert.ok(cfg);
  return { env, adapter: liveSupplierAdapter(env, cfg!) };
};

test("gds: offers/book/ticket/cancel roundtrip with the GDS key", async () => {
  const { adapter } = gds();
  assert.equal(adapter.name, "gds");
  const offers = await adapter.offers!({ origin: "ICN", destination: "NRT", date: "2027-01-10", adults: 1 });
  assert.equal(offers.outcome, "OK");
  const b = await adapter.book(ctx("gds_1"));
  assert.equal(b.outcome, "CONFIRMED");
  if (b.outcome !== "CONFIRMED") return;
  assert.match(b.pnr || "", /^[A-Z0-9]{6}$/);
  assert.ok(b.reference.startsWith("GDS-REF-"));
  const replay = await adapter.book(ctx("gds_1"));
  assert.deepEqual(replay, b);
  const t = await adapter.ticket(ctx("gds_1", b.reference));
  assert.equal(t.outcome, "ISSUED");
  const c = await adapter.cancel(ctx("gds_1", b.reference));
  assert.equal(c.outcome, "CANCELLED");
  assert.ok(seen.every((s) => s.auth === `Bearer ${KEY}`));
});

test("gds: cancel rejections are business answers — they never trip the breaker", async () => {
  const { adapter } = gds();
  for (const id of ["r1", "r2", "r3", "r4"]) {
    const r = await adapter.cancel(ctx(id, "GDS-REJ-1"));
    assert.equal(r.outcome, "REJECTED");
  }
  assert.equal(breakerStatus("gds").state, "CLOSED");
  const b = await adapter.book(ctx("gds_after_rejects"));
  assert.equal(b.outcome, "CONFIRMED");
});

test("gds: breaker trips are per-adapter — an OPEN ndc leaves gds live", async () => {
  failNdcOnly.on = true;
  const ndcEnv = envFor("ndc", KEY);
  const ndcCfg = resolveLiveConfig(ndcEnv, "ndc")!;
  const ndcAdapter = liveSupplierAdapter(ndcEnv, ndcCfg);
  assert.equal((await ndcAdapter.book(ctx("n1"))).outcome, "FAILED");
  assert.equal((await ndcAdapter.book(ctx("n2"))).outcome, "FAILED");
  assert.equal((await ndcAdapter.book(ctx("n3"))).outcome, "FAILED");
  assert.equal(breakerStatus("ndc").state, "OPEN");
  assert.equal(breakerStatus("gds").state, "CLOSED");
  const { adapter } = gds();
  assert.equal((await adapter.book(ctx("gds_live"))).outcome, "CONFIRMED");
});

test("gds: configuration and adapterFor resolution mirror ndc", () => {
  const env = envFor("gds", KEY);
  assert.ok(resolveLiveConfig(env, "gds"));
  assert.equal(supplierApiConfigured(env, "gds"), true);
  assert.equal(supplierApiConfigured(envFor("gds", ""), "gds"), false);
  assert.equal(adapterFor("gds").name, "none");
  assert.equal(adapterFor("gds", env).name, "gds");
  assert.equal(adapterFor("gds", env).offers !== undefined, true);
  assert.equal(adapterFor("simulator", env).offers, undefined);
});
