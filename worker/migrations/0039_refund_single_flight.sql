-- 0039 (P2a #73): one in-flight refund per booking.
--
-- Two concurrent refund starts (auto + admin, double-click, cron + cancel)
-- used to INSERT two PENDING rows and pay twice at the PG: the guard was
-- per-row status checks, and the PG call happens before the guarded batch.
-- A partial unique index makes the second INSERT fail fast (mapped to 409
-- REFUND_IN_PROGRESS at the four PENDING-insert sites) before any money moves.
-- Sequential partials are unaffected: a row leaves PENDING before the next
-- one is created. EXTERNAL rows are born SUCCEEDED and never match the index.
--
-- Operator pre-check (run before applying to a live database):
--   SELECT booking_id, COUNT(*) c FROM refunds WHERE status = 'PENDING'
--   GROUP BY booking_id HAVING c > 1;
-- Expect zero rows. If any exist, resolve (let one finish, expire the dup)
-- before applying — the index creation itself will fail otherwise.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_one_pending
  ON refunds (booking_id) WHERE status = 'PENDING';
