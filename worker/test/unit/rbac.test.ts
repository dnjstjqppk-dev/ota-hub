import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuthUser, requireAdmin, requireUser } from "../../src/lib/auth.ts";
import { signJwt } from "../../src/lib/crypto.ts";
import { fakeDb, fakeRequest } from "./_fakedb.ts";

const SECRET = "test-secret-please-ignore-32-chars!";
const envFor = (opts: { role?: string | null; status?: string; revoked?: boolean; resetAt?: number | null } = {}) => ({
  JWT_SECRET: SECRET,
  DB: fakeDb({
    first: (sql) => {
      if (sql.includes("revoked_tokens")) return opts.revoked ? { x: 1 } : null;
      if (sql.includes("session_resets")) return opts.resetAt === null || opts.resetAt === undefined ? null : { reset_at: opts.resetAt };
      if (sql.includes("SELECT status FROM users")) return { status: opts.status || "ACTIVE" };
      if (sql.includes("SELECT role FROM users")) return opts.role === null || opts.role === undefined ? null : { role: opts.role };
      return null;
    },
  }),
}) as any;

const userToken = (over: Record<string, unknown> = {}) => signJwt({ id: "u1", email: "u@t.t", role: "USER", ...over }, SECRET);
const req = (token: string | null) => fakeRequest(token ? { Authorization: `Bearer ${token}` } : {});

// #110: RBAC reads the role from the database, never from claims alone.
test("rbac: admin passes admins, rejects users and the unauthenticated", async () => {
  const adminTok = await signJwt({ id: "a1", email: "a@t.t", role: "ADMIN" }, SECRET);
  assert.equal((await requireAdmin(req(adminTok), envFor({ role: "ADMIN" }))).role, "ADMIN");
  const code = (c: string) => (e: any) => e.code === c;
  await assert.rejects(requireAdmin(req(null), envFor({ role: "ADMIN" })), code("UNAUTHORIZED"));
  await assert.rejects(requireAdmin(req(await userToken()), envFor({ role: "USER" })), code("FORBIDDEN"));
  // A demoted admin's still-valid JWT stops working immediately.
  await assert.rejects(requireAdmin(req(adminTok), envFor({ role: "USER" })), code("FORBIDDEN"));
  await assert.rejects(requireAdmin(req(adminTok), envFor({ role: null })), code("FORBIDDEN"));
});

test("rbac: sessions die on revocation, reset, and suspension", async () => {
  const tok = await userToken();
  assert.ok(await getAuthUser(req(tok), envFor({})), "baseline passes");
  assert.equal(await getAuthUser(req(tok), envFor({ revoked: true })), null, "revoked jti rejected");
  assert.equal(await getAuthUser(req(tok), envFor({ resetAt: Math.floor(Date.now() / 1000) + 100 })), null, "pre-reset session rejected");
  assert.equal(await getAuthUser(req(tok), envFor({ status: "SUSPENDED" })), null, "suspended user rejected");
  assert.equal(await getAuthUser(req(null), envFor({})), null, "no token, no user");
  assert.equal(await getAuthUser(req(tok), {} as any), null, "no secret, no user");
  assert.equal((await requireUser(req(tok), envFor({ role: "USER" }))).role, "USER");
});
