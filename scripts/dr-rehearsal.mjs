#!/usr/bin/env node
// scripts/dr-rehearsal.mjs — TG-20 DR drill (local scope, honest labels).
//
// Simulates a primary-loss disaster against persist-dir COPIES (the source is
// only ever read) and measures RTO/RPO:
//
//   1. snapshot: copy <source> persist dir -> drill/snapshot (timed)
//   2. live writes: copy <source> -> drill/live, insert K marker rows
//   3. disaster: drill/live is abandoned ("lost")
//   4. restore: copy drill/snapshot -> drill/restored, boot wrangler dev
//   5. verify: pre-snapshot admin row present; markers absent (RPO loss)
//   6. RTO ends at the first HTTP 200 from the restored boot
//
// Usage:
//   node scripts/dr-rehearsal.mjs --source C:\tmp\e2e_rep2 [--work C:\tmp\dr_drill] [--port 8898] [--markers 25]
//
// Output: reports/DR_REHEARSAL_<stamp>.md + JSON line on stdout.
// Exit 1 when the restore fails to boot or the pre-snapshot row is missing.
//
// SCOPE: local miniflare boot time dominates RTO here; production RTO needs
// the staging drill in docs/DR_RUNBOOK.md. RPO is measured as lost marker
// rows + the snapshot-to-disaster window the drill constructs.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const SOURCE = opt("--source");
const WORK = opt("--work", join(tmpdir(), "dr_drill"));
const PORT = Number(opt("--port", "8898"));
const MARKERS = Number(opt("--markers", "25"));

if (!SOURCE) {
  console.error("usage: node scripts/dr-rehearsal.mjs --source <persist-dir> [--work dir] [--port 8898] [--markers 25]");
  process.exit(2);
}
if (!existsSync(SOURCE)) {
  console.error(`[dr] source persist dir missing: ${SOURCE}`);
  process.exit(2);
}

const w = (s) => execFileSync(process.execPath, [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), ...s], { encoding: "utf8", cwd: root });
const d1 = (persist, command) => w(["d1", "execute", "ota_local", "--local", "-c", "wrangler.local.jsonc", "--persist-to", persist, "--json", "--command", command]);
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const drillId = `dr_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
const log = (m) => console.log(`[dr] ${m}`);
const nowIso = () => new Date().toISOString();

let child = null;
function killChild() {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch { /* already gone */ }
}
process.on("exit", killChild);
process.on("SIGINT", () => { killChild(); process.exit(130); });

async function waitFor200(url, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return Date.now() - t0;
    } catch { /* not up yet */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`no 200 from ${url} within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  const tStart = Date.now();
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const liveDir = join(WORK, "live");
  const snapDir = join(WORK, "snapshot");
  const restoredDir = join(WORK, "restored");

  // 1. live clone + snapshot (the source itself is never written).
  cpSync(SOURCE, liveDir, { recursive: true });
  const tSnap0 = Date.now();
  cpSync(SOURCE, snapDir, { recursive: true });
  const snapshotMs = Date.now() - tSnap0;
  const snapshotAt = nowIso();
  log(`snapshot ${SOURCE} -> snapshot (${snapshotMs}ms)`);

  // Pre-snapshot anchor: the isolated admin must survive the restore.
  const anchor = JSON.parse(d1(liveDir, "SELECT COUNT(*) AS c FROM users WHERE email = 'admin@local.test'"))[0].results[0].c;
  if (anchor < 1) throw new Error("anchor admin row missing in live clone (need a seeded source)");

  // 2. post-snapshot writes (these are the RPO loss by construction).
  // One multi-row INSERT: N wrangler spawns would dominate the drill clock.
  d1(liveDir, "CREATE TABLE dr_markers (id TEXT PRIMARY KEY, drill_id TEXT NOT NULL, seq INTEGER NOT NULL, created_at TEXT NOT NULL)");
  const tWrite0 = Date.now();
  const rows = Array.from({ length: MARKERS }, (_, i) => `('${drillId}_${i}', '${drillId}', ${i}, '${nowIso()}')`).join(",");
  d1(liveDir, `INSERT INTO dr_markers (id, drill_id, seq, created_at) VALUES ${rows}`);
  const writeWindowMs = Date.now() - tWrite0;
  const liveMarkers = JSON.parse(d1(liveDir, `SELECT COUNT(*) AS c FROM dr_markers WHERE drill_id = '${drillId}'`))[0].results[0].c;
  log(`wrote ${liveMarkers}/${MARKERS} markers to live (${writeWindowMs}ms)`);

  // 3. disaster declared: live is abandoned. RTO clock starts.
  const tDisaster = Date.now();
  log("DISASTER declared: primary lost, promoting snapshot");

  // 4. restore + boot.
  const tRestore0 = Date.now();
  cpSync(snapDir, restoredDir, { recursive: true });
  const restoreMs = Date.now() - tRestore0;
  child = spawn(process.execPath, [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), "dev", "-c", "wrangler.local.jsonc", "--port", String(PORT), "--persist-to", restoredDir], {
    cwd: root, stdio: "ignore", detached: process.platform !== "win32",
  });
  const bootMs = await waitFor200(`http://127.0.0.1:${PORT}/api/v1/health`, 180000);
  const rtoMs = Date.now() - tDisaster;
  log(`restored boot first 200 after ${bootMs}ms (RTO ${rtoMs}ms)`);

  // 5. verify: anchor present, markers absent, references sane. (D1 refuses
  // PRAGMA integrity_check with SQLITE_AUTH, so integrity is proven through
  // plain SELECTs: orphan FK rows + row-count parity with the live clone.)
  const anchorAfter = JSON.parse(d1(restoredDir, "SELECT COUNT(*) AS c FROM users WHERE email = 'admin@local.test'"))[0].results[0].c;
  let markersAfter = -1;
  try {
    markersAfter = JSON.parse(d1(restoredDir, `SELECT COUNT(*) AS c FROM dr_markers WHERE drill_id = '${drillId}'`))[0].results[0].c;
  } catch {
    markersAfter = 0; // table itself postdates the snapshot — same verdict
  }
  const orphans = JSON.parse(d1(restoredDir,
    "SELECT (SELECT COUNT(*) FROM bookings b LEFT JOIN users u ON u.id = b.user_id WHERE b.user_id IS NOT NULL AND u.id IS NULL) + (SELECT COUNT(*) FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id WHERE b.id IS NULL) AS c",
  ))[0].results[0].c;
  const liveUsers = JSON.parse(d1(liveDir, "SELECT COUNT(*) AS c FROM users"))[0].results[0].c;
  const restoredUsers = JSON.parse(d1(restoredDir, "SELECT COUNT(*) AS c FROM users"))[0].results[0].c;
  const integrityOk = orphans === 0 && liveUsers === restoredUsers;
  log(`anchor=${anchorAfter} markers=${markersAfter} orphans=${orphans} users=${liveUsers}/${restoredUsers} integrity=${integrityOk ? "ok" : "FAIL"}`);

  const report = {
    drillId,
    at: nowIso(),
    scope: "local",
    source: SOURCE,
    markersSeeded: liveMarkers,
    markersLost: liveMarkers - markersAfter,
    rpo: { lostRows: liveMarkers - markersAfter, windowMs: writeWindowMs, snapshotAt },
    rto: { ms: rtoMs, restoreMs, bootMs, snapshotMs },
    checks: { anchorPresent: anchorAfter >= 1, markersAbsent: markersAfter === 0, integrityOk },
    pass: anchorAfter >= 1 && markersAfter === 0 && integrityOk,
    wallMs: Date.now() - tStart,
  };

  const md = `# DR 리허설 리포트 — ${report.at} (로컬 범위)

> drill: \`${drillId}\` · 원천: \`${SOURCE}\` · 마커 ${liveMarkers}건.
> 로컬 miniflare 기동이 RTO를 좌우하므로 운영 RTO는 스테이징 드릴
> (docs/DR_RUNBOOK.md)로 별도 측정한다.

## 결과: ${report.pass ? "PASS" : "FAIL"}

| 지표 | 값 | 비고 |
|---|---|---|
| RTO (재해 선언→첫 200) | ${(rtoMs / 1000).toFixed(1)}s | 복원 ${(restoreMs / 1000).toFixed(1)}s + 기동 ${(bootMs / 1000).toFixed(1)}s |
| RPO (유실 행) | ${report.rpo.lostRows}/${liveMarkers} 마커 | 스냅샷 이후 ${writeWindowMs}ms 쓰기 전부 유실 (설계) |
| 스냅샷 소요 | ${(snapshotMs / 1000).toFixed(1)}s | persist 디렉터리 복사 |
| 앵커 (admin 행) | ${anchorAfter >= 1 ? "보존" : "유실 FAIL"} | 스냅샷 이전 데이터 |
| 무결성 | ${integrityOk ? "ok" : "FAIL"} | 고아 FK 0 + users 행수 일치 (PRAGMA는 D1 차단) |

## 원천 무결성

드릴은 원천 디렉터리를 읽기만 한다 (쓰기는 drill/live·restored 복사본에만).
`;
  mkdirSync(join(root, "reports"), { recursive: true });
  const outPath = join(root, "reports", `DR_REHEARSAL_${stamp}.md`);
  writeFileSync(outPath, md);
  console.log(JSON.stringify(report));
  log(`report: ${outPath} pass=${report.pass}`);
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(`[dr] FAILED: ${e.message}`);
  process.exit(1);
}).finally(() => killChild());
