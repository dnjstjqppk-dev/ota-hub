// scripts/deploy-staging.js
/**
 * TG-08: deploy main to the staging environment and smoke-probe it.
 * All remote writes are staging-scoped (ota_staging DB, ota-hub-staging
 * worker, getfortrip-uploads-staging bucket). Production is untouched.
 * DRY_RUN=1 prints every step without executing.
 */

const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';
const HUB = 'https://ota-hub-staging.dnjstjqppk.workers.dev';

function run(cmd, env = {}) {
  if (DRY_RUN) {
    console.log(`   [dry-run] ${cmd}`);
    return;
  }
  execSync(cmd, { cwd: rootDir, stdio: 'inherit', env: { ...process.env, ...env } });
}

console.log('==============================================================================');
console.log('⚡ [getfortrip] Staging deploy (hub only) + smoke');
console.log('==============================================================================\n');

// 0. Staging schema first — same rule as production (#51: code never lands
// ahead of its schema).
console.log('🗄️ [0/2] Applying D1 migrations to ota_staging (remote)...');
run('npx wrangler d1 migrations apply ota_staging --remote --env staging');

// 1. Deploy (wrangler runs scripts/build-all.js via build.command first).
console.log('\n☁️ [1/2] Deploying ota-hub-staging...');
run('npx wrangler deploy --env staging');

// 2. Smoke (hub only — admin/partner checks ride the hub fallbacks).
console.log('\n🩺 [2/2] Running smoke probe against staging...');
run('node scripts/smoke-production.js', {
  BASE_URL: HUB,
  ADMIN_URL: `${HUB}/admin/`,
  PARTNER_URL: `${HUB}/partner/`,
});

console.log('\n==============================================================================');
console.log(`🎉 [SUCCESS] Staging is live: ${HUB}`);
console.log('==============================================================================\n');
