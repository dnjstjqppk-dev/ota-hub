import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllFeatureFlags, isFeatureEnabled, updateFeatureFlag } from "../../src/services/feature-flag-service.ts";
import { fakeDb } from "./_fakedb.ts";

const row = (key: string, is_enabled: number, requires: string[] = []) => ({
  key, category: "SYSTEM", display_name: key, description: "", is_enabled, default_enabled: 1,
  requires_flags: JSON.stringify(requires), is_external_dependent: 0,
  external_contract_status: "NOT_REQUIRED", updated_by: null, updated_at: "2026-01-01",
});

const envFor = (flags: Record<string, ReturnType<typeof row>>, audits: unknown[] = []) => ({
  DB: fakeDb({
    first: (sql, params) => {
      if (sql.startsWith("SELECT is_enabled") || sql.startsWith("SELECT * FROM feature_flags WHERE")) {
        const r = flags[params[0] as string];
        if (!r) return null;
        return sql.startsWith("SELECT is_enabled") ? { is_enabled: r.is_enabled } : r;
      }
      return null;
    },
    all: (sql, params) => {
      if (sql.startsWith("SELECT * FROM feature_flags ORDER")) return Object.values(flags);
      if (sql.includes("WHERE key IN (")) return (params as string[]).map((k) => flags[k]).filter(Boolean);
      if (sql.includes("requires_flags LIKE")) {
        const needle = String(params[0]).replace(/%/g, "").replace(/\\"/g, '"');
        return Object.values(flags).filter((f: any) => Number(f.is_enabled) === 1 && String(f.requires_flags).includes(needle.replace(/"/g, "")));
      }
      return [];
    },
    run: (sql, params) => {
      if (sql.startsWith("UPDATE feature_flags SET")) {
        const [enabled, by, at, key] = params as [number, string, string, string];
        if (flags[key]) flags[key] = { ...flags[key], is_enabled: enabled, updated_by: by, updated_at: at };
        return { meta: { changes: 1 } };
      }
      if (sql.includes("admin_audit_logs")) {
        audits.push(params);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  }),
}) as any;

// #110: flag reads map rows; missing keys fail OPEN (current contract — #117 flips this).
test("flags: reads map rows; unknown keys default enabled", async () => {
  const env = envFor({ A: row("A", 1), B: row("B", 0) });
  assert.equal(await isFeatureEnabled(env, "A"), true);
  assert.equal(await isFeatureEnabled(env, "B"), false);
  assert.equal(await isFeatureEnabled(env, "NOPE"), true);
  const all = await getAllFeatureFlags(env);
  assert.equal(all.length, 2);
  assert.deepEqual(all[0].requires_flags, []);
});

// #110: updates enforce dependency order in both directions and audit.
test("flags: toggle guards dependencies and audits the change", async () => {
  const audits: unknown[] = [];
  const env = envFor({ BASE: row("BASE", 0), TOP: row("TOP", 0, ["BASE"]) }, audits);
  const code = (c: string) => (e: any) => e.code === c;
  await assert.rejects(updateFeatureFlag(env, "MISSING", true, "adm"), code("FLAG_NOT_FOUND"));
  await assert.rejects(updateFeatureFlag(env, "TOP", true, "adm"), code("DEPENDENCY_VIOLATION"));
  await updateFeatureFlag(env, "BASE", true, "adm");
  await updateFeatureFlag(env, "TOP", true, "adm");
  await assert.rejects(updateFeatureFlag(env, "BASE", false, "adm"), code("CASCADE_DEPENDENCY_BLOCK"));
  await updateFeatureFlag(env, "TOP", false, "adm");
  await updateFeatureFlag(env, "BASE", false, "adm");
  assert.equal(audits.length, 4);
  // No-op retoggles return without writing or auditing.
  const before = audits.length;
  await updateFeatureFlag(env, "BASE", false, "adm");
  assert.equal(audits.length, before);
});
