#!/usr/bin/env node
// scripts/verify-backup-restore.mjs — TG-20 backup restore test (A3).
//
// Loads a SQL dump into a scratch in-process SQLite database (node:sqlite,
// no shell-outs) and proves it restores: every dumped user table exists
// afterwards, money tables are present with logged row counts, PRAGMA
// integrity_check passes, and foreign_key_check finds no violations.
// Exit 0 + RESTORE-VERIFY PASS on success, loud failure otherwise
// (the weekly job fails → CI alert).
//
//   node scripts/verify-backup-restore.mjs --dump backups/ota_production-<stamp>.sql
//   DRY_RUN=1 prints without executing.
//
// Scope: structural restore proof, not row-equality with live (production
// keeps writing between export and verify, so exact counts would flake).
//
// Why not `wrangler d1 execute --file`: miniflare validates --file batches
// against tables the batch itself creates in later chunks ("no such table"
// on FK references), so real dumps cannot load that way. node:sqlite runs
// statements sequentially like a genuine restore.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DRY_RUN = process.env.DRY_RUN === "1";
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

/**
 * Split SQL text into statements. A naive ';' split breaks trigger bodies
 * and quoted semicolons, so this tracks quotes, comments, and BEGIN/END
 * depth. Pure and unit-tested (worker/test/unit/restore-verify.test.ts).
 */
export function splitSql(text) {
  const out = [];
  let buf = "";
  let i = 0;
  let quote = null; // ', ", `, or [..]
  let lineComment = false;
  let blockComment = false;
  let depth = 0; // BEGIN..END nesting (triggers)
  while (i < text.length) {
    const c = text[i];
    const next2 = text.slice(i, i + 2);
    if (lineComment) {
      if (c === "\n") lineComment = false;
      buf += c;
      i += 1;
      continue;
    }
    if (blockComment) {
      buf += c;
      if (next2 === "*/") {
        buf += text[i + 1] || "";
        i += 2;
      } else {
        i += 1;
      }
      if (buf.endsWith("*/")) blockComment = false;
      continue;
    }
    if (quote) {
      buf += c;
      if (quote === "[" && c === "]") {
        quote = null;
      } else if (c === quote) {
        // '' inside a string is an escaped quote, not the terminator.
        if (text[i + 1] === quote) {
          buf += text[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      i += 1;
      continue;
    }
    if (next2 === "--") {
      lineComment = true;
      buf += c;
      i += 1;
      continue;
    }
    if (next2 === "/*") {
      blockComment = true;
      buf += c;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      buf += c;
      i += 1;
      continue;
    }
    if (c === "[") {
      quote = "[";
      buf += c;
      i += 1;
      continue;
    }
    // BEGIN/END depth (word boundaries, case-insensitive).
    const rest = text.slice(i);
    const beginMatch = rest.match(/^(BEGIN)\b/i);
    const endMatch = rest.match(/^(END)\b/i);
    if (beginMatch) depth += 1;
    if (endMatch) depth = Math.max(0, depth - 1);
    if (c === ";" && depth === 0) {
      const stmt = buf.trim();
      if (stmt.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").trim()) out.push(stmt);
      buf = "";
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  const tail = buf.trim();
  if (tail.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").trim()) out.push(tail);
  return out;
}

function fail(msg) {
  console.error(`[restore-verify] FAILED: ${msg}`);
  process.exit(1);
}

function main() {
  const dumpPath = opt("--dump");
  if (!dumpPath) fail("usage: node scripts/verify-backup-restore.mjs --dump <file.sql>");
  if (!fs.existsSync(dumpPath)) fail(`dump missing: ${dumpPath}`);
  const st = fs.statSync(dumpPath);
  if (st.size === 0) fail("dump is empty");
  const dump = fs.readFileSync(dumpPath, "utf8");
  const dumpedTables = new Set([...dump.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?["`[]?(\w+)/gi)].map((m) => m[1].toLowerCase()));
  const dumpedUser = [...dumpedTables].filter((t) => !t.startsWith("_cf_") && !t.startsWith("d1_") && !t.startsWith("sqlite_"));
  console.log(`[restore-verify] dump ${(st.size / 1024).toFixed(1)} KiB, ${dumpedUser.length} user tables`);
  if (!dumpedUser.length) fail("no CREATE TABLE statements in dump");

  const stmts = splitSql(dump);
  console.log(`[restore-verify] ${stmts.length} statements`);
  if (DRY_RUN) {
    console.log("[restore-verify] DRY RUN ok (no checks executed)");
    return;
  }
  const db = new DatabaseSync(":memory:");
  try {
    // FKs off during load (the schema's REFERENCES are immediate, so they
    // resolve against tables created later — the classic restore recipe).
    // foreign_key_check after COMMIT validates the final state instead.
    db.exec("PRAGMA foreign_keys=OFF");
    // One transaction like sqlite3's .read.
    db.exec("BEGIN");
    try {
      for (const s of stmts) {
        if (/^\s*(BEGIN|COMMIT)\b/i.test(s)) continue;
        db.exec(s);
      }
      db.exec("COMMIT");
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch { /* already aborted */ }
      throw e;
    }
    db.exec("PRAGMA foreign_keys=ON");
  } catch (e) {
    fail(`dump failed to load: ${String(e.message || e).slice(0, 300)}`);
  }

  const live = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name).toLowerCase()));
  const missing = dumpedUser.filter((t) => !live.has(t));
  if (missing.length) fail(`tables missing after restore: ${missing.join(", ")}`);
  console.log(`[restore-verify] tables restored: ${dumpedUser.length}/${dumpedUser.length}`);

  for (const t of ["users", "bookings", "payments", "ledger_entries"]) {
    if (!live.has(t)) fail(`money table missing after restore: ${t}`);
    const c = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    console.log(`[restore-verify] row check ${t}: ${c} rows restored`);
  }

  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") {
    fail(`integrity_check failed: ${JSON.stringify(integrity).slice(0, 200)}`);
  }
  console.log("[restore-verify] PRAGMA integrity_check: ok");

  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (violations.length) fail(`foreign key violations: ${violations.length} (${JSON.stringify(violations[0]).slice(0, 200)})`);
  console.log("[restore-verify] PRAGMA foreign_key_check: 0 violations");
  console.log("RESTORE-VERIFY PASS");
}

if (process.argv[1]?.endsWith("verify-backup-restore.mjs")) {
  try {
    main();
  } catch (e) {
    fail(e.message || String(e));
  }
}
