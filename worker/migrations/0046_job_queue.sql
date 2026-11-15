-- TG-11: durable job queue for fulfilment sagas (supplier book/ticket
-- retries with backoff, compensation, and dead-letter audit). Pumped by
-- runMaintenance (5-min cron + admin endpoint).
--
-- No FK clauses (D1 never enforced them; the PG porter drops them): jobs
-- reference bookings by id and re-validate at dispatch, so a job for a
-- moved-on booking completes stale instead of corrupting anything.
CREATE TABLE IF NOT EXISTS job_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TEXT NOT NULL,
  claimed_at TEXT,
  claimed_by TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_job_queue_due ON job_queue (status, available_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_booking ON job_queue (booking_id);
