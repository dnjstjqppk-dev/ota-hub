# getfortrip SRE Deployment & Rollback Runbook

**Document ID:** GFT-SRE-RB-20261018  
**Scope:** Production Cloudflare Workers & D1 Database  
**Author:** getfortrip DevOps & SRE Team  
**Target Architecture:** Edge Worker (`ota-hub`), D1 (`ota_production`), Frontends (Nuxt 3 / Vue 3)  
**Status:** ACTIVE STANDARD OPERATING PROCEDURE (SOP)

---

## 1. Rollback Trigger Criteria

An immediate rollback or emergency incident response MUST be initiated if any of the following occur:
1. **P0 Security Incident:** Unauthorized access, authentication bypass, or data leakage observed.
2. **5xx Error Surge:** HTTP 5xx rate exceeds 1.0% over a 3-minute moving window.
3. **Database Write Failure:** D1 write queries fail consecutively for more than 60 seconds.
4. **Attribution Disruption:** Outbound affiliate redirect failure rate exceeds 0.5%.

---

## 2. Cloudflare Worker Instant Rollback

Cloudflare Workers maintain immutable deployments with version IDs. Rollbacks execute instantly at the global edge without rebuild delays.

### Step 2.1: Inspect Recent Deployment Versions
```bash
npx wrangler versions list
```

### Step 2.2: Execute Instant Version Rollback
To rollback to the last verified stable version:
```bash
# Rollback to specific stable Version ID
npx wrangler rollback [PREVIOUS_STABLE_VERSION_ID] --message "SRE Emergency Rollback"
```

### Step 2.3: Edge Verification
```bash
# Verify live edge status immediately
curl -s -I https://ota-hub.dnjstjqppk.workers.dev/api/v1/health
```

---

## 3. Cloudflare D1 Database Backup & Restoration

### Step 3.1: D1 Automated & Manual Backup
```bash
# Create an on-demand SQL snapshot of the production database
npx wrangler d1 export ota_production --remote --output backup/d1_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 3.2: D1 Point-in-Time Restoration
```bash
# In the event of schema or data corruption:
# 1. Take a snapshot of the corrupted state for forensic analysis
npx wrangler d1 export ota_production --remote --output backup/d1_corrupted_state.sql

# 2. Restore from the last verified good backup snapshot
npx wrangler d1 execute ota_production --remote --file=backup/d1_backup_LATEST_STABLE.sql
```

---

## 4. Emergency Maintenance Mode Switch

If a critical zero-day vulnerability is detected, activate Maintenance Mode immediately:

```bash
# In wrangler.jsonc or via Cloudflare Dashboard:
# Route incoming traffic to static maintenance page:
npx wrangler deploy --env maintenance
```

Maintenance Mode returns HTTP 503 with a branded `getfortrip` scheduled maintenance banner.

---

## 5. High-Entropy Secret & Key Rotation Procedure

If JWT secret or partner HMAC webhook secret is suspected to be compromised:
1. Generate new 64-character high-entropy secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update Worker secret via Wrangler CLI:
   ```bash
   echo "NEW_SECRET_VALUE" | npx wrangler secret put JWT_SECRET
   echo "NEW_HMAC_SECRET" | npx wrangler secret put HMAC_SECRET
   ```
3. Update `affiliate_partners_config` in D1 with the rotated partner secret.
4. Run `node scripts/verify-production.js` to ensure zero disruption.

---

## 6. Post-Rollback Verification Checklist

- [ ] Health check `GET /api/v1/health` returns `200 OK` with database status `healthy`.
- [ ] Admin RBAC verified: Non-admin users cannot access `/api/v1/admin/*`.
- [ ] IDOR check: Users cannot view bookings belonging to others.
- [ ] Webhook HMAC verification active: Invalid signatures return `401/403`.
- [ ] Run full automated test suite: `node scripts/verify-production.js` (Must be 22/22 PASS).
- [ ] SRE incident postmortem filed within 24 hours.
