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

console.log('==============================================================================');
console.log('⚡ [getfortrip] Automated Cloudflare 3-Portal Rebuild & Deploy Pipeline');
console.log('==============================================================================\n');

try {
  // 1. Deploy ota-hub (executes scripts/build-all.js to generate all 3 dists)
  console.log('☁️ [1/3] Triggering Wrangler build and deploy (ota-hub)...');
  execSync('npx wrangler deploy', { cwd: rootDir, stdio: 'inherit' });

  // 2. Deploy ota-admin (dedicated worker host)
  console.log('\n☁️ [2/3] Triggering Wrangler deploy for Admin Portal (ota-admin)...');
  execSync('npx wrangler deploy -c frontend-admin/wrangler.jsonc', { cwd: rootDir, stdio: 'inherit' });

  // 3. Deploy ota-partner (dedicated worker host)
  console.log('\n☁️ [3/3] Triggering Wrangler deploy for Partner Extranet (ota-partner)...');
  execSync('npx wrangler deploy -c frontend-partner/wrangler.jsonc', { cwd: rootDir, stdio: 'inherit' });

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
