// scripts/build-and-deploy.js
/**
 * getfortrip Platform - Automated Rebuild & Deploy Pipeline (3 Independent Portals)
 * ==============================================================================
 * 1. ota-hub (User Web + Central API Gateway + Unified Router): https://ota-hub.dnjstjqppk.workers.dev
 * 2. ota-admin (Dedicated Admin Console): https://ota-admin.dnjstjqppk.workers.dev
 * 3. ota-partner (Dedicated Partner Extranet): https://ota-partner.dnjstjqppk.workers.dev
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
    console.log('⏭️ [0/4] D1 migrations SKIPPED (SKIP_D1_MIGRATE=1) — run them manually:');
    console.log('   npx wrangler d1 migrations apply ota_production --remote');
  } else {
    console.log('🗄️ [0/4] Applying D1 migrations to ota_production (remote)...');
    run('npx wrangler d1 migrations apply ota_production --remote');
    console.log('🔍 [0/4] Verifying latest applied migrations...');
    run('npx wrangler d1 execute ota_production --remote --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 5"');
  }

  // 1. Deploy ota-hub (executes scripts/build-all.js to generate all 3 dists)
  console.log('\n☁️ [1/4] Triggering Wrangler build and deploy (ota-hub)...');
  run('npx wrangler deploy');

  // 2. Deploy ota-admin (dedicated worker host)
  console.log('\n☁️ [2/4] Triggering Wrangler deploy for Admin Portal (ota-admin)...');
  run('npx wrangler deploy -c frontend-admin/wrangler.jsonc');

  // 3. Deploy ota-partner (dedicated worker host)
  console.log('\n☁️ [3/4] Triggering Wrangler deploy for Partner Extranet (ota-partner)...');
  run('npx wrangler deploy -c frontend-partner/wrangler.jsonc');

  // 4. Post-deploy smoke (#52): unauthenticated, read-only, no secrets needed.
  console.log('\n🩺 [4/4] Running post-deploy smoke probe...');
  run('node scripts/smoke-production.js');

  console.log('\n==============================================================================');
  console.log('🎉 [SUCCESS] getfortrip 3 Independent Portals successfully deployed to Cloudflare!');
  console.log('   - User Portal:    https://ota-hub.dnjstjqppk.workers.dev');
  console.log('   - Admin Console:  https://ota-admin.dnjstjqppk.workers.dev');
  console.log('   - Partner Portal: https://ota-partner.dnjstjqppk.workers.dev');
  console.log('==============================================================================\n');
} catch (err) {
  console.error('\n❌ [ERROR] Cloudflare build & deploy pipeline failed:');
  console.error(err.message);
  process.exit(1);
}
