// scripts/build-and-deploy.js
/**
 * getfortrip Platform - Automated Rebuild & Deploy Pipeline (4 Workers, 3 Portals)
 * ==============================================================================
 * 1. ota-hub (Central API Gateway + Console Fallbacks): https://ota-hub.dnjstjq0824.workers.dev
 * 2. ota-user (User Web SSR + ISR): https://ota-user.dnjstjq0824.workers.dev (apex after GO_LIVE step 4)
 * 3. ota-admin (Dedicated Admin Console): https://ota-admin.dnjstjq0824.workers.dev
 * 4. ota-partner (Dedicated Partner Extranet): https://ota-partner.dnjstjq0824.workers.dev
 * ==============================================================================
 */

const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
// DRY_RUN=1 prints every step without executing (operator rehearsal / CI lint).
const DRY_RUN = process.env.DRY_RUN === '1';
// SKIP_D1_MIGRATE=1 keeps a deploy code-only when the schema step must run
// separately (outage window, manual review). Default applies migrations (#51).
const SKIP_D1_MIGRATE = process.env.SKIP_D1_MIGRATE === '1';
// Release tag stamped on Sentry events (TG-05). Never fails the deploy:
// 'unknown' when git is unavailable. Overridable via SENTRY_RELEASE.
function gitSha() {
  try {
    const sha = require('child_process')
      .execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().trim();
    return sha || 'unknown';
  } catch {
    return 'unknown';
  }
}
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || gitSha();
// DEPLOY_CODE_ONLY=1 (CI): ship code as a Worker Version (versions upload +
// versions deploy) and leave triggers alone. Route/cron/custom-domain updates
// need zone-level route edit rights the CI token does not carry (2026-11-25:
// four tokens all got 403 on PUT .../scripts/ota-hub/routes). Triggers change
// rarely — when a wrangler config's routes/crons change, run this script
// locally (full `wrangler deploy`) once.
const CODE_ONLY = process.env.DEPLOY_CODE_ONLY === '1';

// One worker = one deploy. Full mode syncs triggers; code-only mode uploads a
// tagged version and promotes exactly that version to 100%.
function deployWorker(configArg) {
  const cfg = configArg ? ` -c ${configArg}` : '';
  if (!CODE_ONLY) {
    run(`npx wrangler deploy${cfg} --var SENTRY_RELEASE:${SENTRY_RELEASE}`);
    return;
  }
  const tag = `r-${SENTRY_RELEASE}-${Date.now().toString(36)}`;
  run(`npx wrangler versions upload${cfg} --tag ${tag} --var SENTRY_RELEASE:${SENTRY_RELEASE}`);
  run(`npx wrangler versions deploy${cfg} --version-tag ${tag}@100 --yes --message "release ${SENTRY_RELEASE}"`);
}

function run(cmd) {
  if (DRY_RUN) {
    console.log(`   [dry-run] ${cmd}`);
    return '';
  }
  return execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

console.log('==============================================================================');
console.log('⚡ [getfortrip] Automated Cloudflare 3-Portal Rebuild & Deploy Pipeline');
console.log('==============================================================================\n');

try {
  // 0. Apply D1 migrations to production BEFORE the new code lands, then prove
  // the journal moved (#51: deploys used to ship code without schema, and the
  // drift was fixed by hand each time). A failed migration aborts the deploy.
  if (SKIP_D1_MIGRATE) {
    console.log('⏭️ [0/5] D1 migrations SKIPPED (SKIP_D1_MIGRATE=1) — run them manually:');
    console.log('   npx wrangler d1 migrations apply ota_production --remote');
  } else {
    console.log('🗄️ [0/5] Applying D1 migrations to ota_production (remote)...');
    run('npx wrangler d1 migrations apply ota_production --remote');
    console.log('🔍 [0/5] Verifying latest applied migrations...');
    run('npx wrangler d1 execute ota_production --remote --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 5"');
  }

  // 1. Deploy ota-hub (executes scripts/build-all.js to build all portals;
  // hub serves the API + console fallbacks, user SSR rides ota-user).
  console.log('\n☁️ [1/5] Triggering Wrangler build and deploy (ota-hub)...');
  if (CODE_ONLY) console.log('   (code-only: triggers untouched — config route/cron changes need a local full deploy)');
  deployWorker('');

  // 2. Deploy ota-user (TG-15: user portal SSR + ISR worker).
  console.log('\n☁️ [2/5] Triggering Wrangler deploy for User Portal SSR (ota-user)...');
  deployWorker('frontend-user/wrangler.jsonc');

  // 3. Deploy ota-admin (dedicated worker host)
  console.log('\n☁️ [3/5] Triggering Wrangler deploy for Admin Portal (ota-admin)...');
  deployWorker('frontend-admin/wrangler.jsonc');

  // 4. Deploy ota-partner (dedicated worker host)
  console.log('\n☁️ [4/5] Triggering Wrangler deploy for Partner Extranet (ota-partner)...');
  deployWorker('frontend-partner/wrangler.jsonc');

  // 5. Post-deploy smoke (#52): unauthenticated, read-only, no secrets needed.
  console.log('\n🩺 [5/5] Running post-deploy smoke probe...');
  run('node scripts/smoke-production.js');

  console.log('\n==============================================================================');
  console.log('🎉 [SUCCESS] getfortrip 3 Portals successfully deployed to Cloudflare!');
  console.log('   - User Portal:    https://ota-user.dnjstjq0824.workers.dev');
  console.log('   - API Hub:        https://ota-hub.dnjstjq0824.workers.dev');
  console.log('   - Admin Console:  https://ota-admin.dnjstjq0824.workers.dev');
  console.log('   - Partner Portal: https://ota-partner.dnjstjq0824.workers.dev');
  console.log('==============================================================================\n');
} catch (err) {
  console.error('\n❌ [ERROR] Cloudflare build & deploy pipeline failed:');
  console.error(err.message);
  process.exit(1);
}
