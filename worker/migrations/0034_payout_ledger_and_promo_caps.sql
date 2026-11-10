-- 0034: payout + recovery-claim ledger accounts, promotion redemption caps.
--
-- #17: settlement payouts never journaled, so SUPPLIER_PAYABLE only grew.
-- Payouts now post Dr SUPPLIER_PAYABLE / Cr OPERATING_CASH (net bank transfer),
-- and the recovery-offset slice posts Cr SELLER_CLAIM_RECEIVABLE against the
-- claim raised (Dr) when a post-payout refund is recorded.
-- #14: promotions gain an optional total-redemption cap (usage_limit/used_count).
--
-- SQLite CHECK constraints are immutable, so the ledger table is rebuilt. The
-- append-only triggers are dropped first and recreated after the rename.

DROP TRIGGER IF EXISTS trg_ledger_no_update;
DROP TRIGGER IF EXISTS trg_ledger_no_delete;

CREATE TABLE ledger_entries_new (
    id TEXT PRIMARY KEY,
    journal_id TEXT NOT NULL,
    booking_id TEXT,
    entity_id TEXT NOT NULL,
    supplier_id TEXT,
    account TEXT NOT NULL CHECK (account IN (
        'PG_CLEARING', 'CUSTOMER_DEPOSITS', 'SUPPLIER_PAYABLE', 'COMMISSION_REVENUE',
        'CANCELLATION_FEE_REVENUE', 'PROMOTION_EXPENSE', 'OPERATING_CASH',
        'SELLER_CLAIM_RECEIVABLE')),
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL,
    event_type TEXT NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO ledger_entries_new
    (id, journal_id, booking_id, entity_id, supplier_id, account, direction,
     amount_minor, currency, event_type, reference_id, created_at)
SELECT id, journal_id, booking_id, entity_id, supplier_id, account, direction,
       amount_minor, currency, event_type, reference_id, created_at
FROM ledger_entries;

DROP TABLE ledger_entries;
ALTER TABLE ledger_entries_new RENAME TO ledger_entries;

CREATE INDEX IF NOT EXISTS idx_ledger_booking ON ledger_entries (booking_id);
CREATE INDEX IF NOT EXISTS idx_ledger_journal ON ledger_entries (journal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_event_once ON ledger_entries (booking_id, event_type, reference_id, account, direction) WHERE booking_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_ledger_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'LEDGER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'LEDGER_APPEND_ONLY'); END;

ALTER TABLE promotions ADD COLUMN usage_limit INTEGER;
ALTER TABLE promotions ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0;
