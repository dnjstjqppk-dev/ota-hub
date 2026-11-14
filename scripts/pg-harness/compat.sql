-- scripts/pg-harness/compat.sql
-- SQLite-compat helpers for the TG-09 Postgres proof. The D1 shim keeps
-- worker SQL untouched; these functions preserve SQLite semantics in PG.
-- TEXT date columns stay TEXT (ISO strings) so every comparison keeps its
-- SQLite meaning. No production traffic uses this file (local proof only).

-- gft_now(): CURRENT_TIMESTAMP with SQLite TEXT semantics.
CREATE OR REPLACE FUNCTION gft_now() RETURNS text AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$ LANGUAGE sql STABLE;

-- strftime(): the exact subset the worker uses (single format, 'now' base,
-- 0-1 modifier). Anything else fails LOUD so new patterns get ported openly.
CREATE OR REPLACE FUNCTION strftime(fmt text, base text, modifier text DEFAULT NULL)
RETURNS text AS $$
DECLARE
  ts timestamptz := now();
BEGIN
  IF fmt != '%Y-%m-%dT%H:%M:%fZ' OR base != 'now' THEN
    RAISE EXCEPTION 'unsupported strftime call: % / %', fmt, base;
  ELSIF modifier IS NULL THEN
    ts := now();
  ELSIF modifier = '-10 minutes' THEN ts := now() - interval '10 minutes';
  ELSIF modifier = '-7 days' THEN ts := now() - interval '7 days';
  ELSIF modifier = '-30 days' THEN ts := now() - interval '30 days';
  ELSIF modifier = '-90 days' THEN ts := now() - interval '90 days';
  ELSE RAISE EXCEPTION 'unsupported strftime modifier: %', modifier;
  END IF;
  RETURN to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
END;
$$ LANGUAGE plpgsql STABLE;
