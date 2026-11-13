# worker/migrations — D1 migration discipline

## Why ALTERs carry no IF NOT EXISTS (#148)

SQLite has no `ALTER TABLE … IF NOT EXISTS` (it exists only for
`CREATE TABLE/INDEX`). Rerun safety comes from once-only tracked
application instead:

- `wrangler d1 migrations apply` records every applied file in the
  `d1_migrations` journal — an applied migration never runs again,
  so a duplicate `ADD COLUMN` cannot happen through the normal path.
- The deploy pipeline (`scripts/build-and-deploy.js` step 0) uses the
  same tracked apply and aborts the deploy when it fails.
- `CREATE TABLE/INDEX` statements still use `IF NOT EXISTS` (supported
  and harmless); `ALTER TABLE … ADD COLUMN` intentionally does not.

## Rules for new migrations

- Never edit an applied migration — add a new numbered file.
- New tables: `CREATE TABLE IF NOT EXISTS` + `IF NOT EXISTS` indexes.
- Data fixes must be idempotent (`INSERT OR IGNORE`, conditional
  `UPDATE`) so a half-applied file can be understood, never re-run.
- Every migration is exercised by a fresh-DB E2E run before merge.
