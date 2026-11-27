// scripts/build-and-deploy.js
/**
 * getfortrip Platform - Automated Rebuild & Deploy Pipeline (4 Workers, 3 Portals)
 * ==============================================================================
 * 1. ota-hub (Central API Gateway + Console Fallbacks): https://ota-hub.dnjstjq0824.workers.dev
 * 2. ota-user (User Web SSR + ISR): https://ota-user.dnjstjq0824.workers.dev (country subdomains on getfortrip.com)
 * 3. ota-admin (Dedicated Admin Console): https://ota-admin.dnjstjq0824.workers.dev
 * 4. ota-partner (Dedicated Partner Extranet): https://ota-partner.dnjstjq0824.workers.dev
 * ==============================================================================
 */

const { execFileSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const wranglerBin = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
// DRY_RUN=1 prints every step without executing (operator rehearsal / CI lint).
const DRY_RUN = process.env.DRY_RUN === '1';
// SKIP_D1_MIGRATE=1 keeps a deploy code-only when the schema step must run
// separately (outage window, manual review). Default applies migrations (#51).
const SKIP_D1_MIGRATE = process.env.SKIP_D1_MIGRATE === '1';

function gitSha() {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().trim();
    return sha || 'unknown';
  } catch {
    return 'unknown';
  }
}

const rawRelease = (process.env.SENTRY_RELEASE || gitSha()).trim();
if (!/^[A-Za-z0-9._-]+$/.test(rawRelease)) {
  console.error(`❌ [ERROR] Invalid SENTRY_RELEASE value: ${JSON.stringify(rawRelease)}`);
  process.exit(1);
}
const SENTRY_RELEASE = rawRelease;
const CODE_ONLY = process.env.DEPLOY_CODE_ONLY === '1';

function runNode(scriptPath, argv = []) {
  if (DRY_RUN) {
    console.log(`   [dry-run] node ${path.relative(rootDir, scriptPath)} ${argv.join(' ')}`);
    return '';
  }
  return execFileSync(process.execPath, [scriptPath, ...argv], { cwd: rootDir, stdio: 'inherit' });
}

function runWrangler(argv) {
  return runNode(wranglerBin, argv);
}

const WORKERS = [
  { label: 'ota-hub (API Hub)', config: '' },
  { label: 'ota-user (User Portal SSR)', config: 'frontend-user/wrangler.jsonc' },
  { label: 'ota-admin (Admin Portal)', config: 'frontend-admin/wrangler.jsonc' },
  { label: 'ota-partner (Partner Extranet)', config: 'frontend-partner/wrangler.jsonc' },
];

console.log('==============================================================================');
console.log('⚡ [getfortrip] Automated Cloudflare 3-Portal Rebuild & Deploy Pipeline');
console.log('==============================================================================\n');

try {
  // 0. Apply D1 migrations to production BEFORE the new code lands.
  if (SKIP_D1_MIGRATE) {
    console.log('⏭️ [0/5] D1 migrations SKIPPED (SKIP_D1_MIGRATE=1) — run them manually:');
    console.log('   npx wrangler d1 migrations apply ota_production --remote');
  } else {
    console.log('🗄️ [0/5] Applying D1 migrations to ota_production (remote)...');
    runWrangler(['d1', 'migrations', 'apply', 'ota_production', '--remote']);
    console.log('🔍 [0/5] Verifying latest applied migrations...');
    runWrangler(['d1', 'execute', 'ota_production', '--remote', '--command', 'SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 5']);
  }

  if (CODE_ONLY) {
    // Two-phase code-only rollout: upload ALL 4 worker versions first, then
    // promote all 4 to 100% only after every upload succeeds (prevents split-version prod).
    console.log('\n☁️ [1-4/5] Code-only two-phase deploy (upload all 4, then promote all 4)...');
    console.log('   (triggers untouched — config route/cron/custom-domain changes need a local full deploy)');
    const uploaded = [];
    for (const [idx, w] of WORKERS.entries()) {
      const cfg = w.config ? ['-c', w.config] : [];
      const tag = `r-${SENTRY_RELEASE}-${Date.now().toString(36)}-${idx}`;
      console.log(`\n⬆️  Uploading [${idx + 1}/4] ${w.label}...`);
      runWrangler(['versions', 'upload', ...cfg, '--tag', tag, '--var', `SENTRY_RELEASE:${SENTRY_RELEASE}`]);
      uploaded.push({ ...w, cfg, tag });
    }
    for (const [idx, w] of uploaded.entries()) {
      console.log(`\n🚀 Promoting [${idx + 1}/4] ${w.label} (${w.tag}) -> 100%...`);
      runWrangler(['versions', 'deploy', ...w.cfg, '--version-tag', `${w.tag}@100`, '--yes', '--message', `release ${SENTRY_RELEASE}`]);
    }
  } else {
    for (const [idx, w] of WORKERS.entries()) {
      const cfg = w.config ? ['-c', w.config] : [];
      console.log(`\n☁️ [${idx + 1}/5] Triggering Wrangler deploy (${w.label})...`);
      runWrangler(['deploy', ...cfg, '--var', `SENTRY_RELEASE:${SENTRY_RELEASE}`]);
    }
  }

  // 5. Post-deploy smoke (#52): unauthenticated, read-only, no secrets needed.
  console.log('\n🩺 [5/5] Running post-deploy smoke probe...');
  runNode(path.join(__dirname, 'smoke-production.js'));

  console.log('\n==============================================================================');
  console.log('🎉 [SUCCESS] getfortrip 3 Portals successfully deployed to Cloudflare!');
  console.log('   - User Portal:    https://kr.getfortrip.com  |  https://www.getfortrip.com');
  console.log('   - Workers.dev:    https://ota-user.dnjstjq0824.workers.dev');
  console.log('   - API Hub:        https://ota-hub.dnjstjq0824.workers.dev');
  console.log('   - Admin Console:  https://admin.getfortrip.com');
  console.log('   - Partner Portal: https://partner.getfortrip.com');
  console.log('==============================================================================\n');
} catch (err) {
  console.error('\n❌ [ERROR] Cloudflare build & deploy pipeline failed:');
  console.error(err.message);
  process.exit(1);
}
