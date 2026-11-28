import { test } from "node:test";
import assert from "node:assert/strict";
import { isCatalogMutation } from "../../src/lib/edge-epoch.ts";

test("successful admin/partner writes bump the storefront edge epoch", () => {
  assert.equal(isCatalogMutation("PUT", "/api/v1/partner/inventory", 200), true);
  assert.equal(isCatalogMutation("PATCH", "/api/v1/partner/products/p1", 200), true);
  assert.equal(isCatalogMutation("POST", "/api/v1/admin/products/HOTEL", 201), true);
  assert.equal(isCatalogMutation("DELETE", "/api/v1/admin/products/HOTEL/h1", 200), true);
  assert.equal(isCatalogMutation("PUT", "/api/v1/admin/fx-rates", 200), true);
});

test("reads, failures, customer traffic and session/credential writes do not", () => {
  assert.equal(isCatalogMutation("GET", "/api/v1/partner/inventory", 200), false);
  assert.equal(isCatalogMutation("PUT", "/api/v1/partner/inventory", 400), false);
  assert.equal(isCatalogMutation("PUT", "/api/v1/partner/inventory", 500), false);
  assert.equal(isCatalogMutation("POST", "/api/v1/bookings", 201), false);
  for (const p of ["/api/v1/admin/login", "/api/v1/admin/logout", "/api/v1/partner/login", "/api/v1/partner/register",
    "/api/v1/partner/forgot-password", "/api/v1/partner/reset-password", "/api/v1/admin/mfa/enroll", "/api/v1/admin/me/password"]) {
    assert.equal(isCatalogMutation("POST", p, 200), false, p);
  }
});
