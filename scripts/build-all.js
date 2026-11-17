// scripts/build-all.js
/**
 * getfortrip Platform - Full Workspace Build Pipeline (3 Portals)
 * ==============================================================================
 * 1. Builds Vue 3 Admin Console (frontend-admin/dist)
 * 2. Builds Vue 3 Partner Extranet (frontend-partner/dist)
 * 3. Builds Nuxt User App SSR worker (frontend-user/.output: server + public)
 * 4. Stages Admin SPA into hub-assets/admin + Partner SPA into hub-assets/partner
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

  // 3. Build User App (TG-15: Nitro cloudflare preset + ISR — `nuxt build`
  // emits .output/server (ota-user worker) + .output/public. No SEO snapshot:
  // catalog renders on demand, and /sitemap.xml already reads D1 live.)
  console.log('\n📦 [3/4] Building frontend-user (Nuxt SSR / ISR)...');
  execSync('npm --prefix frontend-user run build', { cwd: rootDir, stdio: 'inherit' });

  // 4. Stage the hub assets: admin + partner SPAs under hub-assets/ for the
  // ota-hub /admin/ + /partner/ fallbacks (TG-15: the hub no longer serves the
  // user portal — apex moves to ota-user). hub-assets/index.html is committed.
  console.log('\n🔄 [4/4] Staging console SPAs into hub-assets/ for fallback routing...');
  const adminDist = path.join(rootDir, 'frontend-admin', 'dist');
  const partnerDist = path.join(rootDir, 'frontend-partner', 'dist');
  const hubAssets = path.join(rootDir, 'hub-assets');
  const targetAdmin = path.join(hubAssets, 'admin');
  const targetPartner = path.join(hubAssets, 'partner');

  if (!fs.existsSync(adminDist)) throw new Error(`Admin build artifact not found at: ${adminDist}`);
  if (!fs.existsSync(partnerDist)) throw new Error(`Partner build artifact not found at: ${partnerDist}`);
  if (!fs.existsSync(path.join(hubAssets, 'index.html'))) throw new Error(`Hub landing missing at: ${hubAssets}/index.html`);

  fs.rmSync(targetAdmin, { recursive: true, force: true });
  fs.rmSync(targetPartner, { recursive: true, force: true });
  fs.cpSync(adminDist, targetAdmin, { recursive: true });
  fs.cpSync(partnerDist, targetPartner, { recursive: true });
  console.log('  ✅ Admin & Partner SPAs staged into hub-assets/ successfully.\n');

  console.log('✨ All 3 portals ready for Cloudflare deployment!\n');
} catch (err) {
  console.error('\n❌ [ERROR] Build pipeline failed:');
  console.error(err.message);
  process.exit(1);
}
