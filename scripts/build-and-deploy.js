// scripts/build-and-deploy.js
/**
 * getfortrip Platform - Automated Rebuild & Deploy Pipeline
 * ==============================================================================
 * 1. Builds Vue 3 Admin Console (frontend-admin/dist)
 * 2. Prerenders Nuxt 3 User SPA (frontend-user/.output/public)
 * 3. Integrates Admin SPA into public/admin
 * 4. Deploys Worker & Assets to Cloudflare Edge
 * ==============================================================================
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('==============================================================================');
console.log('⚡ [getfortrip] Automated Cloudflare Rebuild & Deploy Pipeline');
console.log('==============================================================================\n');

try {
  // 1. Build Admin Console
  console.log('📦 [1/4] Building frontend-admin (Vue 3 Console)...');
  execSync('npm run build:admin', { cwd: rootDir, stdio: 'inherit' });

  // 2. Build User App
  console.log('\n📦 [2/4] Generating frontend-user (Nuxt 3 SPA / Prerender)...');
  execSync('npm run build:user', { cwd: rootDir, stdio: 'inherit' });

  // 3. Merge Admin dist into user public/admin
  console.log('\n🔄 [3/4] Integrating frontend-admin dist into frontend-user/.output/public/admin...');
  const adminDist = path.join(rootDir, 'frontend-admin', 'dist');
  const targetAdmin = path.join(rootDir, 'frontend-user', '.output', 'public', 'admin');
  
  if (!fs.existsSync(adminDist)) {
    throw new Error(`Admin build artifact not found at: ${adminDist}`);
  }
  
  fs.cpSync(adminDist, targetAdmin, { recursive: true });
  console.log('  ✅ Admin SPA integrated into public/admin successfully.');

  // 4. Deploy to Cloudflare Workers
  console.log('\n☁️ [4/4] Deploying to Cloudflare Workers (ota-hub)...');
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
