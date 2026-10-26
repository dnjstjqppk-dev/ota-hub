// scripts/build-all.js
/**
 * getfortrip Platform - Full Workspace Build Pipeline
 * ==============================================================================
 * 1. Builds Vue 3 Admin Console (frontend-admin/dist)
 * 2. Prerenders Nuxt 3 User App (frontend-user/.output/public)
 * 3. Integrates Admin SPA into public/admin
 * ==============================================================================
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('==============================================================================');
console.log('⚡ [getfortrip] Running Full Workspace Build Pipeline');
console.log('==============================================================================\n');

try {
  // 1. Build Admin Console
  console.log('📦 [1/3] Building frontend-admin (Vue 3 Console)...');
  const adminNodeModules = path.join(rootDir, 'frontend-admin', 'node_modules');
  const rootNodeModules = path.join(rootDir, 'node_modules');
  const adminCmd = (fs.existsSync(adminNodeModules) || fs.existsSync(rootNodeModules))
    ? 'npm --prefix frontend-admin run build'
    : 'npm --prefix frontend-admin install && npm --prefix frontend-admin run build';
  execSync(adminCmd, { cwd: rootDir, stdio: 'inherit' });

  // 2. Build User App
  console.log('\n📦 [2/3] Generating frontend-user (Nuxt 3 SPA / Prerender)...');
  execSync('npm --prefix frontend-user run generate', { cwd: rootDir, stdio: 'inherit' });

  // 3. Merge Admin dist into user public/admin
  console.log('\n🔄 [3/3] Integrating frontend-admin dist into frontend-user/.output/public/admin...');
  const adminDist = path.join(rootDir, 'frontend-admin', 'dist');
  const targetAdmin = path.join(rootDir, 'frontend-user', '.output', 'public', 'admin');
  
  if (!fs.existsSync(adminDist)) {
    throw new Error(`Admin build artifact not found at: ${adminDist}`);
  }
  
  fs.cpSync(adminDist, targetAdmin, { recursive: true });
  console.log('  ✅ Admin SPA integrated into public/admin successfully.\n');
  console.log('✨ All assets ready in frontend-user/.output/public for Cloudflare deployment!\n');
} catch (err) {
  console.error('\n❌ [ERROR] Build pipeline failed:');
  console.error(err.message);
  process.exit(1);
}

