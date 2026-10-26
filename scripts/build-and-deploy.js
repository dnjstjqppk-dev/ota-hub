// scripts/build-and-deploy.js
/**
 * getfortrip Platform - Automated Rebuild & Deploy Pipeline
 * ==============================================================================
 * Triggers full workspace build and deployment to Cloudflare Edge
 * ==============================================================================
 */

const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('==============================================================================');
console.log('⚡ [getfortrip] Automated Cloudflare Rebuild & Deploy Pipeline');
console.log('==============================================================================\n');

try {
  // Wrangler deploy automatically executes build.command (node scripts/build-all.js)
  console.log('☁️ Triggering Wrangler build and deploy (ota-hub)...');
  execSync('npx wrangler deploy', { cwd: rootDir, stdio: 'inherit' });

  console.log('\n==============================================================================');
  console.log('🎉 [SUCCESS] getfortrip platform successfully rebuilt and deployed to Cloudflare!');
  console.log('   Endpoint: https://ota-hub.dnjstjqppk.workers.dev');
  console.log('==============================================================================\n');
} catch (err) {
  console.error('\n❌ [ERROR] Cloudflare build & deploy pipeline failed:');
  console.error(err.message);
  process.exit(1);
}
