// scripts/build-all.js
/**
 * getfortrip Platform - Full Workspace Build Pipeline (3 Portals)
 * ==============================================================================
 * 1. Builds Vue 3 Admin Console (frontend-admin/dist)
 * 2. Builds Vue 3 Partner Extranet (frontend-partner/dist)
 * 3. Prerenders Nuxt 3 User App (frontend-user/.output/public)
 * 4. Integrates Admin SPA into public/admin
 * 5. Integrates Partner SPA into public/partner
 * ==============================================================================
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('==============================================================================');
console.log('⚡ [getfortrip] Running Full Workspace Build Pipeline (3 Portals)');
console.log('==============================================================================\n');

try {
  // 1. Build Admin Console
  console.log('📦 [1/4] Building frontend-admin (Vue 3 Console)...');
  const adminNodeModules = path.join(rootDir, 'frontend-admin', 'node_modules');
  const rootNodeModules = path.join(rootDir, 'node_modules');
  const adminCmd = (fs.existsSync(adminNodeModules) || fs.existsSync(rootNodeModules))
    ? 'npm --prefix frontend-admin run build'
    : 'npm --prefix frontend-admin install && npm --prefix frontend-admin run build';
  execSync(adminCmd, { cwd: rootDir, stdio: 'inherit' });

  // 2. Build Partner Extranet
  console.log('\n📦 [2/4] Building frontend-partner (Vue 3 Extranet)...');
  const partnerNodeModules = path.join(rootDir, 'frontend-partner', 'node_modules');
  const partnerCmd = (fs.existsSync(partnerNodeModules) || fs.existsSync(rootNodeModules))
    ? 'npm --prefix frontend-partner run build'
    : 'npm --prefix frontend-partner install && npm --prefix frontend-partner run build';
  execSync(partnerCmd, { cwd: rootDir, stdio: 'inherit' });

  // 3. Build User App
  console.log('\n📦 [3/4] Generating frontend-user (Nuxt 3 SPA / Prerender)...');
  execSync('npm --prefix frontend-user run generate', { cwd: rootDir, stdio: 'inherit' });

  // 4. Merge Admin dist into user public/admin & Partner dist into user public/partner
  console.log('\n🔄 [4/4] Integrating SPAs into public/admin & public/partner for fallback routing...');
  const adminDist = path.join(rootDir, 'frontend-admin', 'dist');
  const partnerDist = path.join(rootDir, 'frontend-partner', 'dist');
  const targetAdmin = path.join(rootDir, 'frontend-user', '.output', 'public', 'admin');
  const targetPartner = path.join(rootDir, 'frontend-user', '.output', 'public', 'partner');
  
  if (!fs.existsSync(adminDist)) throw new Error(`Admin build artifact not found at: ${adminDist}`);
  if (!fs.existsSync(partnerDist)) throw new Error(`Partner build artifact not found at: ${partnerDist}`);

  // Dual-mount self copies for relative & prefixed routing on dedicated worker hosts
  const adminSelfSub = path.join(adminDist, 'admin');
  if (!fs.existsSync(adminSelfSub)) fs.mkdirSync(adminSelfSub, { recursive: true });
  fs.cpSync(adminDist, adminSelfSub, { recursive: true, filter: (src) => !src.includes(path.sep + 'admin') });

  const partnerSelfSub = path.join(partnerDist, 'partner');
  if (!fs.existsSync(partnerSelfSub)) fs.mkdirSync(partnerSelfSub, { recursive: true });
  fs.cpSync(partnerDist, partnerSelfSub, { recursive: true, filter: (src) => !src.includes(path.sep + 'partner') });
  
  fs.cpSync(adminDist, targetAdmin, { recursive: true });
  fs.cpSync(partnerDist, targetPartner, { recursive: true });
  console.log('  ✅ Admin & Partner SPAs integrated into public/ successfully.\n');
  
  // Ensure .gitkeep is preserved
  fs.writeFileSync(path.join(rootDir, 'frontend-user', '.output', 'public', '.gitkeep'), '');

  console.log('✨ All 3 portals ready for Cloudflare deployment!\n');
} catch (err) {
  console.error('\n❌ [ERROR] Build pipeline failed:');
  console.error(err.message);
  process.exit(1);
}
