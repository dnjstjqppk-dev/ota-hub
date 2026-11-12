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

# 2. Create a FRESH database and import the last verified good backup there.
#    (#54: never execute a backup file against the live database — a partial
#    import on top of corrupted state destroys the only copy of both.)
STAMP=$(date +%Y%m%d_%H%M%S)
npx wrangler d1 create ota_production_restore_${STAMP}
npx wrangler d1 execute ota_production_restore_${STAMP} --remote --file=backup/d1_backup_LATEST_STABLE.sql

# 3. Verify the restored copy BEFORE touching production bindings:
npx wrangler d1 execute ota_production_restore_${STAMP} --remote --command "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM bookings) AS bookings, (SELECT COUNT(*) FROM marketplace_order_settlements) AS settlements;"
# Compare against the incident-time counts from step 1's snapshot.

# 4. Rebind production to the restored database: copy the new database_id
#    from the `d1 create` output into wrangler.jsonc (d1_databases[0]),
#    then redeploy all three portals:
node scripts/build-and-deploy.js

# 5. Confirm health, then keep the corrupted database for forensics.
#    Delete it only after the postmortem window closes:
#    npx wrangler d1 delete ota_production
curl -s https://ota-hub.dnjstjqppk.workers.dev/api/v1/health
```

---

## 4. Emergency Stop (No Maintenance Env Exists)

(#55: there is no `maintenance` env in any wrangler config and no maintenance
page in the codebase — the old `--env maintenance` command never ran. Until a
real maintenance mode is built, the emergency stop is an instant rollback:)

```bash
# 1. Roll back to the last verified stable version (see §2 for version IDs):
npx wrangler rollback [PREVIOUS_STABLE_VERSION_ID] --message "SRE Emergency Stop"

# 2. If the bad version is a data-corruption source (not just bad code),
#    freeze the kill-switches first via the admin console or API:
#    - Partner product registration:  PATCH /api/v1/admin/feature-flags/PARTNER_SELF_PRODUCT_REGISTRATION {"is_enabled": false}
#    - Affected sales channel:        PATCH /api/v1/admin/feature-flags/MARKETPLACE_3P_PARTNER {"is_enabled": false}
#      (or MARKETPLACE_1P_DIRECT / CONSIGNMENT_SALES — see worker/src/routes/marketplace.ts)
#    - Partner URL ingestion:         PATCH /api/v1/admin/feature-flags/PARTNER_URL_INGESTION {"is_enabled": false}
```

Then monitor `GET /api/v1/health` (note the `checks.cron` heartbeat age) and
`GET /api/v1/admin/reconciliation` for ledger damage before re-deploying.

---

## 5. High-Entropy Secret & Key Rotation Procedure

(#55: no `HMAC_SECRET` exists anywhere in code or config — webhook secrets are
per-partner rows, not a worker secret. Rotate each real secret at its source:)

1. JWT signing secret (all sessions/tokens):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
   ```
   All issued tokens invalidate on next deploy. Users re-log in; no DB change.
2. Partner webhook secret (per partner, OWNER only):
   ```bash
   # As the partner OWNER (rotates webhook_secret server-side, 10/hour limit):
   curl -s -X POST https://ota-hub.dnjstjqppk.workers.dev/api/v1/partner/webhook/rotate \
     -H "Authorization: Bearer $PARTNER_OWNER_TOKEN"
   ```
   Then update the partner's receiver to the new secret from the response.
3. Affiliate postback secret (per partner, admin):
   ```bash
   # 24+ chars; write-only (never readable back):
   curl -s -X PATCH https://ota-hub.dnjstjqppk.workers.dev/api/v1/admin/affiliate/partners/<partner_id> \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
     -d '{"secretKey": "<NEW_24PLUS_CHAR_SECRET>"}'
   ```
   Or rotate from the admin console Affiliate registry tab.
4. Run the post-deploy smoke and the read-only verify to ensure zero disruption:
   ```bash
   node scripts/smoke-production.js
   BASE_URL=https://ota-hub.dnjstjqppk.workers.dev VERIFY_ACK_PROD=1 TEST_ADMIN_PASSWORD='...' VERIFY_ALLOW_SKIP=1 node scripts/verify-production.js
   ```

---

## 6. Post-Rollback Verification Checklist

- [ ] Health check `GET /api/v1/health` returns `200 OK` with database status `healthy`.
- [ ] Admin RBAC verified: Non-admin users cannot access `/api/v1/admin/*`.
- [ ] IDOR check: Users cannot view bookings belonging to others.
- [ ] Webhook HMAC verification active: Invalid signatures return `401/403`.
- [ ] Run full automated test suite against production with explicit ack (Must be 41/41 PASS):
  `BASE_URL=https://ota-hub.dnjstjqppk.workers.dev VERIFY_ACK_PROD=1 TEST_ADMIN_PASSWORD='...' node scripts/verify-production.js`.
- [ ] SRE incident postmortem filed within 24 hours.

